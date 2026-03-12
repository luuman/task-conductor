# 代码目录结构

```
task-conductor/
├── backend/app/
│   ├── main.py                  # FastAPI 入口，生命周期，所有端点注册
│   ├── models.py                # SQLAlchemy ORM（13个表，Mapped 2.0 style）
│   ├── database.py              # SQLite 引擎，create_all()
│   ├── hooks.py                 # Hook Payload 解析（parse_hook_event）
│   ├── session.py               # PIN 生成与验证（PinSession 单例）
│   ├── auth.py                  # JWT 创建与验证
│   ├── schemas.py               # Pydantic 请求/响应模型
│   ├── scheduler.py             # ProjectScheduler 单例（任务调度）
│   ├── tunnel.py                # Cloudflare Tunnel 集成
│   ├── tmux_manager.py          # tmux 会话管理
│   │
│   ├── claude/
│   │   ├── pool.py              # ClaudePool 单例：子进程 + 流式输出
│   │   ├── stream.py            # stream-json 行解析器
│   │   └── metrics_store.py     # MetricsStore 单例：性能与成本追踪
│   │
│   ├── pipeline/
│   │   ├── engine.py            # STAGE_ORDER 状态机 + APPROVAL_REQUIRED 集合
│   │   ├── executor.py          # StageExecutor 基类（validate→critic→retry）
│   │   ├── runner.py            # run_pipeline() 串行驱动主循环
│   │   ├── schemas.py           # 结构化输出 Pydantic 模型
│   │   └── stages/
│   │       ├── analysis.py      # ✅ 需求分析阶段（3方案 A/B/C）
│   │       ├── prd.py           # ✅ PRD 生成阶段
│   │       ├── plan.py          # ✅ 技术规划阶段
│   │       ├── ui.py            # ⏳ UI设计阶段（待实现）
│   │       ├── dev.py           # ⏳ 编码实现阶段（待实现）
│   │       ├── test.py          # ⏳ 测试阶段（待实现）
│   │       ├── deploy.py        # ⏳ 部署阶段（待实现）
│   │       └── monitor.py       # ⏳ 监控阶段（待实现）
│   │
│   ├── routers/                 # 各功能路由
│   │   ├── projects.py          # GET/POST /api/projects
│   │   ├── tasks.py             # GET/POST /api/tasks, approve, advance
│   │   ├── sessions.py          # Claude 观测层 API
│   │   ├── pipeline.py          # POST /api/pipeline/{id}/run-*
│   │   ├── metrics.py           # GET /api/metrics（KPI + Claude 性能 + 周报）
│   │   ├── knowledge.py         # GET/DELETE /api/projects/{id}/knowledge
│   │   ├── task_manager.py      # 任务管理增强端点（批量操作/过滤/排序）
│   │   ├── settings_router.py   # GET/POST /api/settings（tc_settings.json）
│   │   └── claude_config.py     # Claude Code 配置可视化 API（CLAUDE.md + settings）
│   │
│   ├── ws/manager.py            # ConnectionManager：频道订阅 + 广播
│   └── notify/
│       ├── dispatcher.py        # 通知分发（TTS + webhook）
│       ├── tts.py               # 写入 speak-pipe（小爱音箱）
│       └── webhook.py           # POST 到外部 webhook
│
├── frontend/src/
│   ├── App.tsx                  # 根组件，状态提升，全局 WS 监听
│   ├── lib/api.ts               # 所有 HTTP/WS 接口定义（统一 request()）
│   ├── hooks/
│   │   ├── useClaudeMonitor.ts  # 全局 Claude WS 监听 + 自动重连
│   │   └── useTaskWs.ts         # 单任务实时日志 WS
│   ├── pages/
│   │   ├── Login.tsx            # PIN 登录
│   │   ├── Dashboard.tsx        # KPI + 项目列表
│   │   ├── TaskPipeline.tsx     # 任务详情 + 流程图
│   │   ├── Sessions.tsx         # 双栏会话监控
│   │   ├── ConversationHistory.tsx  # 对话气泡展示
│   │   ├── ProjectsCanvas.tsx   # 项目视图（气泡图）
│   │   ├── ClaudeConfig.tsx     # Claude Code 配置可视化
│   │   ├── TaskManager.tsx      # 任务管理
│   │   └── Settings.tsx         # 系统设置
│   └── components/
│       ├── AppShell.tsx         # 三栏布局容器
│       ├── Sidebar.tsx          # 左侧导航 + 项目列表
│       ├── TaskWorkflow.tsx     # @xyflow/react 蛇形流程图
│       ├── ClaudeMonitorPanel.tsx  # 实时工具调用日志面板
│       └── KnowledgePanel.tsx   # 知识库查看面板
│
├── scripts/install-hooks.sh     # 向 ~/.claude/settings.json 注册 9 种 Hook 事件
├── start.sh                     # 一键启动（安装 Hook → 启动后端 → 启动前端）
├── ROADMAP.md                   # 项目路图（Phase 1/2/3）
└── docs/                        # 本文档目录
    ├── architecture/            # 架构设计文档
    ├── operations/              # 运维与状态文档
    ├── development/             # 开发者指南
    │   └── how-to-add-stage.md  # 如何添加新的 Pipeline Stage
    └── plans/                   # 功能设计文档
        ├── 2026-03-07-feishu-integration.md
        ├── 2026-03-08-git-source-control-design.md
        └── 2026-03-08-task-creation-workflow-design.md
```

---

## 计划中的未来模块

以下模块已完成设计，尚未实现：

| 模块路径 | 功能 | 设计文档 |
|---------|------|---------|
| `backend/app/feishu/` | 飞书消息集成（client/cards/handler/dispatcher） | [feishu-integration](../plans/2026-03-07-feishu-integration.md) |
| `backend/app/routers/git.py` | Git 源码控制 API（14 个端点） | [git-source-control-design](../plans/2026-03-08-git-source-control-design.md) |
| `backend/app/routers/task_creation.py` | AI 驱动的智能任务创建 API | [task-creation-workflow-design](../plans/2026-03-08-task-creation-workflow-design.md) |
| `backend/app/routers/templates.py` | 任务模板 CRUD + 推荐 | [task-creation-workflow-design](../plans/2026-03-08-task-creation-workflow-design.md) |
| `backend/app/routers/voice.py` | 语音转文字（Whisper） | [task-creation-workflow-design](../plans/2026-03-08-task-creation-workflow-design.md) |
