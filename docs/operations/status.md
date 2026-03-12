# 当前完成度与待开发项

> 最后更新：2026-03-12

## 已完整实现

| 模块 | 文件 | 状态 |
|------|------|------|
| Claude 观测层 | hooks.py + models.py + /hooks/claude | 完整 |
| Hook 安装脚本 | scripts/install-hooks.sh | 完整 |
| 9种事件接收与持久化 | main.py + routers/sessions.py | 完整 |
| WebSocket 广播 | ws/manager.py | 完整 |
| 会话监控前端 | Sessions.tsx + ClaudeMonitorPanel.tsx | 完整 |
| 对话历史前端 | ConversationHistory.tsx | 完整 |
| PIN + JWT 认证 | session.py + auth.py | 完整 |
| 项目/任务 CRUD | routers/projects.py + tasks.py | 完整 |
| Pipeline 状态机 | pipeline/engine.py | 完整 |
| StageExecutor 框架 | pipeline/executor.py | 完整（Critic+Retry+知识库） |
| Analysis 阶段 | pipeline/stages/analysis.py | 完整 |
| PRD 阶段 | pipeline/stages/prd.py | 完整 |
| Plan 阶段 | pipeline/stages/plan.py | 完整 |
| Pipeline Runner | pipeline/runner.py | 完整 |
| 任务调度器 | scheduler.py | 完整（smart/queue/parallel） |
| 性能指标采集 | claude/metrics_store.py | 完整 |
| 知识库管理 | routers/knowledge.py | 完整 |
| ClaudePool | claude/pool.py | 完整 |
| 仪表盘前端 | Dashboard.tsx | 完整 |
| 任务流程图 | TaskWorkflow.tsx | 完整 |
| 透明度 UI | TaskPipeline.tsx | 完整 |
| Claude 配置可视化 | ClaudeConfig.tsx + claude_config.py | 完整 |
| 项目视图（气泡图） | ProjectsCanvas.tsx | 完整 |

---

## 流水线阶段完成度

| 阶段 | 需审批 | Executor | 状态 |
|------|--------|----------|------|
| input | 否 | 无（起始阶段） | ✅ 框架就绪 |
| analysis | ✅ | pipeline/stages/analysis.py | ✅ 完整实现 |
| prd | ✅ | pipeline/stages/prd.py | ✅ 完整实现 |
| ui | ✅ | — | ⏳ 待实现 |
| plan | ✅ | pipeline/stages/plan.py | ✅ 完整实现 |
| dev | 否 | — | ⏳ 待实现（最高优先级） |
| test | ✅ | — | ⏳ 待实现 |
| deploy | ✅ | — | ⏳ 待实现 |
| monitor | 否 | — | ⏳ 待实现 |
| done | 否 | 无（终止阶段） | ✅ 框架就绪 |

> 新增阶段 Executor 请参考：[docs/development/how-to-add-stage.md](../development/how-to-add-stage.md)

---

## Phase 2 待实现功能

### 流水线剩余阶段 Executor

| 待开发项 | 优先级 | 说明 |
|---------|--------|------|
| Dev 阶段 Executor | 🔴 高 | 核心编码阶段，Claude Code 直接修改代码 |
| UI 阶段 Executor | 🔴 高 | UI 设计/原型生成 |
| Test 阶段 Executor | 🔴 高 | 生成测试用例并执行 |
| Deploy 阶段 Executor | 🟡 中 | 触发 CI/CD 或手动部署 |
| Monitor 阶段 Executor | 🟢 低 | 部署后监控指标检查 |

### 任务创建工作流重构

> 设计文档：[docs/plans/2026-03-08-task-creation-workflow-design.md](../plans/2026-03-08-task-creation-workflow-design.md)
> 实现状态：📋 已完整设计，未开始实现

| 子功能 | 说明 | 状态 |
|--------|------|------|
| 快速模式/AI辅助双轨制面板 | TaskCreationPanel 全屏 Modal | 📋 待实现 |
| 对话式需求细化 + 文档预览 | AI 引导 + 右侧 Markdown 实时预览 | 📋 待实现 |
| 多方案生成 + Workflow 预览 | 2-3 方案卡片 + 交互式流程图 | 📋 待实现 |
| 任务模板系统 | 6 种内置模板 + 学习生成 | 📋 待实现 |
| 语音唤醒 + 录入 | Web Speech API + Whisper 兜底 | 📋 待实现 |
| 新增 API 端点 | evaluate/refine/generate-plans/create-with-plan | 📋 待实现 |

### Git 源码控制集成

> 设计文档：[docs/plans/2026-03-08-git-source-control-design.md](../plans/2026-03-08-git-source-control-design.md)
> 实现状态：📋 已完整设计，未开始实现

| 子功能 | 说明 | 状态 |
|--------|------|------|
| Changes Tab | Staged/Unstaged/Untracked + Commit/Push/Pull | 📋 待实现 |
| Log Tab | 分支图谱 SVG + Branches/Stash 列表 | 📋 待实现 |
| Diff 查看器 | inline/side-by-side + 语法高亮 | 📋 待实现 |
| 后端 routers/git.py | 14 个 Git 操作 API 端点 | 📋 待实现 |

---

## Phase 3 规划中功能

### 飞书集成

> 设计文档：[docs/plans/2026-03-07-feishu-integration.md](../plans/2026-03-07-feishu-integration.md)
> 实现状态：📋 已完整设计（含完整代码），未开始实现

| 子功能 | 说明 | 状态 |
|--------|------|------|
| FeishuClient | 飞书 API 封装，自动 token 刷新 | 📋 待实现 |
| 卡片模板 | result/approval/error/welcome 等卡片 | 📋 待实现 |
| ChatHandler | 对话模式 + Pipeline 模式 | 📋 待实现 |
| FeishuDispatcher | 事件路由 + API 端点 | 📋 待实现 |
| 项目创建自动建群 | 创建项目时自动在飞书建群 | 📋 待实现 |
| 审批卡片集成 | 审批通知推送到飞书，按钮回调 | 📋 待实现 |

### 其他规划功能

| 待开发项 | 优先级 | 说明 |
|---------|--------|------|
| 多项目 Portfolio Dashboard | 🟡 中 | 跨项目 KPI 汇总、健康度评分 |
| 团队协作与权限管理 | 🟢 低 | 多用户角色、任务分配、审计日志 |
| Claude 配置增强 | 🟡 中 | 自定义 Commands/Agents 管理、全局 CLAUDE.md 编辑 |
