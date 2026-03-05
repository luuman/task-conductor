# backend/app/routers/task_manager.py
import json
import re
import os
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/task-manager", tags=["任务管理"])


# ── 请求 / 响应模型 ──────────────────────────────────────────

class InboxItem(BaseModel):
    id: str
    title: str
    description: str = ""


class AnalyzeRequest(BaseModel):
    items: list[InboxItem]


class ItemAnalysis(BaseModel):
    id: str
    priority: int
    understanding: str
    complexity: str   # S / M / L / XL
    approach: str
    tags: list[str] = []


class AnalyzeResponse(BaseModel):
    results: list[ItemAnalysis]


# ── AI 批量分析 ──────────────────────────────────────────────

def build_batch_prompt(items: list[InboxItem]) -> str:
    task_lines = "\n".join(
        f'{i+1}. id={item.id}\n   标题：{item.title}\n   描述：{item.description or "（无）"}'
        for i, item in enumerate(items)
    )
    return f"""你是技术项目管理专家。请分析以下 {len(items)} 个待开发任务：

{task_lines}

请对每个任务完成：
1. 用1-2句话写出你对任务的**理解**（明确目标和边界）
2. **复杂度**评估：S（≤1天）/ M（2-3天）/ L（1周）/ XL（>1周）
3. **实现方向**：简洁的技术建议（1-2句）
4. 按**优先级**排序（1=最高，综合业务价值、技术复杂度、依赖关系）
5. 推荐1-3个**标签**（如：后端、前端、数据库、性能、安全、体验等）

严格按以下 JSON 格式输出，不要有任何其他内容：
{{
  "results": [
    {{
      "id": "任务的原始id",
      "priority": 1,
      "understanding": "你对任务的理解",
      "complexity": "M",
      "approach": "建议实现方向",
      "tags": ["标签1", "标签2"]
    }}
  ]
}}"""


def parse_ai_response(raw: str, items: list[InboxItem]) -> list[ItemAnalysis]:
    """解析 Claude 输出，兼容 markdown 代码块包裹"""
    # 提取 JSON（兼容 ```json ... ``` 包裹）
    json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
    if json_match:
        raw = json_match.group(1)
    else:
        # 直接找最外层 {}
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start != -1 and end > start:
            raw = raw[start:end]

    try:
        data = json.loads(raw)
        results = []
        for r in data.get("results", []):
            results.append(ItemAnalysis(
                id=str(r.get("id", "")),
                priority=int(r.get("priority", 99)),
                understanding=str(r.get("understanding", "")),
                complexity=str(r.get("complexity", "M")),
                approach=str(r.get("approach", "")),
                tags=r.get("tags", []),
            ))
        # 确保每个 item 都有结果
        result_ids = {r.id for r in results}
        for i, item in enumerate(items):
            if item.id not in result_ids:
                results.append(ItemAnalysis(
                    id=item.id, priority=len(results)+1,
                    understanding=f"实现「{item.title}」功能",
                    complexity="M", approach="待进一步分析", tags=[],
                ))
        results.sort(key=lambda r: r.priority)
        return results
    except Exception:
        # 兜底：按输入顺序返回默认值
        return [
            ItemAnalysis(
                id=item.id, priority=i+1,
                understanding=f"实现「{item.title}」功能",
                complexity="M", approach="待进一步分析", tags=[],
            )
            for i, item in enumerate(items)
        ]


@router.post("/analyze", response_model=AnalyzeResponse, summary="AI 批量分析任务优先级")
async def batch_analyze(body: AnalyzeRequest):
    """
    接收多个待办任务，由 Claude AI 统一分析：

    - 对每个任务给出**理解**（目标+边界）
    - 评估**复杂度**（S/M/L/XL）
    - 提供**实现方向**建议
    - 按**优先级**排序
    - 打上**标签**（技术领域）
    """
    if not body.items:
        return AnalyzeResponse(results=[])

    prompt = build_batch_prompt(body.items)
    log_dir = os.getenv("TC_LOG_DIR", "/tmp/task-conductor/logs")
    os.makedirs(log_dir, exist_ok=True)
    log_path = f"{log_dir}/task-manager-analyze.log"

    raw_output: list[str] = []

    try:
        from ..claude.pool import ClaudePool
        pool = ClaudePool()
        async for event in pool.run(0, prompt, "/tmp", log_path):
            content = event.get("content") or event.get("result", "")
            if content:
                raw_output.append(str(content))
    except Exception:
        # Claude 不可用时返回 mock 结果
        return AnalyzeResponse(results=_mock_results(body.items))

    raw = "".join(raw_output)
    results = parse_ai_response(raw, body.items)
    return AnalyzeResponse(results=results)


def _mock_results(items: list[InboxItem]) -> list[ItemAnalysis]:
    """开发/测试时的 mock 输出"""
    complexity_cycle = ["M", "S", "L", "M", "XL"]
    tags_pool = [["前端", "体验"], ["后端", "接口"], ["数据库", "性能"],
                 ["安全", "认证"], ["前端", "后端"]]
    results = []
    for i, item in enumerate(items):
        results.append(ItemAnalysis(
            id=item.id,
            priority=i + 1,
            understanding=f"需要{item.title}，目标是{item.description[:30] if item.description else '完成该功能'}。",
            complexity=complexity_cycle[i % len(complexity_cycle)],
            approach=f"建议采用模块化方式实现，分阶段交付。",
            tags=tags_pool[i % len(tags_pool)],
        ))
    return results
