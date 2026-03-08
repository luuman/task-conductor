# backend/app/pipeline/executor.py
import json
import logging
import os
import re
from abc import ABC, abstractmethod
from typing import TypeVar, Type
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session
from ..database import engine
from ..models import ProjectKnowledge
from ..claude.pool import ClaudePool
from ..ws.manager import manager

T = TypeVar("T", bound=BaseModel)
logger = logging.getLogger(__name__)
pool = ClaudePool()
MAX_RETRIES = 3  # 静态 fallback，实际运行时通过 _get_max_retries() 动态读取


def _get_max_retries() -> int:
    try:
        from ..routers.settings_router import _load
        return _load().get("pipeline_max_retries", 3)
    except Exception:
        return 3

CRITIC_PROMPT = """你是严格的技术评审专家。评审以下"{stage}"阶段输出：

{output_json}

原始需求：{requirement}

直接输出 JSON（无 markdown 包裹）：
{{"score":<0-10整数>,"issues":["具体问题1"],"suggestions":"改进建议一句话","pass_review":<true或false>}}
"""


class StageExecutor(ABC):
    stage_name: str

    @abstractmethod
    def build_prompt(self, title: str, desc: str, context: dict, knowledge: list[str]) -> str:
        """构建本阶段的执行 prompt"""
        ...

    @abstractmethod
    def get_output_schema(self) -> Type[T]:
        """返回本阶段的 Pydantic 输出 Schema 类"""
        ...

    def extract_json(self, raw: str) -> str:
        """从 Claude 输出中提取 JSON，去除 markdown 代码块等干扰"""
        m = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", raw)
        if m:
            return m.group(1)
        m = re.search(r"\{[\s\S]*\}", raw)
        if m:
            return m.group(0)
        return raw

    def _load_knowledge(self, project_id: int) -> list[str]:
        """从知识库加载本阶段的历史错误经验（最近5条）"""
        with Session(engine) as db:
            rows = db.query(ProjectKnowledge).filter(
                ProjectKnowledge.project_id == project_id,
                ProjectKnowledge.stage == self.stage_name,
            ).order_by(ProjectKnowledge.created_at.desc()).limit(5).all()
            return [f"[{r.category}] {r.title}: {r.content}" for r in rows]

    def save_knowledge(
        self, project_id: int, task_id: int,
        category: str, title: str, content: str
    ):
        """保存一条错误经验到知识库"""
        with Session(engine) as db:
            k = ProjectKnowledge(
                project_id=project_id,
                source_task_id=task_id,
                stage=self.stage_name,
                category=category,
                title=title,
                content=content,
            )
            db.add(k)
            db.commit()

    async def _call_claude(
        self,
        task_id: int,
        prompt: str,
        log_file: str,
        cwd: str = "/tmp",
    ) -> str:
        """调用 Claude，收集并返回完整文本输出"""
        parts: list[str] = []
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        try:
            async for event in pool.run(task_id, prompt, cwd, log_file):
                # stream-json 格式：文本在多种位置
                content = ""
                if event.get("type") == "assistant":
                    # assistant 事件：文本在 message.content[].text
                    msg = event.get("message", {})
                    for block in msg.get("content", []):
                        if isinstance(block, dict) and block.get("type") == "text":
                            content = block.get("text", "")
                elif event.get("type") == "result":
                    content = event.get("result", "")
                else:
                    content = event.get("content", "")
                if content:
                    parts.append(str(content))
                    # 广播纯字符串，前端直接用 msg.data 显示
                    await manager.broadcast(
                        f"task:{task_id}", "log", str(content)
                    )
        except Exception as e:
            raise RuntimeError(f"Claude call failed: {e}")
        return "".join(parts)

    async def run(
        self,
        task_id: int,
        project_id: int,
        title: str,
        description: str,
        context: dict,
        worktree_path: str = "/tmp",
        log_dir: str = "/tmp/task-conductor/logs",
    ) -> tuple[T, dict]:
        """
        执行本阶段：execute → validate → critic → retry(x MAX_RETRIES)
        返回 (validated_output, metadata)
        metadata 包含: confidence, assumptions, critic_notes, retry_count, error_log
        """
        schema = self.get_output_schema()
        knowledge = self._load_knowledge(project_id)
        requirement = f"{title}\n{description}"
        errors: list[str] = []
        retry_count = 0
        critic_notes = ""
        max_retries = _get_max_retries()

        for attempt in range(max_retries):
            retry_count = attempt
            log_file = f"{log_dir}/task-{task_id}-{self.stage_name}-{attempt}.log"

            # 构建 prompt（首次 + 带错误反馈的重试）
            prompt = self.build_prompt(title, description, context, knowledge)
            if errors:
                prompt += "\n\n【请修正以下问题后重新输出】\n" + "\n".join(f"- {e}" for e in errors)

            await manager.broadcast(
                f"task:{task_id}", "log",
                f"[{self.stage_name}] 第 {attempt + 1}/{max_retries} 次尝试..."
            )

            # Step 1: 执行 Claude
            try:
                raw = await self._call_claude(task_id, prompt, log_file, worktree_path)
            except RuntimeError as e:
                errors = [str(e)]
                continue

            # Step 2: 结构化 JSON 验证
            try:
                json_str = self.extract_json(raw)
                output = schema.model_validate(json.loads(json_str))
            except (json.JSONDecodeError, ValidationError) as e:
                errors = [f"输出格式错误: {e}"]
                continue

            # Step 3: Critic Pass（第二个 Claude 调用审查输出）
            try:
                critic_raw = await self._call_claude(
                    task_id * 10000 + attempt,
                    CRITIC_PROMPT.format(
                        stage=self.stage_name,
                        output_json=json_str,
                        requirement=requirement,
                    ),
                    f"{log_dir}/task-{task_id}-{self.stage_name}-critic{attempt}.log",
                )
                cd = json.loads(self.extract_json(critic_raw))
                score = cd.get("score", 10)
                critic_notes = f"评分:{score}/10 | {cd.get('suggestions', '')}"

                if not cd.get("pass_review", True):
                    issues = cd.get("issues", [])
                    self.save_knowledge(
                        project_id, task_id, "validation_fail",
                        f"{self.stage_name} Critic未通过",
                        "; ".join(issues),
                    )
                    errors = [f"Critic未通过({score}/10): {'; '.join(issues)}"]
                    await manager.broadcast(
                        f"task:{task_id}", "log",
                        f"[critic] ✗ 评分 {score}/10，未通过：{'; '.join(issues)}"
                    )
                    continue
                else:
                    await manager.broadcast(
                        f"task:{task_id}", "log",
                        f"[critic] ✓ 评分 {score}/10，通过审查"
                    )
            except Exception as e:
                # Critic 失败不阻断主流程，记录日志继续
                critic_notes = f"Critic解析失败: {e}"
                logger.warning(f"Critic pass failed for task {task_id} stage {self.stage_name}: {e}")

            # Step 4: 检查 blockers / 低置信度 → 通知人工介入
            blockers = getattr(output, "blockers", [])
            confidence = getattr(output, "confidence", 0.8)
            try:
                from ..routers.settings_router import _load as _load_cfg
                confidence_threshold = _load_cfg().get("pipeline_confidence_threshold", 0.5)
            except Exception:
                confidence_threshold = 0.5
            if blockers or confidence < confidence_threshold:
                await manager.broadcast(f"task:{task_id}", "needs_human", {
                    "stage": self.stage_name,
                    "reason": "blockers" if blockers else "low_confidence",
                    "blockers": blockers,
                    "confidence": confidence,
                })

            return output, {
                "confidence": confidence,
                "assumptions": getattr(output, "assumptions", []),
                "critic_notes": critic_notes,
                "retry_count": retry_count,
                "error_log": "; ".join(errors) if errors else "",
            }

        # 超过最大重试次数 → 写入知识库，抛出异常
        self.save_knowledge(
            project_id, task_id, "error_pattern",
            f"{self.stage_name} 超出最大重试次数",
            f"连续 {max_retries} 次失败，最后错误: {'; '.join(errors)}",
        )
        raise RuntimeError(
            f"Stage '{self.stage_name}' failed after {max_retries} retries: {'; '.join(errors)}"
        )
