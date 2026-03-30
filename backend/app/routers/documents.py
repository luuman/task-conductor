"""
文档管理路由
- GET  /api/projects/{project_id}/documents        → 项目所有文档 + 关系（知识图谱用）
- GET  /api/tasks/{task_id}/documents              → 任务文档列表
- POST /api/tasks/{task_id}/documents              → 创建文档（含初始内容）
- GET  /api/documents/{doc_id}/content             → 读取文件内容
- PUT  /api/documents/{doc_id}/content             → 保存内容 + 解析 MD 链接
- DELETE /api/documents/{doc_id}                   → 删除文档（含文件）
- PUT  /api/documents/{doc_id}/position            → 更新 React Flow 节点坐标
- POST /api/documents/links                        → 手动创建关系边
- DELETE /api/documents/links/{link_id}            → 删除关系边
"""
import os
import re
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import engine
from ..models import Document, DocumentLink, Project, Task

router = APIRouter(prefix="/api", tags=["documents"])


def get_db():
    with Session(engine) as s:
        yield s


# ── 工具函数 ──────────────────────────────────────────────────

def _make_slug(title: str) -> str:
    """将任务标题转为 URL-safe slug，最多 30 字符"""
    slug = re.sub(r'[^\w\s-]', '', title.lower())
    slug = re.sub(r'[\s_]+', '-', slug)
    return slug[:30].strip('-') or 'task'


def _safe_file_path(project_cwd: str, rel_path: str) -> str:
    """验证拼接后的路径仍在 project_cwd 内，防止路径穿越攻击"""
    abs_path = os.path.normpath(os.path.join(project_cwd, rel_path))
    if not abs_path.startswith(os.path.normpath(project_cwd)):
        raise HTTPException(400, "Invalid file path")
    return abs_path


def _task_doc_dir(project_cwd: str, task_id: int, task_title: str) -> str:
    slug = _make_slug(task_title)
    return os.path.join(project_cwd, "docs", "tasks", f"{task_id}-{slug}")


def _parse_md_links(content: str, file_abs_path: str, project_cwd: str) -> list[str]:
    """
    解析 Markdown 内链，返回被引用文件的绝对路径列表。
    只处理相对路径且在 project_cwd 内的 .md 文件。
    """
    pattern = r'\[([^\]]*)\]\(([^)]+\.md)\)'
    matches = re.findall(pattern, content)
    result = []
    current_dir = os.path.dirname(file_abs_path)
    for _, href in matches:
        if href.startswith(('http://', 'https://', '/')):
            continue
        abs_path = os.path.normpath(os.path.join(current_dir, href))
        if abs_path.startswith(project_cwd):
            result.append(abs_path)
    return result


def _sync_auto_links(doc: Document, linked_abs_paths: list[str],
                      project_cwd: str, db: Session) -> None:
    """
    根据解析到的文件路径同步 auto=True 的 DocumentLink。
    先删除旧的 auto 链接，再批量插入新的。
    """
    db.query(DocumentLink).filter(
        DocumentLink.source_id == doc.id,
        DocumentLink.auto == True
    ).delete()

    for abs_path in linked_abs_paths:
        rel = os.path.relpath(abs_path, project_cwd)
        target = db.query(Document).filter(
            Document.project_id == doc.project_id,
            Document.file_path == rel
        ).first()
        if target and target.id != doc.id:
            db.add(DocumentLink(
                source_id=doc.id,
                target_id=target.id,
                relation="references",
                auto=True,
            ))
    db.commit()


# ── Pydantic Schemas ──────────────────────────────────────────

class DocumentOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    project_id: int
    task_id: int | None
    title: str
    doc_type: str
    file_path: str
    pos_x: float
    pos_y: float
    created_at: datetime
    updated_at: datetime


class DocumentLinkOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    source_id: int
    target_id: int
    relation: str
    auto: bool


class DocumentCreate(BaseModel):
    title: str
    doc_type: str = "note"
    initial_content: str = ""


class ContentBody(BaseModel):
    content: str


class PositionBody(BaseModel):
    pos_x: float
    pos_y: float


class LinkCreate(BaseModel):
    source_id: int
    target_id: int
    relation: str = "references"


# ── Endpoints ────────────────────────────────────────────────

@router.get("/projects/{project_id}/documents")
def list_project_documents(project_id: int, db: Session = Depends(get_db)):
    """返回项目所有文档和关系，供知识图谱渲染"""
    docs = db.query(Document).filter(Document.project_id == project_id).all()
    doc_ids = [d.id for d in docs]
    links = db.query(DocumentLink).filter(
        DocumentLink.source_id.in_(doc_ids)
    ).all() if doc_ids else []
    return {
        "documents": [DocumentOut.model_validate(d) for d in docs],
        "links": [DocumentLinkOut.model_validate(lk) for lk in links],
    }


@router.get("/tasks/{task_id}/documents")
def list_task_documents(task_id: int, db: Session = Depends(get_db)):
    docs = db.query(Document).filter(Document.task_id == task_id).all()
    return [DocumentOut.model_validate(d) for d in docs]


@router.post("/tasks/{task_id}/documents", status_code=201)
def create_document(task_id: int, body: DocumentCreate, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    project = db.get(Project, task.project_id)
    if not project or not project.repo_url:
        raise HTTPException(400, "Project has no repo_url configured")

    dir_path = _task_doc_dir(project.repo_url, task_id, task.title)
    os.makedirs(dir_path, exist_ok=True)

    file_name = f"{body.doc_type}.md"
    file_abs = os.path.join(dir_path, file_name)
    rel_path = os.path.relpath(file_abs, project.repo_url)

    # 如果文件不存在则写初始内容
    if not os.path.exists(file_abs):
        with open(file_abs, 'w', encoding='utf-8') as f:
            f.write(body.initial_content or f"# {body.title}\n\n")

    doc = Document(
        project_id=task.project_id,
        task_id=task_id,
        title=body.title,
        doc_type=body.doc_type,
        file_path=rel_path,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return DocumentOut.model_validate(doc)


@router.get("/documents/{doc_id}/content")
def get_document_content(doc_id: int, db: Session = Depends(get_db)):
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    project = db.get(Project, doc.project_id)
    if not project or not project.repo_url:
        raise HTTPException(400, "Project has no repo_url configured")
    file_abs = _safe_file_path(project.repo_url, doc.file_path)
    if not os.path.exists(file_abs):
        return {"content": ""}
    with open(file_abs, encoding='utf-8') as f:
        return {"content": f.read()}


@router.put("/documents/{doc_id}/content")
def update_document_content(doc_id: int, body: ContentBody, db: Session = Depends(get_db)):
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    project = db.get(Project, doc.project_id)
    if not project or not project.repo_url:
        raise HTTPException(400, "Project has no repo_url configured")
    file_abs = _safe_file_path(project.repo_url, doc.file_path)

    os.makedirs(os.path.dirname(file_abs), exist_ok=True)
    with open(file_abs, 'w', encoding='utf-8') as f:
        f.write(body.content)

    linked_paths = _parse_md_links(body.content, file_abs, project.repo_url)
    _sync_auto_links(doc, linked_paths, project.repo_url, db)

    doc.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.delete("/documents/{doc_id}", status_code=204)
def delete_document(doc_id: int, db: Session = Depends(get_db)):
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    project = db.get(Project, doc.project_id)
    if not project or not project.repo_url:
        raise HTTPException(400, "Project has no repo_url configured")
    file_abs = _safe_file_path(project.repo_url, doc.file_path)
    if os.path.exists(file_abs):
        os.remove(file_abs)
    # 删除关联的边
    db.query(DocumentLink).filter(
        (DocumentLink.source_id == doc_id) | (DocumentLink.target_id == doc_id)
    ).delete()
    db.delete(doc)
    db.commit()


@router.put("/documents/{doc_id}/position")
def update_position(doc_id: int, body: PositionBody, db: Session = Depends(get_db)):
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    doc.pos_x = body.pos_x
    doc.pos_y = body.pos_y
    db.commit()
    return {"ok": True}


@router.post("/documents/links", status_code=201)
def create_link(body: LinkCreate, db: Session = Depends(get_db)):
    # 避免重复
    exists = db.query(DocumentLink).filter(
        DocumentLink.source_id == body.source_id,
        DocumentLink.target_id == body.target_id,
        DocumentLink.auto == False,
    ).first()
    if exists:
        return DocumentLinkOut.model_validate(exists)
    link = DocumentLink(
        source_id=body.source_id,
        target_id=body.target_id,
        relation=body.relation,
        auto=False,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return DocumentLinkOut.model_validate(link)


@router.delete("/documents/links/{link_id}", status_code=204)
def delete_link(link_id: int, db: Session = Depends(get_db)):
    link = db.get(DocumentLink, link_id)
    if not link:
        raise HTTPException(404, "Link not found")
    db.delete(link)
    db.commit()
