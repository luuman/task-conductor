#!/usr/bin/env python3
"""
TaskConductor MCP Tools Server
Claude Code 可通过此脚本调用 TaskConductor 的操作工具。

工具列表：
  - tc_create_task      创建任务并返回 task_id
  - tc_navigate_to      让前端跳转到指定页面
  - tc_update_requirements  更新任务需求字段
  - tc_start_pipeline   启动任务流水线
  - tc_get_task         查询任务详情
  - tc_get_interview_messages  获取访谈历史消息
  - tc_save_interview_message  保存一条访谈消息
"""
import json
import sys
import os
import urllib.request
import urllib.error

BASE_URL = os.environ.get("TC_BASE_URL", "http://localhost:8765")
TOKEN = os.environ.get("TC_TOKEN", "")


def _request(method: str, path: str, body: dict | None = None) -> dict:
    url = f"{BASE_URL}{path}"
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode()}
    except urllib.error.URLError as e:
        return {"error": str(e.reason)}


# ── MCP Protocol ──────────────────────────────────────────────────

TOOLS = [
    {
        "name": "tc_create_task",
        "description": "在 TaskConductor 中创建一个新任务，返回 task_id。创建后可调用 tc_navigate_to 跳转到任务页面。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "integer", "description": "所属项目 ID"},
                "title": {"type": "string", "description": "任务标题"},
                "description": {"type": "string", "description": "任务简短描述（可选）"},
            },
            "required": ["project_id", "title"],
        },
    },
    {
        "name": "tc_navigate_to",
        "description": "让 TaskConductor 前端界面跳转到指定路径，如 /task/42 或 /versions。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "前端路由路径，如 /task/42"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "tc_update_requirements",
        "description": "更新任务的结构化需求字段（背景、目标用户、核心功能、验收标准、技术约束）。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "integer", "description": "任务 ID"},
                "requirements": {
                    "type": "object",
                    "description": "需求字段",
                    "properties": {
                        "background": {"type": "string"},
                        "target_users": {"type": "string"},
                        "core_features": {"type": "array", "items": {"type": "string"}},
                        "acceptance_criteria": {"type": "array", "items": {"type": "string"}},
                        "tech_constraints": {"type": "string"},
                    },
                },
            },
            "required": ["task_id", "requirements"],
        },
    },
    {
        "name": "tc_start_pipeline",
        "description": "启动任务流水线（任务需处于 input/pending 状态）。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "integer", "description": "任务 ID"},
            },
            "required": ["task_id"],
        },
    },
    {
        "name": "tc_get_task",
        "description": "查询任务详情，包含当前阶段、状态、需求字段等。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "integer", "description": "任务 ID"},
            },
            "required": ["task_id"],
        },
    },
    {
        "name": "tc_save_interview_message",
        "description": "保存一条访谈对话消息到任务，role 为 assistant 或 user。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "integer", "description": "任务 ID"},
                "role": {"type": "string", "enum": ["user", "assistant"]},
                "content": {"type": "string", "description": "消息内容"},
            },
            "required": ["task_id", "role", "content"],
        },
    },
    {
        "name": "tc_get_interview_messages",
        "description": "获取任务的访谈历史消息列表。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "integer", "description": "任务 ID"},
            },
            "required": ["task_id"],
        },
    },
]


def handle_tool_call(name: str, args: dict) -> str:
    if name == "tc_create_task":
        result = _request("POST", f"/api/projects/{args['project_id']}/tasks", {
            "title": args["title"],
            "description": args.get("description", ""),
        })
        return json.dumps(result, ensure_ascii=False)

    elif name == "tc_navigate_to":
        result = _request("POST", "/api/ui/navigate", {"path": args["path"]})
        return json.dumps(result, ensure_ascii=False)

    elif name == "tc_update_requirements":
        result = _request("PUT", f"/api/tasks/{args['task_id']}/requirements", {
            "requirements": json.dumps(args["requirements"], ensure_ascii=False),
        })
        return json.dumps(result, ensure_ascii=False)

    elif name == "tc_start_pipeline":
        result = _request("POST", f"/api/tasks/{args['task_id']}/start")
        return json.dumps(result, ensure_ascii=False)

    elif name == "tc_get_task":
        result = _request("GET", f"/api/tasks/{args['task_id']}")
        return json.dumps(result, ensure_ascii=False)

    elif name == "tc_save_interview_message":
        result = _request("POST", f"/api/tasks/{args['task_id']}/interview/message", {
            "role": args["role"],
            "content": args["content"],
        })
        return json.dumps(result, ensure_ascii=False)

    elif name == "tc_get_interview_messages":
        result = _request("GET", f"/api/tasks/{args['task_id']}/interview/messages")
        return json.dumps(result, ensure_ascii=False)

    else:
        return json.dumps({"error": f"Unknown tool: {name}"})


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue

        req_id = req.get("id")
        # JSON-RPC notifications have no "id" — must not send a response
        if req_id is None:
            continue
        method = req.get("method", "")

        if method == "initialize":
            resp = {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "task-conductor", "version": "1.0.0"},
                },
            }
        elif method == "tools/list":
            resp = {"jsonrpc": "2.0", "id": req_id, "result": {"tools": TOOLS}}
        elif method == "tools/call":
            params = req.get("params", {})
            tool_name = params.get("name", "")
            tool_args = params.get("arguments", {})
            content = handle_tool_call(tool_name, tool_args)
            resp = {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {"content": [{"type": "text", "text": content}]},
            }
        else:
            resp = {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32601, "message": f"Method not found: {method}"},
            }

        print(json.dumps(resp, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
