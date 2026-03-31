# 开发流水线功能设计文档

**日期**：2026-03-31
**状态**：待实现

---

## 1. 功能概述

在 TaskConductor Tauri 桌面端新增「开发流水线」页面，将 AI 任务开发、代码预览、测试验收、分支合并整合为一套可视化工作流。

**核心目标**：
- 每个任务对应一条 `feature/task-{id}` 分支，AI 在 worktree 中开发
- 用户通过 Kanban 看板监控所有进行中任务的状态
- 支持内嵌预览（iframe 代理）和全屏预览（Tauri WebviewWindow）
- 一键合并，默认目标分支可在设置中配置

---

## 2. 用户工作流

```
用户创建任务
    ↓
系统创建 worktree + feature/task-{id} 分支
AI 开始开发（自动提交）
    ↓
用户手动点击「开启预览」
后端启动 dev server（随机端口），可在内嵌 iframe 查看
或点击 ⤢ 在 Tauri WebviewWindow 全屏打开
    ↓
AI 运行测试，结果写入任务状态
    ↓
测试全部通过 → 进入「待审批」列
用户查看 Diff / 预览 → 点击「批准」
    ↓
进入「待合并」列
用户点击「合并到 main」按钮（可下拉选其他目标分支）
后端执行 git merge，合并完成后删除 worktree 和分支
    ↓
任务关闭
```

---

## 3. 前端设计

### 3.1 新增路由与侧边栏入口

- 路由：`/pipeline`
- 侧边栏新增「🚀 流水线」图标项，位于「🌿 Git」之后
- 新建 `tauri/src/features/pipeline/` 模块

### 3.2 页面布局

三列 Kanban，视觉风格采用 V3（左侧色条 + 中性暗色）：

| 列 | 状态 | 左侧色条颜色 |
|----|------|------------|
| AI 开发中 | `developing` | `#2563eb`（蓝） |
| 待审批 | `pending_review` | `#eab308`（黄） |
| 待合并 | `ready_to_merge` | `#4ade80`（绿） |

列头：状态名 + 右侧任务数量徽章。

### 3.3 任务卡片

**折叠态**（默认）：
- 任务 ID + 标题（`#42 用户登录功能`）
- 分支名（`feature/task-42`）
- 状态色条

**展开态**（点击卡片展开，同列只允许一张展开）：
- 任务标题 + 分支名 + 状态徽章
- 四阶段进度条（创建 / 开发 / 测试 / 合并），用细线段表示，已完成蓝色，进行中半透明，未开始灰色
- 测试结果摘要（`✓ 8  ✗ 2  running...`）
- 内嵌预览区（见 3.4）
- 操作按钮组（见 3.5）

### 3.4 内嵌预览区

预览未启动时：显示「▶ 开启预览」按钮占位区。
预览启动后：
- 顶部地址栏（只读，显示代理 URL）+ `⤢` 新窗口按钮
- `<iframe src="/proxy/task-{id}/">` 高度固定 120px
- 点击 `⤢` → 调用 Tauri 命令 `open_preview_window(url)`，打开独立 WebviewWindow

### 3.5 操作按钮

| 状态 | 按钮 |
|------|------|
| 开发中 | 日志 / Diff / 开启预览 |
| 待审批 | 预览 / Diff / **批准**（绿色主按钮） |
| 待合并 | **合并到 {default_branch}**（绿色主按钮）+ `▾` 下拉选其他目标分支 |

合并按钮下拉列表：从 `/api/git/branches` 拉取可用分支，排除当前 feature 分支。

### 3.6 设置页新增「服务管理」区块

位置：`features/settings` 内新增一个 section。

内容：
1. **运行中的预览服务列表**：每行显示任务名 + 端口 + 「关闭」按钮，顶部「全部关闭」按钮
2. **默认合并目标分支**：文本输入框，默认值 `main`，保存到后端配置

---

## 4. 后端设计

### 4.1 ProcessManager

新建 `backend/app/pipeline/process_manager.py`：

```python
class ProcessManager:
    """管理 dev server 子进程，单例"""
    _processes: dict[int, ProcessInfo]  # task_id → ProcessInfo

    async def start(task_id: int, cwd: str, command: str) -> int  # 返回端口
    async def stop(task_id: int) -> None
    async def stop_all() -> None
    def list() -> list[ProcessInfo]
    def get_port(task_id: int) -> int | None
```

`ProcessInfo`：`{ task_id, pid, port, cwd, started_at }`

端口分配：从 3700 开始递增，避开已占用端口。

### 4.2 新增 API 端点

```
GET  /api/previews              → 列出所有运行中的预览服务
POST /api/previews/{task_id}    → 启动指定任务的 dev server
DELETE /api/previews/{task_id}  → 停止指定任务的 dev server
DELETE /api/previews            → 停止全部

ANY  /proxy/{task_id}/{path:path} → 反向代理到对应端口
                                    （HTTP + WebSocket 均支持）

POST /api/git/merge             → body: {task_id, target_branch}
                                   执行 git merge feature/task-{id} → target
                                   合并后删除 worktree + 分支
```

### 4.3 扩展现有端点

`GET /api/git/branches` 响应新增 `task_id` 字段：若分支名匹配 `feature/task-{id}` 则关联。

### 4.4 配置存储

`backend/app/config.py` 新增：
- `default_merge_branch: str = "main"`
- `GET/PUT /api/config` 端点（已有则复用）

### 4.5 代理实现

使用 `httpx.AsyncClient` + `starlette` 的 `StreamingResponse` 实现反向代理。
WebSocket 代理使用 `websockets` 库。
Vite HMR 依赖 WebSocket，必须同时代理。

---

## 5. Tauri 层

`src-tauri/src/lib.rs` 新增命令：

```rust
#[tauri::command]
async fn open_preview_window(app: AppHandle, url: String) -> Result<(), String>
```

创建新的 `WebviewWindow`，尺寸 1280×800，标题「Preview」，加载传入的 URL。

---

## 6. 数据流

```
前端点击「开启预览」
  → POST /api/previews/{task_id}
  → ProcessManager.start(task_id, worktree_path, "npm run dev")
  → 返回 { port: 3721 }
  → 前端 iframe src = "/proxy/task-42/"
  → FastAPI 代理 /proxy/42/* → localhost:3721

前端点击 ⤢
  → invoke("open_preview_window", { url: "http://localhost:8765/proxy/42/" })
  → Tauri 打开新 WebviewWindow

前端点击「合并到 main」
  → POST /api/git/merge { task_id: 42, target_branch: "main" }
  → 后端 subprocess: git -C {repo} merge feature/task-42
  → 后端清理 worktree: git worktree remove
  → 后端删除分支: git branch -d feature/task-42
  → 返回 200 → 前端从看板移除卡片
```

---

## 7. 分支命名规范

| 场景 | 命名 | 示例 |
|------|------|------|
| AI 任务开发 | `feature/task-{id}` | `feature/task-42` |
| Bug 修复 | `fix/task-{id}` | `fix/task-55` |
| 直接提交 main | 适用于 < 5 分钟的小改动 | — |

Worktree 路径：`{repo_root}/.worktrees/task-{id}/`

---

## 8. 不在本次范围内

- 冲突解决 UI（合并冲突时仅报错提示，由用户手动解决）
- 多人协作 / 远程推送
- Pipeline dev/test/deploy 其他阶段的 executor（独立任务）
- 分支历史归档页面
