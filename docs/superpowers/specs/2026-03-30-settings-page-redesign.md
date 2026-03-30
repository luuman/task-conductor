# Settings 页面重设计

**日期**：2026-03-30
**路径**：`tauri/src/features/settings/index.tsx`
**目标**：将单调的流水线列表扩展为完整的 Claude 配置可视化仪表盘，减少空间浪费，提升信息密度。

---

## 问题陈述

当前设置页只有一个功能：15 行垂直 toggle 列表控制流水线阶段。问题：
- 15 行列表占满全屏，需要滚动才能看完
- 缺少 Claude 相关配置的任何可视化
- 用户无法一眼看清楚项目的 Claude 配置全貌

---

## Claude 配置文件体系

Claude Code 通过 6 个文件管理配置，分 3 个层级，优先级从高到低：

```
settings.local.json（最高）
  └─ .claude/settings.json
       └─ ~/.claude/settings.json（最低）

CLAUDE.md（子目录）
  └─ CLAUDE.md（项目根）
       └─ ~/.claude/CLAUDE.md（最低）
```

| 层级 | 文件 | 提交 Git | 作用 |
|------|------|----------|------|
| 用户级 | `~/.claude/settings.json` | — | 全局权限基线 + 全局 Hooks |
| 用户级 | `~/.claude/CLAUDE.md` | — | 全局指令与个人偏好 |
| 项目级 | `CLAUDE.md` | ✅ | 项目技术栈、架构、规范 |
| 项目级 | `.claude/settings.json` | ✅ | 项目权限覆盖 + 项目级 Hooks |
| 项目级 | `.mcp.json` | ✅ | MCP 外部工具集成（独立于 settings.json）|
| 本地覆盖 | `.claude/settings.local.json` | ❌ | 个人本地覆盖，不影响他人 |

**关键说明**：
- MCP 服务器配置来自 `.mcp.json`，与 `settings.json` 中的 hooks/permissions 独立
- Hooks 需**合并展示**：`~/.claude/settings.json`（全局） + `.claude/settings.json`（项目）
- `settings.local.json` 在设置页中**只读展示**，标注"不提交 Git"，不提供编辑入口

---

## 设计决策

### 布局
- **无 Tab 切换**，所有板块直接铺开，按分组标签分隔
- **卡片网格**为主要展示单元，不用长条列表
- 信息**可视化**而非展示原始文字（规则提取为 chip、状态显示为彩色点/格子）

### 流水线阶段（原功能重设计）
- **横向节点流程图**替代垂直列表
- 节点样式：启用（紫色）/ 禁用（灰色划线）/ 固定（灰色）
- **黄色小点**标注需要人工审批的阶段
- 点击节点切换启用/禁用，hover 显示阶段说明 tooltip

---

## 板块清单与数据来源

### ① 流水线阶段
- **数据**：`project.stages_config`（JSON 字符串数组）
- **交互**：点击节点 → `PATCH /api/projects/:id`（更新 stages_config）
- **显示**：横向 SVG/CSS 流程图，15 个节点 + 箭头连线

### ② 自动化调度
- **数据**：`project.automation_config`（新增 JSON 字段）
- **字段**：`enabled: boolean`、`time_from: string`、`time_to: string`、`weekdays: number[]`、`max_concurrent: number`
- **交互**：toggle/时间输入/星期格子点击/并发数 preset chip

### ③ Claude 运行时配置
- **数据**：`project.claude_runtime_config`（新增 JSON 字段）
- **字段**：`timeout_seconds: number`、`max_retries: number`、`model: string`、`region: "global" | "cn"`
- **中国区预设**：region=cn 时 timeout 自动设为 240s，显示 🇨🇳 标记
- **交互**：preset chip（超时 60/120/240s）、重试次数 0-3、模型 select、区域 preset

### ④ CLAUDE.md 规则可视化
- **数据**：读取文件系统（通过后端新增 endpoint），使用 `project.path` 字段定位项目根目录
  - 项目级：`{project.path}/.claude/CLAUDE.md`（project.path 为 git 根目录绝对路径）
  - 全局：`~/.claude/CLAUDE.md`（展开 `~` 为实际 home 目录）
- **显示**：不展示原始 Markdown，而是提取关键规则条目渲染为 rule-chip（icon + 文字 + 分类标签）
- **规则提取**：后端解析 CLAUDE.md，识别 bullet 列表中的规则，AI 辅助分类（范围/DB/前端/UI/行为/语言/限制 等）
- **元信息**：文件大小、规则总数

### ⑤ Hooks 配置
- **数据**：合并读取两个文件
  - 全局：`~/.claude/settings.json` → hooks 字段
  - 项目级：`{project.path}/.claude/settings.json` → hooks 字段
- **9 种事件**：PreToolUse / PostToolUse / PostToolUseFailure / SessionStart / SessionEnd / Stop / SubagentStart / SubagentStop / Notification
- **显示**：3×3 卡片网格，每卡：名称 + 用途描述 + 触发时机标签（颜色区分） + 范围点（蓝=全局/绿=本项目） + mini toggle
- **范围点颜色**：
  - 蓝色（`~/.claude/settings.json`）
  - 绿色（`.claude/settings.json`）
- **toggle 行为**：调用 `POST /api/projects/:id/hooks-toggle`，后端直接修改对应的 settings.json 文件（全局 hook 修改 `~/.claude/settings.json`，项目 hook 修改 `{project.path}/.claude/settings.json`）
- **底部**：hook 命令路径 + "重新安装"按钮（调用 `install-hooks.sh`）

### ⑥ 记忆文件
- **数据**：读取 `~/.claude/projects/{encoded-path}/memory/` 目录，其中 `encoded-path` 是将 `project.path` 中的 `/` 替换为 `-`（如 `/home/user/foo` → `-home-user-foo`）
- **分类**：user / feedback / project / reference（读取每个文件 frontmatter 的 `type` 字段）
- **显示**：2×2 分类格子卡片，每格显示类型徽章、数量、条目名列表

### ⑦ 通知配置
- **数据**：`project.notification_config`（新增 JSON 字段）
- **字段**：`tts_enabled: boolean`、`webhook_enabled: boolean`、`webhook_url: string`、`triggers: string[]`
- **触发时机 chip**：需审批 / 任务完成 / 任务失败 / 阶段推进

### ⑧ 知识库
- **数据**：`ProjectKnowledge` 表（已有），`project.knowledge_config`（新增 JSON 字段）
- **显示**：总条目数 + 上限数字卡、自动积累开关、Prompt 注入开关、清理策略 select

### ⑨ 文档配置
- **数据**：`project.docs_config`（新增 JSON 字段）
- **字段**：`links: Array<{title, url_or_path, description}>`
- **显示**：文档卡片网格（路径/URL + 描述），支持"+ 添加"，自动更新架构文档开关

### ⑩ MCP 工具
- **数据**：读取 `~/.claude/settings.json` 的 `mcpServers` 字段
- **显示**：每个 server 一张卡片，server 名称 + 状态点 + tool chip 列表

### ⑪ 权限配置
- **数据**：读取 `~/.claude/settings.json` 的 `allow` / `deny` 列表
- **显示**：绿/红双栏，每条规则一个 pill

### ⑫ 环境变量
- **数据**：`project.env_config`（新增 JSON 字段，或读取 `.env` 文件）
- **显示**：`TC_` 前缀变量列表，敏感字段（PIN 等）脱敏展示

---

## 后端变更

### 新增 Project 字段（`models.py`）
```python
automation_config:     Mapped[Optional[str]]  # JSON
claude_runtime_config: Mapped[Optional[str]]  # JSON
notification_config:   Mapped[Optional[str]]  # JSON
docs_config:           Mapped[Optional[str]]  # JSON
env_config:            Mapped[Optional[str]]  # JSON
knowledge_config:      Mapped[Optional[str]]  # JSON
```

### 新增 API Endpoints
```
GET  /api/projects/:id/claude-config    → 读取 CLAUDE.md 文件内容 + 解析规则
GET  /api/projects/:id/hooks-status     → 读取 ~/.claude/settings.json + .claude/settings.json
POST /api/projects/:id/hooks-toggle     → 更新单个 hook 的启用状态
POST /api/projects/:id/hooks-reinstall  → 执行 install-hooks.sh
GET  /api/projects/:id/memory           → 读取记忆文件列表 + frontmatter
GET  /api/projects/:id/mcp-servers      → 读取 mcpServers 配置
GET  /api/projects/:id/permissions      → 读取 allow/deny 列表
PATCH /api/projects/:id/settings        → 批量更新以上各 JSON 配置字段
```

### CLAUDE.md 规则提取逻辑
后端解析 CLAUDE.md，提取 bullet list 条目，用规则关键词分类打标签（简单 heuristic，非 AI）：
- 路径关键词 → `范围`
- DB/数据库关键词 → `DB`
- CSS/UI/样式 → `UI`
- API/接口 → `前端`
- 语言/中文 → `语言`
- 其他 → `行为`

---

## 前端变更

### 文件结构
```
tauri/src/features/settings/
  index.tsx                    # 主页面（大幅重写）
  settings.module.css          # 样式扩展
  components/
    PipelineFlow.tsx            # 横向流程图组件
    HooksGrid.tsx               # Hooks 3×3 卡片网格
    ClaudeMdPanel.tsx           # CLAUDE.md 规则可视化
    MemoryPanel.tsx             # 记忆文件分类展示
    AutomationPanel.tsx         # 自动化调度设置
    ClaudeRuntimePanel.tsx      # Claude 运行时配置
    NotificationPanel.tsx       # 通知配置
    KnowledgePanel.tsx          # 知识库配置（复用 components/KnowledgePanel.tsx）
    DocsPanel.tsx               # 文档配置
    McpPanel.tsx                # MCP 工具展示
    PermissionsPanel.tsx        # 权限配置展示
    EnvPanel.tsx                # 环境变量展示
```

### 数据获取
- 使用 TanStack Query，每个面板独立 query key
- `PATCH /api/projects/:id/settings` 统一保存，乐观更新
- 文件系统读取（CLAUDE.md / hooks / memory / mcp）走各自独立 endpoint，`staleTime: 60_000`

### 关键 UI 规范
- **卡片**：`border: 1px solid var(--tc-border)`，`background: var(--tc-panel-bg)`，`border-radius: 9px`
- **节点启用色**：`rgba(100,80,255,.16)` 背景，`rgba(100,80,255,.45)` 边框
- **绿色状态点**：`var(--tc-success)`，box-shadow glow
- **蓝色**（全局 hook 范围）：`#4a80cc`
- **绿色**（项目 hook 范围）：`#3aaa60`
- **中国区黄色**：`#fbbf24`，加 🇨🇳 emoji

---

## 不在本次范围内

- CLAUDE.md 在线编辑（只读可视化）
- Hooks 命令自定义（只控制启用/禁用）
- MCP server 增删（只展示已有配置）
- 权限规则增删（只展示）

---

## 实现顺序建议

1. 后端新增 Project 字段 + migration
2. 后端新增文件系统读取 endpoints（CLAUDE.md / hooks / memory / mcp / permissions）
3. `PATCH /api/projects/:id/settings` 统一保存接口
4. 前端：PipelineFlow 组件（替换现有列表）
5. 前端：HooksGrid 组件 + toggle 联动
6. 前端：ClaudeMdPanel / MemoryPanel（只读）
7. 前端：AutomationPanel / ClaudeRuntimePanel / NotificationPanel（可编辑）
8. 前端：其余只读面板（MCP / 权限 / 环境变量 / 文档 / 知识库）
