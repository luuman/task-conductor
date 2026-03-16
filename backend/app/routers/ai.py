"""AI 辅助编辑 API：内联代码编辑"""

import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/ai", tags=["ai"])


class InlineEditRequest(BaseModel):
    file_path: str
    file_content: str
    selection: dict  # {startLine, endLine}
    instruction: str


@router.post("/inline-edit")
async def inline_edit(req: InlineEditRequest):
    start = req.selection.get("startLine", 1)
    end = req.selection.get("endLine", start)
    lines = req.file_content.splitlines()
    selected = "\n".join(lines[start - 1:end])

    prompt = f"""你是代码编辑助手。用户选中了以下代码（文件 {req.file_path} 第 {start}-{end} 行）：

```
{selected}
```

用户指令：{req.instruction}

请直接返回修改后的代码片段（只返回替换选中部分的代码，不要返回整个文件，不要包含 markdown 代码块标记）。"""

    try:
        proc = await asyncio.create_subprocess_exec(
            "claude", "-p", prompt, "--output-format", "text",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=60)
        if proc.returncode != 0:
            raise HTTPException(500, "AI request failed")
        return {"original": selected, "modified": stdout.decode("utf-8").strip()}
    except asyncio.TimeoutError:
        raise HTTPException(504, "AI request timed out")
