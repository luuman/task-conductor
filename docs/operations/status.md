# 当前完成度与待开发项

> 最后更新：2026-03-05

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

## 待实现

| 待开发项 | 优先级 | 说明 |
|---------|--------|------|
| UI 阶段 Executor | 高 | UI 设计/原型生成 |
| Dev 阶段 Executor | 高 | 核心编码阶段，Claude Code 修改代码 |
| Test 阶段 Executor | 高 | 生成测试用例并执行 |
| Deploy 阶段 Executor | 中 | 触发 CI/CD 或手动部署 |
| Monitor 阶段 Executor | 低 | 部署后监控 |
| Claude 配置增强 | 中 | 自定义 Commands/Agents 管理、全局 CLAUDE.md 编辑 |
