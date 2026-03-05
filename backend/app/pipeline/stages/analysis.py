# backend/app/pipeline/stages/analysis.py
from ..executor import StageExecutor
from ..schemas import AnalysisOutput

PROMPT = """你是资深技术架构师。分析以下开发任务，直接输出 JSON（无 markdown 包裹，无额外说明）：

任务标题: {title}
任务描述: {description}
{knowledge_section}
输出格式（严格遵守，字段不可缺少）：
{{"understanding":"对需求的核心理解1-2句","assumptions":["假设1","假设2"],"risks":["风险1"],
"options":[
  {{"label":"A","title":"方案名称","effort":"M","risk":"低","description":"2-3句描述优劣势"}},
  {{"label":"B","title":"方案名称","effort":"S","risk":"低","description":"2-3句描述优劣势"}},
  {{"label":"C","title":"方案名称","effort":"L","risk":"中","description":"2-3句描述优劣势"}}
],
"recommended":"A","confidence":0.85,"blockers":[]}}
"""


class AnalysisExecutor(StageExecutor):
    stage_name = "analysis"

    def build_prompt(self, title: str, desc: str, context: dict, knowledge: list[str]) -> str:
        ks = ""
        if knowledge:
            ks = "\n【本项目历史经验，请避免重蹈覆辙】\n" + "\n".join(f"- {k}" for k in knowledge) + "\n"
        return PROMPT.format(title=title, description=desc, knowledge_section=ks)

    def get_output_schema(self):
        return AnalysisOutput


# 向后兼容：保留旧函数签名
def build_analysis_prompt(title: str, description: str) -> str:
    executor = AnalysisExecutor()
    return executor.build_prompt(title, description, {}, [])


def parse_options(raw: str) -> list[dict]:
    """从旧格式文本或新格式 JSON 解析方案列表（向后兼容）"""
    import json
    import re
    # 尝试新格式 JSON
    try:
        executor = AnalysisExecutor()
        json_str = executor.extract_json(raw)
        data = json.loads(json_str)
        if "options" in data:
            return data["options"]
    except Exception:
        pass
    # 回退旧格式正则解析
    options = []
    pattern = (
        r"## 方案 ([A-C]): (.+?)\n"
        r"工作量: (.+?)\n"
        r"风险: (.+?)\n"
        r"描述: (.+?)(?=\n## 方案|\Z)"
    )
    for m in re.finditer(pattern, raw, re.DOTALL):
        options.append({
            "label": m.group(1),
            "title": m.group(2).strip(),
            "effort": m.group(3).strip(),
            "risk": m.group(4).strip(),
            "description": m.group(5).strip(),
        })
    return options
