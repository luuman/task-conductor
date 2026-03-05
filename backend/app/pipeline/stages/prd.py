# backend/app/pipeline/stages/prd.py
from ..executor import StageExecutor
from ..schemas import PrdOutput

PROMPT = """你是产品经理。根据以下需求分析结果撰写产品需求文档（PRD），直接输出 JSON（无 markdown 包裹）：

任务: {title}
选定方案: {option} - {option_desc}
分析假设: {assumptions}
{knowledge_section}
输出格式（字段不可缺少）：
{{"title":"功能标题","background":"背景和目的2-3句",
"user_stories":["As a 用户角色 I want 功能 So that 价值"],
"acceptance_criteria":["验收标准1（可测试）","验收标准2"],
"out_of_scope":["不在本次范围内的功能"],
"assumptions":["本PRD的假设1","假设2"],
"confidence":0.85,"blockers":[]}}
"""


class PrdExecutor(StageExecutor):
    stage_name = "prd"

    def build_prompt(self, title: str, desc: str, context: dict, knowledge: list[str]) -> str:
        analysis = context.get("analysis", {})
        rec = analysis.get("recommended", "A")
        opts = {o["label"]: o for o in analysis.get("options", [])}
        option_desc = opts.get(rec, {}).get("description", desc)
        assumptions_str = ", ".join(analysis.get("assumptions", []))
        ks = "\n【历史经验】\n" + "\n".join(f"- {k}" for k in knowledge) + "\n" if knowledge else ""
        return PROMPT.format(
            title=title,
            option=rec,
            option_desc=option_desc,
            assumptions=assumptions_str or "无特别假设",
            knowledge_section=ks,
        )

    def get_output_schema(self):
        return PrdOutput
