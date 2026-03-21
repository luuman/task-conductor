# TaskConductor MCP Server 设计

## 概述

在现有 FastAPI 后端（`:8765`）上挂载 MCP SSE 端点 `/mcp`，让 Claude Code 在任意会话中通过 MCP 协议调用 TaskConductor 的能力。

## 决策记录

- **传输方式**: HTTP/SSE，复用 FastAPI 后端
- **实现方式**: `mcp` Python SDK 手动注册工具
- **认证**: 无（localhost 信任）
- **工具范围**: 全部能力（读写 + ClaudePool + 知识库 + Git + 文件）

## 架构

```
Claude Code 任意会话
    ↓ JSON-RPC over SSE
http://localhost:8765/mcp
    ↓
mcp Server (挂载在 FastAPI app 上)
    ↓ 直接调用
现有 service 层 / DB / ClaudePool
```

## 新增文件

```
backend/app/mcp_server.py    # MCP Server 定义 + 所有工具注册
backend/app/main.py          # 挂载 mcp app（几行代码）
```

## 工具清单（29 个）

### 项目 & 任务（读）
| 工具名 | 描述 | 对应端点 |
|--------|------|----------|
| `list_projects` | 列出所有项目 | GET /api/projects |
| `get_project` | 获取项目详情 | GET /api/projects/{id} |
| `list_tasks` | 列出项目下的任务 | GET /api/projects/{id}/tasks |
| `get_task` | 获取任务详情（含 artifacts） | GET /api/tasks/{id} |
| `list_sessions` | 列出最近的 Claude 会话 | GET /api/sessions |
| `get_session_events` | 获取会话的工具调用事件 | GET /api/sessions/{id}/events |
| `get_session_transcript` | 获取会话完整转录 | GET /api/sessions/{id}/transcript |

### 项目 & 任务（写）
| 工具名 | 描述 | 对应端点 |
|--------|------|----------|
| `create_project` | 创建新项目 | POST /api/projects |
| `create_task` | 在项目下创建任务 | POST /api/projects/{id}/tasks |
| `approve_task` | 审批任务（approve/reject/revise） | POST /api/tasks/{id}/approve |
| `advance_task` | 推进任务到下一阶段 | POST /api/tasks/{id}/advance |

### 流水线
| 工具名 | 描述 | 对应端点 |
|--------|------|----------|
| `run_stage` | 触发指定阶段执行 | POST /api/pipeline/{id}/run/{stage} |
| `get_pipeline_status` | 获取流水线状态和当前阶段 | GET /api/tasks/{id} (解析 stage 字段) |

### ClaudePool
| 工具名 | 描述 |
|--------|------|
| `run_claude` | 启动 headless Claude 子进程执行 prompt |
| `kill_claude` | 终止正在运行的 Claude 子进程 |
| `list_active_claude` | 列出活跃的 Claude 子进程 |

### 知识库
| 工具名 | 描述 | 对应端点 |
|--------|------|----------|
| `list_knowledge` | 查看项目的经验知识 | GET /api/projects/{id}/knowledge |
| `delete_knowledge` | 删除过时的知识条目 | DELETE /api/projects/{id}/knowledge/{kid} |

### 指标
| 工具名 | 描述 | 对应端点 |
|--------|------|----------|
| `get_metrics` | 获取 KPI、Claude 调用统计、周报 | GET /api/metrics |
| `get_claude_usage` | 查看 token/成本统计 | GET /api/metrics/claude-usage |

### Git
| 工具名 | 描述 | 对应端点 |
|--------|------|----------|
| `git_status` | 获取项目 Git 状态 | GET /api/projects/{id}/git/status |
| `git_log` | 查看提交历史 | GET /api/projects/{id}/git/log |
| `git_diff` | 查看变更内容 | GET /api/projects/{id}/git/diff |

### 文件
| 工具名 | 描述 | 对应端点 |
|--------|------|----------|
| `list_files` | 浏览项目文件结构 | GET /api/projects/{id}/files |
| `read_file` | 读取项目文件内容 | GET /api/projects/{id}/file |
| `search_files` | 搜索项目文件 | GET /api/projects/{id}/files/search |

### 访谈
| 工具名 | 描述 | 对应端点 |
|--------|------|----------|
| `interview_messages` | 查看需求访谈记录 | GET /api/tasks/{id}/interview/messages |

### tmux
| 工具名 | 描述 | 对应端点 |
|--------|------|----------|
| `tmux_list` | 列出 tmux 会话 | GET /sessions/tmux |
| `tmux_send` | 向 tmux 发送命令 | POST /sessions/tmux/{name}/send |

## 安装配置

写入 `~/.claude.json`：
```json
{
  "mcpServers": {
    "task-conductor": {
      "type": "http",
      "url": "http://localhost:8765/mcp"
    }
  }
}
```

## 错误处理

- 后端未运行 → MCP 连接失败，Claude 告知用户
- ClaudePool 操作失败 → 返回错误文本
- DB 查询无结果 → 返回空列表/提示

## 不暴露的能力

- Claude Config（44 个端点）：Claude 不该自己改自己的配置
- Settings/PIN：安全敏感
- File write/delete：Claude Code 自己有 Read/Write/Edit
- Screenshot：特定工具链
