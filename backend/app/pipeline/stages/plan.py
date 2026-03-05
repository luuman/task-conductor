# backend/app/pipeline/stages/plan.py
from ..executor import StageExecutor
from ..schemas import PlanOutput

PROMPT = """你是技术负责人。根据以下 PRD 制定详细技术实现方案，直接输出 JSON（无 markdown 包裹）：

任务: {title}
背景: {background}
用户故事:
{stories}
验收标准:
{criteria}
{knowledge_section}
输出格式（字段不可缺少）：
{{"architecture":"架构设计概述2-3句",
"components":[{{"name":"组件名","responsibility":"职责","tech":"技术选型"}}],
"milestones":[{{"name":"里程碑名","tasks":["具体任务1","任务2"],"estimate":"1-2天"}}],
"tech_decisions":[{{"decision":"技术决策","rationale":"理由","alternatives":"备选方案"}}],
"assumptions":["技术假设1","假设2"],
"confidence":0.8,"blockers":[]}}
"""


class PlanExecutor(StageExecutor):
    stage_name = "plan"

    def build_prompt(self, title: str, desc: str, context: dict, knowledge: list[str]) -> str:
        prd = context.get("prd", {})
        background = prd.get("background", desc)
        stories = "\n".join(f"- {s}" for s in prd.get("user_stories", [desc]))
        criteria = "\n".join(f"- {c}" for c in prd.get("acceptance_criteria", []))
        ks = "\n【历史经验】\n" + "\n".join(f"- {k}" for k in knowledge) + "\n" if knowledge else ""
        return PROMPT.format(
            title=title,
            background=background,
            stories=stories or f"- {desc}",
            criteria=criteria or "- 功能正确实现",
            knowledge_section=ks,
        )

    def get_output_schema(self):
        return PlanOutput
