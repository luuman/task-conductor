# TaskConductor Roadmap

> 最后更新：2026-03-12

## 项目概述

TaskConductor 是 AI 驱动的任务流水线编排系统，核心提供两层能力：
1. **Claude 观测层** — 实时监听任意 Claude Code 会话的工具调用
2. **任务流水线** — 将软件开发任务自动化拆分为多阶段执行，支持人工审批节点

---

## Phase 1 — MVP ✅ 已完成

### 基础设施
- ✅ FastAPI 后端（SQLite + SQLAlchemy 2.0 Mapped style）
- ✅ React + Vite + TypeScript + Tailwind 前端
- ✅ PIN + JWT 认证体系（session.py + auth.py）
- ✅ Cloudflare Tunnel 集成（tunnel.py，`TC_TUNNEL=1` 启用）
- ✅ WebSocket 实时推送（ws/manager.py，频道 pub/sub）

### Claude 观测层
- ✅ Hook 安装脚本（scripts/install-hooks.sh，9 种事件注册）
- ✅ 9 种事件接收与持久化（ClaudeSession + ClaudeEvent 表）
- ✅ 双频道广播（`session:{id}` 单会话 + `sessions` 全局概览）
- ✅ Sessions 页面（双栏：会话列表 + 实时/历史 tab）
- ✅ ClaudeMonitorPanel（右侧滑出面板，工具调用实时日志）
- ✅ 对话历史页面（ConversationHistory.tsx）

### 流水线引擎
- ✅ 状态机（pipeline/engine.py，STAGE_ORDER + APPROVAL_REQUIRED）
- ✅ StageExecutor 基类（pipeline/executor.py）
  - validate → critic → retry 循环
  - ProjectKnowledge 知识库注入
  - Pydantic 结构化输出 + CriticOutput 审核
- ✅ Analysis 阶段（pipeline/stages/analysis.py，3 方案 A/B/C）
- ✅ PRD 阶段（pipeline/stages/prd.py）
- ✅ Plan 阶段（pipeline/stages/plan.py）
- ✅ Pipeline Runner（pipeline/runner.py，串行驱动 + APPROVAL_STAGES 暂停）
- ✅ ProjectScheduler 单例（scheduler.py，smart/queue/parallel 三种模式）

### 前端 UI
- ✅ 三栏布局（Linear.app 风格：Sidebar + Main + Panel）
- ✅ Dashboard（KPI 卡片 + Gauge + 周报 + 项目列表）
- ✅ TaskPipeline 透明度 UI（置信度 Gauge + 假设列表 + Critic 评审 + 重试计数）
- ✅ TaskWorkflow 流程图（@xyflow/react，蛇形两行布局）
- ✅ 知识库面板（KnowledgePanel.tsx，查看/删除）
- ✅ Claude Code 配置可视化（ClaudeConfig.tsx）
- ✅ 项目气泡图（ProjectsCanvas.tsx）

### 运维
- ✅ ClaudePool headless 模式（pool.py，asyncio 子进程 + stream-json）
- ✅ MetricsStore（内存 deque，TTFT/时长/成功率）
- ✅ 知识库（routers/knowledge.py，错误经验自动积累）
- ✅ TTS 通知（notify/tts.py，写入 speak-pipe）
- ✅ Webhook 通知（notify/webhook.py）
- ✅ 一键启动脚本（start.sh）

---

## Phase 2 — 流水线完善 🔄 进行中

### 剩余流水线阶段 Executor
- ⏳ UI 阶段 Executor（UI 设计/原型生成）
- ⏳ Dev 阶段 Executor（核心编码，Claude Code 直接修改代码）
- ⏳ Test 阶段 Executor（生成测试用例并执行）
- ⏳ Deploy 阶段 Executor（触发 CI/CD 或手动部署）
- ⏳ Monitor 阶段 Executor（部署后监控指标检查）

  > 扩展指南：[docs/development/how-to-add-stage.md](docs/development/how-to-add-stage.md)

### 任务创建工作流重构 📋 已设计，待实现
> 设计文档：[docs/plans/2026-03-08-task-creation-workflow-design.md](docs/plans/2026-03-08-task-creation-workflow-design.md)

从简单表单升级为 AI 驱动的智能创建流程：
- 📋 快速模式 vs AI 辅助模式双轨制
- 📋 对话式需求细化 + 实时需求文档预览
- 📋 多方案生成 + Workflow 流程图预览
- 📋 任务模板系统（6 种内置 + 学习生成）
- 📋 全局语音唤醒 + 面板内语音录入

### Git 源码控制集成 📋 已设计，待实现
> 设计文档：[docs/plans/2026-03-08-git-source-control-design.md](docs/plans/2026-03-08-git-source-control-design.md)

在 Files 页面基础上集成完整 Git 客户端：
- 📋 Changes Tab（Staged/Unstaged/Untracked + Commit/Push/Pull）
- 📋 Log Tab（分支图谱 SVG + Branches/Stash）
- 📋 Diff 查看器（inline/side-by-side + 语法高亮）
- 📋 后端 `routers/git.py`（14 个 Git API 端点）

---

## Phase 3 — 企业功能 📋 规划中

### 飞书集成 📋 已设计，待实现
> 设计文档：[docs/plans/2026-03-07-feishu-integration.md](docs/plans/2026-03-07-feishu-integration.md)

将飞书作为 TaskConductor 的消息入口：
- 📋 FeishuClient API 封装（自动 token 刷新）
- 📋 默认群对话模式（Claude Code 直接回复）
- 📋 项目群 Pipeline 模式（`/task 标题` 创建并启动流水线）
- 📋 审批卡片（approve/reject 按钮，结果回写）
- 📋 项目创建时自动建群
- 📋 后端 `feishu/` 模块（client + cards + handler + dispatcher）

### 多项目 Portfolio Dashboard 📋 规划中
- 📋 跨项目 KPI 汇总视图
- 📋 项目健康度评分
- 📋 资源使用趋势图表

### 团队协作与权限管理 📋 规划中
- 📋 多用户角色（Admin / Developer / Reviewer）
- 📋 任务分配与协作
- 📋 审批历史与审计日志

---

## 文档索引

| 文档 | 说明 |
|------|------|
| [CLAUDE.md](CLAUDE.md) | 开发指南（架构/API/约定） |
| [docs/architecture/directory-structure.md](docs/architecture/directory-structure.md) | 代码目录结构详解 |
| [docs/operations/status.md](docs/operations/status.md) | 各模块完成度状态 |
| [docs/development/how-to-add-stage.md](docs/development/how-to-add-stage.md) | 如何添加新的 Pipeline Stage |
| [docs/plans/](docs/plans/) | 各功能设计文档 |
