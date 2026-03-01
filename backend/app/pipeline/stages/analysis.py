import re

ANALYSIS_PROMPT_TEMPLATE = """你是一个资深技术架构师。用户提交了以下开发任务：

任务标题: {title}
任务描述: {description}

请分析这个任务，并生成 3 个可行的技术方案，每个方案格式如下（必须严格遵守）：

## 方案 A: [方案名称]
工作量: [S/M/L/XL]
风险: [低/中/高]
描述: [2-3句话描述这个方案的核心思路、优劣势]

## 方案 B: [方案名称]
工作量: [S/M/L/XL]
风险: [低/中/高]
描述: [2-3句话]

## 方案 C: [方案名称]
工作量: [S/M/L/XL]
风险: [低/中/高]
描述: [2-3句话]

最后给出你的推荐方案（A/B/C）及理由（一句话）。
"""

def build_analysis_prompt(title: str, description: str) -> str:
    return ANALYSIS_PROMPT_TEMPLATE.format(title=title, description=description)

def parse_options(raw: str) -> list[dict]:
    """解析 AI 输出的方案文本，提取结构化方案列表"""
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
