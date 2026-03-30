# Knowledge Base & Document Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为每个任务建立 Markdown 文档系统，文件存储在项目目录 `docs/` 下，通过知识库页面（React Flow 图谱）可视化文档关系，任务详情页内联编辑文档。

**Architecture:** 后端新增 `Document` / `DocumentLink` 两张表，文件以 `.md` 形式存储在 `{project.repo_url}/docs/tasks/{id}-{slug}/` 下；前端提供两个入口：① 知识库页（`/knowledge`）全局 React Flow 图谱，② 任务详情页文档 Tab 内联编辑（飞书风格，点击即编辑）。保存时自动解析 MD 内链，生成 `DocumentLink` 记录。

**Tech Stack:** FastAPI + SQLAlchemy 2.0（后端），React 19 + TanStack Query 5 + @xyflow/react 12 + dagre（前端），CSS Modules

---

## 文件结构速览

```
backend/app/
  models.py                        ← 新增 Document、DocumentLink 类
  main.py                          ← 新增迁移语句 + 注册 documents router
  routers/documents.py             ← 新建：所有文档 CRUD + 文件读写 + MD 链接解析

tauri/src/
  lib/api/types.ts                 ← 新增 Document、DocumentLink 类型
  lib/api/http.ts                  ← 新增文档相关 API 方法
  features/knowledge/
    index.tsx                      ← 新建：知识库页（React Flow 图谱）
    knowledge.module.css           ← 新建
    components/
      DocNode.tsx                  ← 新建：React Flow 自定义节点
      DocNode.module.css           ← 新建
  features/task-detail/
    components/
      DocumentSection.tsx          ← 新建：任务文档 Tab + 内联编辑器
      DocumentSection.module.css   ← 新建
      DocumentEditor.tsx           ← 新建：飞书风格点击编辑 + Markdown 渲染
      DocumentEditor.module.css    ← 新建
    index.tsx                      ← 修改：替换 RequirementWorkspace → DocumentSection
  app/Router.tsx                   ← 修改：/knowledge 路由指向 KnowledgePage
```

---

## 文档目录约定

```
{project.repo_url}/
└── docs/
    ├── _project/           ← 项目级文档（task_id = null）
    │   ├── overview.md
    │   └── architecture.md
    └── tasks/
        └── {task_id}-{slug}/     ← 每个任务一个目录
            ├── requirements.md   ← input 阶段
            ├── research.md       ← discovery 阶段
            ├── prd.md            ← prd 阶段
            ├── architecture.md   ← architecture 阶段
            ├── ui-spec.md        ← ui 阶段
            ├── dev-plan.md       ← plan 阶段
            └── test-plan.md      ← test 阶段
```

**doc_type 枚举**：`requirements` / `research` / `prd` / `architecture` / `ui-spec` / `dev-plan` / `test-plan` / `note`

**relation 枚举**：`derived_from` / `depends_on` / `references` / `contradicts`

---

## Task 1: 后端 — Document + DocumentLink 模型

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: 在 models.py 末尾追加两个新模型**

在 `backend/app/models.py` 末尾（`ProjectKnowledge` 类之后）追加：

```python
class Document(Base):
    """任务关联的 Markdown 文档，对应本地 .md 文件"""
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    task_id: Mapped[Optional[int]] = mapped_column(ForeignKey("tasks.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    doc_type: Mapped[str] = mapped_column(String(50))
    # requirements/research/prd/architecture/ui-spec/dev-plan/test-plan/note
    file_path: Mapped[str] = mapped_column(String(500))
    # 相对于 project.repo_url 的路径，如 docs/tasks/1-my-task/requirements.md
    pos_x: Mapped[float] = mapped_column(Float, default=0.0)
    pos_y: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DocumentLink(Base):
    """两篇文档之间的关系边（来自 MD 内链解析或用户手动连线）"""
    __tablename__ = "document_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), index=True)
    target_id: Mapped[int] = mapped_column(ForeignKey("documents.id"))
    relation: Mapped[str] = mapped_column(String(50), default="references")
    # derived_from / depends_on / references / contradicts
    auto: Mapped[bool] = mapped_column(Boolean, default=False)
    # True = 从 MD 链接自动解析，False = 用户手动连线
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 2: 在 main.py 的迁移列表中追加两条 CREATE TABLE**

找到 `main.py` 中的 `for col_sql in [` 块（约第 70 行），在列表**末尾**追加（注意这里用 CREATE TABLE，因为是新表，不是 ALTER）。

在迁移 `for col_sql` 循环**之后**、`Base.metadata.create_all` **之前**，找到如下结构：

```python
    for col_sql in [
        ...
        "ALTER TABLE tasks ADD COLUMN requirements TEXT",
    ]:
        try:
            ...
```

在该 for 循环**之后**紧接着加：

```python
    # 新表迁移：documents、document_links（已存在则跳过）
    Base.metadata.create_all(bind=engine)
```

实际上 `Base.metadata.create_all` 应该已经在该位置。确认文件中 `Base.metadata.create_all(bind=engine)` 这行存在，若不存在则在迁移 for 循环之后加上这行。`create_all` 会自动创建不存在的新表，不影响已有表。

- [ ] **Step 3: 重启后端验证表已创建**

```bash
cd /home/sichengli/Documents/code2/task-conductor/backend
source .venv/bin/activate
python -c "
from app.database import engine
from sqlalchemy import inspect
inspector = inspect(engine)
print(inspector.get_table_names())
"
```

期望输出包含：`documents`, `document_links`

- [ ] **Step 4: Commit**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add backend/app/models.py backend/app/main.py
git commit -m "feat: add Document + DocumentLink models"
```

---

## Task 2: 后端 — Documents Router（文件 CRUD + MD 链接解析）

**Files:**
- Create: `backend/app/routers/documents.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: 创建 documents.py**

完整内容如下：

```python
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
    file_abs = os.path.join(project.repo_url, doc.file_path)
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
    file_abs = os.path.join(project.repo_url, doc.file_path)

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
    file_abs = os.path.join(project.repo_url, doc.file_path)
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
```

- [ ] **Step 2: 在 main.py 中注册 documents router**

在 `backend/app/main.py` 的 import 区域（约第 19-32 行）找到其他 router import，追加：

```python
from .routers import documents as documents_router
```

在 `app.include_router(ui_nav_router.router)` 这行之后追加：

```python
app.include_router(documents_router.router)   # GET/POST/PUT/DELETE /api/documents, /api/projects/{id}/documents, /api/tasks/{id}/documents
```

- [ ] **Step 3: 重启后端验证接口**

```bash
cd /home/sichengli/Documents/code2/task-conductor/backend
source .venv/bin/activate
uvicorn app.main:app --port 8765 --reload &
sleep 2
# 用已存在的 task_id 测试（替换 1 为实际 ID）
curl -s http://localhost:8765/api/tasks/1/documents | python3 -m json.tool
```

期望输出：`[]` 或包含文档的数组，无 500 错误。

- [ ] **Step 4: Commit**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add backend/app/routers/documents.py backend/app/main.py
git commit -m "feat: add documents router with file CRUD and MD link parser"
```

---

## Task 3: 前端 — Types + HTTP Adapter

**Files:**
- Modify: `tauri/src/lib/api/types.ts`
- Modify: `tauri/src/lib/api/http.ts`

- [ ] **Step 1: 在 types.ts 追加 Document 和 DocumentLink 接口**

在 `tauri/src/lib/api/types.ts` 末尾追加：

```typescript
export interface Document {
  id: number
  project_id: number
  task_id: number | null
  title: string
  doc_type: string   // requirements/research/prd/architecture/ui-spec/dev-plan/test-plan/note
  file_path: string
  pos_x: number
  pos_y: number
  created_at: string
  updated_at: string
}

export interface DocumentLink {
  id: number
  source_id: number
  target_id: number
  relation: string   // derived_from/depends_on/references/contradicts
  auto: boolean
}

export interface ProjectDocumentsResponse {
  documents: Document[]
  links: DocumentLink[]
}
```

还需在 `ApiAdapter` 接口中追加（找到 `interface ApiAdapter {` 的位置）：

```typescript
  // Documents
  getProjectDocuments(projectId: number): Promise<ProjectDocumentsResponse>
  getTaskDocuments(taskId: number): Promise<Document[]>
  createDocument(taskId: number, data: { title: string; doc_type: string; initial_content?: string }): Promise<Document>
  getDocumentContent(docId: number): Promise<{ content: string }>
  updateDocumentContent(docId: number, content: string): Promise<{ ok: boolean }>
  deleteDocument(docId: number): Promise<void>
  updateDocumentPosition(docId: number, pos: { pos_x: number; pos_y: number }): Promise<{ ok: boolean }>
  createDocumentLink(data: { source_id: number; target_id: number; relation: string }): Promise<DocumentLink>
  deleteDocumentLink(linkId: number): Promise<void>
```

- [ ] **Step 2: 在 http.ts 实现这些方法**

在 `tauri/src/lib/api/http.ts` 的 `HttpAdapter` 类中，找到最后一个方法之前，追加：

```typescript
  async getProjectDocuments(projectId: number): Promise<ProjectDocumentsResponse> {
    return this.get(`/api/projects/${projectId}/documents`)
  }

  async getTaskDocuments(taskId: number): Promise<Document[]> {
    return this.get(`/api/tasks/${taskId}/documents`)
  }

  async createDocument(
    taskId: number,
    data: { title: string; doc_type: string; initial_content?: string }
  ): Promise<Document> {
    this.cache.invalidate(`tasks/${taskId}/documents`)
    return this.post(`/api/tasks/${taskId}/documents`, data)
  }

  async getDocumentContent(docId: number): Promise<{ content: string }> {
    return this.get(`/api/documents/${docId}/content`)
  }

  async updateDocumentContent(docId: number, content: string): Promise<{ ok: boolean }> {
    return this.put(`/api/documents/${docId}/content`, { content })
  }

  async deleteDocument(docId: number): Promise<void> {
    return this.delete(`/api/documents/${docId}`)
  }

  async updateDocumentPosition(
    docId: number,
    pos: { pos_x: number; pos_y: number }
  ): Promise<{ ok: boolean }> {
    return this.put(`/api/documents/${docId}/position`, pos)
  }

  async createDocumentLink(data: {
    source_id: number
    target_id: number
    relation: string
  }): Promise<DocumentLink> {
    return this.post(`/api/documents/links`, data)
  }

  async deleteDocumentLink(linkId: number): Promise<void> {
    return this.delete(`/api/documents/links/${linkId}`)
  }
```

注：`http.ts` 中的 `this.get/post/put/delete` 是已有的内部方法。如果 http.ts 中没有 `this.delete` 方法，先在类中添加：

```typescript
  private async delete(path: string): Promise<void> {
    const url = this.baseUrl + path
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.authHeaders(),
    })
    if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`)
  }
```

- [ ] **Step 3: TypeScript 类型检查**

```bash
cd /home/sichengli/Documents/code2/task-conductor/tauri
npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

期望：只有已有的无关错误，无新增 TS 错误。

- [ ] **Step 4: Commit**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/lib/api/types.ts tauri/src/lib/api/http.ts
git commit -m "feat: add Document/DocumentLink types and API adapter methods"
```

---

## Task 4: 前端 — DocumentEditor（内联编辑组件）

**Files:**
- Create: `tauri/src/features/task-detail/components/DocumentEditor.tsx`
- Create: `tauri/src/features/task-detail/components/DocumentEditor.module.css`

内联编辑器：display 模式渲染 Markdown，点击切换为 textarea，失焦自动保存。支持中文 IME。

- [ ] **Step 1: 创建 DocumentEditor.tsx**

```tsx
import { useState, useEffect, useRef, useCallback, type CompositionEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import styles from './DocumentEditor.module.css'

interface Props {
  docId: number
  title: string
  onTitleChange?: (title: string) => void
}

/** 极简 Markdown → HTML 转换（无第三方库） */
function renderMd(md: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return md
    .split('\n')
    .map(line => {
      const escaped = escape(line)
      if (/^### /.test(line)) return `<h3>${escaped.slice(4)}</h3>`
      if (/^## /.test(line)) return `<h2>${escaped.slice(3)}</h2>`
      if (/^# /.test(line)) return `<h1>${escaped.slice(2)}</h1>`
      if (/^- /.test(line)) return `<li>${escaped.slice(2)}</li>`
      if (/^\d+\. /.test(line)) return `<li>${escaped.replace(/^\d+\. /, '')}</li>`
      if (line.trim() === '') return '<br/>'
      return `<p>${escaped
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      }</p>`
    })
    .join('')
}

export function DocumentEditor({ docId, title }: Props) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const composingRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['doc-content', docId],
    queryFn: () => api.getDocumentContent(docId),
  })

  const saveMut = useMutation({
    mutationFn: (content: string) => api.updateDocumentContent(docId, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doc-content', docId] }),
  })

  useEffect(() => {
    if (data?.content !== undefined) setDraft(data.content)
  }, [data?.content])

  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [])

  const debouncedSave = useCallback((content: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveMut.mutate(content), 800)
  }, [saveMut])

  function handleChange(value: string) {
    setDraft(value)
    debouncedSave(value)
  }

  function handleBlur() {
    setEditing(false)
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveMut.mutate(draft)
    }
  }

  if (isLoading) return <div className={styles.loading}>加载中…</div>

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar}>
        <span className={styles.docTitle}>{title}</span>
        {saveMut.isPending && <span className={styles.saving}>保存中…</span>}
        {!editing && (
          <button className={styles.editBtn} onClick={() => setEditing(true)}>
            编辑
          </button>
        )}
      </div>

      {editing ? (
        <textarea
          className={styles.textarea}
          value={draft}
          autoFocus
          onCompositionStart={() => { composingRef.current = true }}
          onCompositionEnd={(e: CompositionEvent<HTMLTextAreaElement>) => {
            composingRef.current = false
            handleChange(e.currentTarget.value)
          }}
          onChange={e => {
            if (composingRef.current) return
            handleChange(e.target.value)
          }}
          onBlur={handleBlur}
        />
      ) : (
        <div
          className={styles.preview}
          onClick={() => setEditing(true)}
          dangerouslySetInnerHTML={{ __html: draft ? renderMd(draft) : '<p class="placeholder">点击开始编辑…</p>' }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: 创建 DocumentEditor.module.css**

```css
.editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--tc-bg-primary);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--tc-border);
  min-height: 40px;
}

.docTitle {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--tc-text-primary);
}

.saving {
  font-size: 11px;
  color: var(--tc-text-tertiary);
}

.editBtn {
  padding: 3px 10px;
  font-size: 12px;
  border: 1px solid var(--tc-border);
  border-radius: 4px;
  background: transparent;
  color: var(--tc-text-secondary);
  cursor: pointer;
}
.editBtn:hover {
  background: var(--tc-bg-hover);
}

.textarea {
  flex: 1;
  padding: 16px 20px;
  border: none;
  outline: none;
  resize: none;
  font-family: 'Geist Mono', monospace;
  font-size: 14px;
  line-height: 1.7;
  color: var(--tc-text-primary);
  background: var(--tc-bg-primary);
}

.preview {
  flex: 1;
  padding: 16px 20px;
  overflow-y: auto;
  cursor: text;
  font-size: 14px;
  line-height: 1.7;
  color: var(--tc-text-primary);
}

.preview h1 { font-size: 20px; font-weight: 700; margin: 0 0 12px; }
.preview h2 { font-size: 16px; font-weight: 600; margin: 16px 0 8px; }
.preview h3 { font-size: 14px; font-weight: 600; margin: 12px 0 6px; }
.preview p  { margin: 0 0 8px; }
.preview li { margin: 2px 0 2px 18px; list-style: disc; }
.preview code {
  font-family: 'Geist Mono', monospace;
  font-size: 12px;
  background: var(--tc-bg-secondary);
  padding: 1px 4px;
  border-radius: 3px;
}
.preview a { color: var(--tc-accent); text-decoration: underline; }
.preview :global(.placeholder) { color: var(--tc-text-tertiary); font-style: italic; }

.loading {
  padding: 16px;
  color: var(--tc-text-tertiary);
  font-size: 13px;
}
```

- [ ] **Step 3: TypeScript 检查**

```bash
cd /home/sichengli/Documents/code2/task-conductor/tauri
npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep "DocumentEditor"
```

期望：无输出（无错误）。

- [ ] **Step 4: Commit**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/features/task-detail/components/DocumentEditor.tsx \
        tauri/src/features/task-detail/components/DocumentEditor.module.css
git commit -m "feat: add DocumentEditor inline editing component"
```

---

## Task 5: 前端 — Task Detail DocumentSection

**Files:**
- Create: `tauri/src/features/task-detail/components/DocumentSection.tsx`
- Create: `tauri/src/features/task-detail/components/DocumentSection.module.css`
- Modify: `tauri/src/features/task-detail/index.tsx`

- [ ] **Step 1: 创建 DocumentSection.tsx**

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { DocumentEditor } from './DocumentEditor'
import type { Document } from '../../../lib/api/types'
import styles from './DocumentSection.module.css'

const DOC_TYPE_LABELS: Record<string, string> = {
  requirements: '需求文档',
  research: '调研报告',
  prd: 'PRD',
  architecture: '架构设计',
  'ui-spec': 'UI设计',
  'dev-plan': '开发计划',
  'test-plan': '测试方案',
  note: '笔记',
}

const DOC_TYPE_ICONS: Record<string, string> = {
  requirements: '📋',
  research: '🔬',
  prd: '📄',
  architecture: '🏗️',
  'ui-spec': '🎨',
  'dev-plan': '🗓️',
  'test-plan': '✅',
  note: '📝',
}

interface Props {
  taskId: number
  taskTitle: string
}

export function DocumentSection({ taskId, taskTitle }: Props) {
  const qc = useQueryClient()
  const [activeDocId, setActiveDocId] = useState<number | null>(null)
  const [showNewDoc, setShowNewDoc] = useState(false)
  const [newDocType, setNewDocType] = useState('note')

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['task-docs', taskId],
    queryFn: () => api.getTaskDocuments(taskId),
    onSuccess: (data: Document[]) => {
      if (data.length > 0 && activeDocId === null) {
        setActiveDocId(data[0].id)
      }
    },
  })

  const createMut = useMutation({
    mutationFn: (docType: string) =>
      api.createDocument(taskId, {
        title: `${taskTitle} - ${DOC_TYPE_LABELS[docType] ?? docType}`,
        doc_type: docType,
        initial_content: `# ${taskTitle}\n\n## ${DOC_TYPE_LABELS[docType] ?? docType}\n\n`,
      }),
    onSuccess: (doc: Document) => {
      qc.invalidateQueries({ queryKey: ['task-docs', taskId] })
      setActiveDocId(doc.id)
      setShowNewDoc(false)
    },
  })

  const activeDoc = docs.find(d => d.id === activeDocId)

  if (isLoading) return <div className={styles.loading}>加载文档…</div>

  return (
    <div className={styles.root}>
      {/* Tab 栏 */}
      <div className={styles.tabs}>
        {docs.map(doc => (
          <button
            key={doc.id}
            className={`${styles.tab} ${doc.id === activeDocId ? styles.active : ''}`}
            onClick={() => setActiveDocId(doc.id)}
          >
            <span>{DOC_TYPE_ICONS[doc.doc_type] ?? '📄'}</span>
            <span>{DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}</span>
          </button>
        ))}

        {showNewDoc ? (
          <div className={styles.newDocRow}>
            <select
              className={styles.typeSelect}
              value={newDocType}
              onChange={e => setNewDocType(e.target.value)}
            >
              {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <button
              className={styles.confirmBtn}
              disabled={createMut.isPending}
              onClick={() => createMut.mutate(newDocType)}
            >
              确认
            </button>
            <button className={styles.cancelBtn} onClick={() => setShowNewDoc(false)}>
              取消
            </button>
          </div>
        ) : (
          <button className={styles.addTab} onClick={() => setShowNewDoc(true)}>
            + 新建文档
          </button>
        )}
      </div>

      {/* 编辑区 */}
      <div className={styles.editorArea}>
        {docs.length === 0 ? (
          <div className={styles.empty}>
            <p>暂无文档</p>
            <button className={styles.addTab} onClick={() => setShowNewDoc(true)}>
              + 创建第一个文档
            </button>
          </div>
        ) : activeDoc ? (
          <DocumentEditor
            key={activeDoc.id}
            docId={activeDoc.id}
            title={activeDoc.title}
          />
        ) : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 创建 DocumentSection.module.css**

```css
.root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--tc-bg-primary);
  border-radius: 8px;
  border: 1px solid var(--tc-border);
  overflow: hidden;
}

.tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
  border-bottom: 1px solid var(--tc-border);
  background: var(--tc-bg-secondary);
  overflow-x: auto;
  min-height: 40px;
  scrollbar-width: none;
}
.tabs::-webkit-scrollbar { display: none; }

.tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  font-size: 12px;
  border: none;
  background: transparent;
  color: var(--tc-text-secondary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  white-space: nowrap;
  transition: color 0.15s;
}
.tab:hover { color: var(--tc-text-primary); }
.tab.active {
  color: var(--tc-accent);
  border-bottom-color: var(--tc-accent);
}

.addTab {
  padding: 4px 10px;
  font-size: 12px;
  border: 1px dashed var(--tc-border);
  border-radius: 4px;
  background: transparent;
  color: var(--tc-text-tertiary);
  cursor: pointer;
  white-space: nowrap;
  margin-left: 4px;
}
.addTab:hover {
  color: var(--tc-text-primary);
  border-color: var(--tc-text-secondary);
}

.newDocRow {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
}

.typeSelect {
  font-size: 12px;
  padding: 3px 6px;
  border: 1px solid var(--tc-border);
  border-radius: 4px;
  background: var(--tc-bg-primary);
  color: var(--tc-text-primary);
}

.confirmBtn {
  padding: 3px 10px;
  font-size: 12px;
  background: var(--tc-accent);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.confirmBtn:disabled { opacity: 0.6; cursor: not-allowed; }

.cancelBtn {
  padding: 3px 8px;
  font-size: 12px;
  background: transparent;
  border: 1px solid var(--tc-border);
  border-radius: 4px;
  color: var(--tc-text-secondary);
  cursor: pointer;
}

.editorArea {
  flex: 1;
  overflow: hidden;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--tc-text-tertiary);
  font-size: 13px;
}

.loading {
  padding: 16px;
  color: var(--tc-text-tertiary);
  font-size: 13px;
}
```

- [ ] **Step 3: 修改 task-detail/index.tsx，用 DocumentSection 替换 RequirementWorkspace**

在 `tauri/src/features/task-detail/index.tsx` 中：

**添加 import**（在已有 import 区域）：
```typescript
import { DocumentSection } from './components/DocumentSection'
```

找到 RequirementWorkspace 相关的整个 JSX 块（约第 112-139 行，`{/* Input Stage: Requirement Workspace */}` 注释到对应的 `</div>` 结束）并**替换为**：

```tsx
      {/* 文档区域（所有阶段均显示） */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>任务文档</span>
        </div>
        <div className={styles.sectionBody} style={{ height: 480 }}>
          <DocumentSection taskId={task.id} taskTitle={task.title} />
        </div>
      </div>
```

同时删除已不再需要的旧 import（如果存在）：
```typescript
// 删除这行
import { RequirementWorkspace } from './components/RequirementWorkspace'
```

- [ ] **Step 4: TypeScript 检查 + 查看效果**

```bash
cd /home/sichengli/Documents/code2/task-conductor/tauri
npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

期望：无新增错误。

```bash
pnpm dev
# 访问 http://localhost:7071，进入一个任务详情页
# 期望：看到"任务文档"区域，可新建文档，点击编辑
```

- [ ] **Step 5: Commit**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/features/task-detail/components/DocumentSection.tsx \
        tauri/src/features/task-detail/components/DocumentSection.module.css \
        tauri/src/features/task-detail/index.tsx
git commit -m "feat: replace RequirementWorkspace with DocumentSection in task detail"
```

---

## Task 6: 前端 — Knowledge Base 页面（React Flow 图谱）

**Files:**
- Create: `tauri/src/features/knowledge/index.tsx`
- Create: `tauri/src/features/knowledge/knowledge.module.css`
- Create: `tauri/src/features/knowledge/components/DocNode.tsx`
- Create: `tauri/src/features/knowledge/components/DocNode.module.css`
- Modify: `tauri/src/app/Router.tsx`

- [ ] **Step 1: 创建 DocNode.tsx（自定义 React Flow 节点）**

```tsx
import { Handle, Position, type NodeProps } from '@xyflow/react'
import styles from './DocNode.module.css'

const TYPE_ICONS: Record<string, string> = {
  requirements: '📋', research: '🔬', prd: '📄',
  architecture: '🏗️', 'ui-spec': '🎨', 'dev-plan': '🗓️',
  'test-plan': '✅', note: '📝',
}

const TYPE_COLORS: Record<string, string> = {
  requirements: '#3b82f6', research: '#8b5cf6', prd: '#06b6d4',
  architecture: '#f59e0b', 'ui-spec': '#ec4899', 'dev-plan': '#10b981',
  'test-plan': '#22c55e', note: '#6b7280',
}

export interface DocNodeData extends Record<string, unknown> {
  title: string
  doc_type: string
  task_title: string | null
  updated_at: string
  onOpen: (docId: number) => void
  docId: number
}

export function DocNode({ data, selected }: NodeProps) {
  const d = data as DocNodeData
  const color = TYPE_COLORS[d.doc_type] ?? '#6b7280'
  return (
    <div
      className={`${styles.node} ${selected ? styles.selected : ''}`}
      style={{ '--node-color': color } as React.CSSProperties}
    >
      <Handle type="target" position={Position.Left} className={styles.handle} />

      <div className={styles.typeRow}>
        <span className={styles.icon}>{TYPE_ICONS[d.doc_type] ?? '📄'}</span>
        <span className={styles.type} style={{ color }}>{d.doc_type}</span>
      </div>
      <div className={styles.title}>{d.title}</div>
      {d.task_title && <div className={styles.taskLabel}>{d.task_title}</div>}
      <div className={styles.footer}>
        <button
          className={styles.openBtn}
          onMouseDown={e => e.stopPropagation()}
          onClick={() => d.onOpen(d.docId)}
        >
          打开
        </button>
        <span className={styles.date}>
          {new Date(d.updated_at).toLocaleDateString()}
        </span>
      </div>

      <Handle type="source" position={Position.Right} className={styles.handle} />
    </div>
  )
}
```

- [ ] **Step 2: 创建 DocNode.module.css**

```css
.node {
  width: 190px;
  padding: 10px 12px;
  background: var(--tc-bg-secondary);
  border: 1px solid var(--tc-border);
  border-radius: 8px;
  border-left: 3px solid var(--node-color, #6b7280);
  cursor: default;
  transition: box-shadow 0.15s;
}
.node:hover {
  box-shadow: 0 2px 12px rgba(0,0,0,0.15);
}
.node.selected {
  border-color: var(--tc-accent);
  box-shadow: 0 0 0 2px var(--tc-accent);
}

.typeRow {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
}
.icon { font-size: 13px; }
.type {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.title {
  font-size: 13px;
  font-weight: 500;
  color: var(--tc-text-primary);
  margin-bottom: 4px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.taskLabel {
  font-size: 10px;
  color: var(--tc-text-tertiary);
  margin-bottom: 6px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.openBtn {
  font-size: 11px;
  padding: 2px 8px;
  border: 1px solid var(--tc-border);
  border-radius: 3px;
  background: transparent;
  color: var(--tc-text-secondary);
  cursor: pointer;
}
.openBtn:hover {
  background: var(--tc-bg-hover);
  color: var(--tc-text-primary);
}

.date {
  font-size: 10px;
  color: var(--tc-text-tertiary);
}

.handle {
  width: 8px !important;
  height: 8px !important;
  background: var(--tc-border) !important;
  border: 1px solid var(--tc-text-tertiary) !important;
}
```

- [ ] **Step 3: 创建 knowledge/index.tsx**

```tsx
import { useCallback, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant,
  Controls, MiniMap,
  useNodesState, useEdgesState,
  type Node, type Edge, type Connection,
  addEdge,
} from '@xyflow/react'
import dagre from 'dagre'
import '@xyflow/react/dist/style.css'
import { useAppStore } from '../../lib/store/app'
import { api } from '../../lib/api'
import { useNavigate } from 'react-router-dom'
import { DocNode, type DocNodeData } from './components/DocNode'
import type { Document as Doc, DocumentLink } from '../../lib/api/types'
import styles from './knowledge.module.css'

const NODE_TYPES = { docNode: DocNode }

const RELATION_LABELS: Record<string, string> = {
  derived_from: '衍生', depends_on: '依赖',
  references: '参考', contradicts: '矛盾',
}

function layoutWithDagre(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', ranksep: 80, nodesep: 50 })
  nodes.forEach(n => g.setNode(n.id, { width: 210, height: 110 }))
  edges.forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return nodes.map(n => {
    const pos = g.node(n.id)
    return { ...n, position: { x: pos.x - 105, y: pos.y - 55 } }
  })
}

function buildGraph(
  docs: Doc[],
  links: DocumentLink[],
  tasks: Array<{ id: number; title: string }>,
  onOpen: (docId: number) => void,
): { nodes: Node[]; edges: Edge[] } {
  const taskMap = new Map(tasks.map(t => [t.id, t.title]))

  const nodes: Node[] = docs.map(doc => ({
    id: String(doc.id),
    type: 'docNode',
    position: doc.pos_x || doc.pos_y
      ? { x: doc.pos_x, y: doc.pos_y }
      : { x: 0, y: 0 },
    data: {
      docId: doc.id,
      title: doc.title,
      doc_type: doc.doc_type,
      task_title: doc.task_id ? (taskMap.get(doc.task_id) ?? null) : '_project',
      updated_at: doc.updated_at,
      onOpen,
    } satisfies DocNodeData,
  }))

  const edges: Edge[] = links.map(lk => ({
    id: `link-${lk.id}`,
    source: String(lk.source_id),
    target: String(lk.target_id),
    label: RELATION_LABELS[lk.relation] ?? lk.relation,
    animated: !lk.auto,
    style: { stroke: lk.auto ? '#6b7280' : '#3b82f6' },
    labelStyle: { fontSize: 10, fill: '#9ca3af' },
  }))

  return { nodes, edges }
}

function KnowledgeGraph() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const activeProjectIdStr = useAppStore(s => s.activeProjectId)
  const activeProjectId = activeProjectIdStr ? Number(activeProjectIdStr) : null
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null)

  const { data: projectDocs, isLoading } = useQuery({
    queryKey: ['project-docs', activeProjectId],
    queryFn: () => api.getProjectDocuments(activeProjectId!),
    enabled: !!activeProjectId,
  })

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', activeProjectId],
    queryFn: () => api.getTasks(activeProjectId!),
    enabled: !!activeProjectId,
  })

  const savePosM = useMutation({
    mutationFn: ({ docId, pos }: { docId: number; pos: { pos_x: number; pos_y: number } }) =>
      api.updateDocumentPosition(docId, pos),
  })

  const createLinkM = useMutation({
    mutationFn: (data: { source_id: number; target_id: number; relation: string }) =>
      api.createDocumentLink(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-docs', activeProjectId] }),
  })

  const deleteLinkM = useMutation({
    mutationFn: (linkId: number) => api.deleteDocumentLink(linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-docs', activeProjectId] }),
  })

  const onOpen = useCallback((docId: number) => {
    setSelectedDocId(docId)
  }, [])

  const { rawNodes, rawEdges } = useMemo(() => {
    if (!projectDocs) return { rawNodes: [], rawEdges: [] }
    const { nodes, edges } = buildGraph(
      projectDocs.documents,
      projectDocs.links,
      tasks,
      onOpen,
    )
    // 如果没有持久化位置，用 dagre 自动布局
    const needsLayout = nodes.some(n => n.position.x === 0 && n.position.y === 0)
    return {
      rawNodes: needsLayout ? layoutWithDagre(nodes, edges) : nodes,
      rawEdges: edges,
    }
  }, [projectDocs, tasks, onOpen])

  const [nodes, setNodes, onNodesChange] = useNodesState(rawNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rawEdges)

  // 当数据变化时同步更新
  useMemo(() => {
    setNodes(rawNodes)
    setEdges(rawEdges)
  }, [rawNodes, rawEdges, setNodes, setEdges])

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    setEdges(eds => addEdge({ ...connection, label: '参考' }, eds))
    createLinkM.mutate({
      source_id: Number(connection.source),
      target_id: Number(connection.target),
      relation: 'references',
    })
  }, [setEdges, createLinkM])

  const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    savePosM.mutate({
      docId: Number(node.id),
      pos: { pos_x: node.position.x, pos_y: node.position.y },
    })
  }, [savePosM])

  const onEdgeDoubleClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    const linkId = Number(edge.id.replace('link-', ''))
    if (!isNaN(linkId) && confirm('删除这条关系？')) {
      deleteLinkM.mutate(linkId)
    }
  }, [deleteLinkM])

  const selectedDoc = selectedDocId
    ? projectDocs?.documents.find(d => d.id === selectedDocId)
    : null

  if (!activeProjectId) {
    return (
      <div className={styles.empty}>
        <p>请先选择一个项目</p>
      </div>
    )
  }

  if (isLoading) {
    return <div className={styles.empty}><p>加载中…</p></div>
  }

  return (
    <div className={styles.layout}>
      <div className={styles.graphArea}>
        <div className={styles.toolbar}>
          <span className={styles.title}>知识库</span>
          <span className={styles.hint}>拖拽节点调整位置 · 连接两个节点建立关系 · 双击边删除关系</span>
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onEdgeDoubleClick={onEdgeDoubleClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--tc-border)" />
          <Controls />
          <MiniMap nodeColor={() => '#6b7280'} maskColor="rgba(0,0,0,0.2)" />
        </ReactFlow>
      </div>

      {selectedDoc && (
        <div className={styles.docPanel}>
          <div className={styles.docPanelHeader}>
            <span>{selectedDoc.title}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className={styles.jumpBtn}
                onClick={() => navigate(`/task/${selectedDoc.task_id}`)}
                disabled={!selectedDoc.task_id}
              >
                跳转任务
              </button>
              <button className={styles.closeBtn} onClick={() => setSelectedDocId(null)}>✕</button>
            </div>
          </div>
          {/* 懒加载 DocumentEditor */}
          <DocumentEditorLazy docId={selectedDoc.id} title={selectedDoc.title} />
        </div>
      )}
    </div>
  )
}

/** 在知识库右侧面板懒加载文档内容 */
function DocumentEditorLazy({ docId, title }: { docId: number; title: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['doc-content', docId],
    queryFn: () => api.getDocumentContent(docId),
  })
  if (isLoading) return <div className={styles.docLoading}>加载中…</div>
  return (
    <pre className={styles.docContent}>{data?.content ?? ''}</pre>
  )
}

export default function KnowledgePage() {
  return (
    <ReactFlowProvider>
      <KnowledgeGraph />
    </ReactFlowProvider>
  )
}
```

- [ ] **Step 4: 创建 knowledge.module.css**

```css
.layout {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.graphArea {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--tc-border);
  background: var(--tc-bg-secondary);
  z-index: 1;
}

.title {
  font-size: 14px;
  font-weight: 600;
  color: var(--tc-text-primary);
}

.hint {
  font-size: 11px;
  color: var(--tc-text-tertiary);
}

.docPanel {
  width: 380px;
  border-left: 1px solid var(--tc-border);
  display: flex;
  flex-direction: column;
  background: var(--tc-bg-primary);
}

.docPanelHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--tc-border);
  font-size: 13px;
  font-weight: 500;
  color: var(--tc-text-primary);
}

.jumpBtn {
  font-size: 11px;
  padding: 3px 8px;
  border: 1px solid var(--tc-border);
  border-radius: 4px;
  background: transparent;
  color: var(--tc-text-secondary);
  cursor: pointer;
}
.jumpBtn:hover:not(:disabled) { background: var(--tc-bg-hover); }
.jumpBtn:disabled { opacity: 0.4; cursor: not-allowed; }

.closeBtn {
  font-size: 12px;
  padding: 3px 7px;
  border: 1px solid var(--tc-border);
  border-radius: 4px;
  background: transparent;
  color: var(--tc-text-secondary);
  cursor: pointer;
}
.closeBtn:hover { background: var(--tc-bg-hover); }

.docContent {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  color: var(--tc-text-primary);
  font-family: 'Geist Mono', monospace;
}

.docLoading {
  padding: 16px;
  color: var(--tc-text-tertiary);
  font-size: 13px;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--tc-text-tertiary);
  font-size: 14px;
}
```

- [ ] **Step 5: 更新 Router.tsx，将 /knowledge 指向 KnowledgePage**

在 `tauri/src/app/Router.tsx` 中找到 `/knowledge` 路由（当前是 PlaceholderPage 或类似），替换为：

```tsx
// 在 lazy imports 区域添加（与其他 lazy 导入格式一致）
const KnowledgePage = lazy(() => import('../features/knowledge'))
```

找到 `/knowledge` 的 `<Route>` 并替换：

```tsx
<Route path="/knowledge" element={<KnowledgePage />} />
```

- [ ] **Step 6: TypeScript 检查 + 查看效果**

```bash
cd /home/sichengli/Documents/code2/task-conductor/tauri
npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

```bash
pnpm dev
# 访问 http://localhost:7071，点击左侧"知识库"导航
# 期望：看到 React Flow 图谱，若有文档则显示节点
# 先在任务详情页创建几个文档，再刷新知识库页面
```

- [ ] **Step 7: Commit**

```bash
cd /home/sichengli/Documents/code2/task-conductor
git add tauri/src/features/knowledge/ tauri/src/app/Router.tsx
git commit -m "feat: add knowledge base React Flow graph page"
```

---

## 自查清单

**Spec coverage:**
- ✅ 文档存储为 `.md` 文件在 `{project.repo_url}/docs/` 下
- ✅ Document + DocumentLink DB 模型
- ✅ 文件 CRUD API（创建/读取/保存/删除）
- ✅ MD 链接自动解析 → DocumentLink(auto=True)
- ✅ 任务详情页内联编辑（飞书风格，click-to-edit）
- ✅ 知识库页 React Flow 图谱
- ✅ 节点位置持久化
- ✅ 手动连线创建关系
- ✅ 双击边删除关系

**Type consistency:**
- `Document` 在 types.ts / DocumentOut / DocumentSection / KnowledgePage 一致
- `DocumentLink` 在 types.ts / DocumentLinkOut / KnowledgePage 一致
- `doc_type` string 枚举全程一致：requirements/research/prd/architecture/ui-spec/dev-plan/test-plan/note
- `relation` string 枚举全程一致：derived_from/depends_on/references/contradicts
