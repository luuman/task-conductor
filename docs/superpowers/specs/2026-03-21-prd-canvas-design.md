# PRD 需求画布 — 设计文档

## 概述

将 TaskConductor 的任务管理从"列表 + 表单"模式重构为**对话驱动 + 画布可视化**模式。用户与 AI 对话描述需求，AI 自动创建任务、生成需求文档和 PRD，内容实时渲染到 pixi.js 画布上。用户可在画布和文档面板上直接编辑。

## 核心架构

```
┌─── 顶栏标签（VS Code 风格） ──────────────────────────┐
│  📋 用户登录  │  📋 消息推送  │  📋 数据报表  │ + 新需求 │
├──────────────┬──┬──────────────────────────────────────┤
│ pixi.js 画布  │拆│  PRD 文档面板（可编辑）               │
│              │分│                                      │
│ · 模块卡片    │条│  · Markdown 编辑器                    │
│ · 连线依赖    │  │  · 实时同步画布节点                   │
│ · 界面线稿    │  │  · 双向编辑：改文档→更新画布           │
│ · AI 标注     │  │                                      │
├──────────────┴──┴──────────────────────────────────────┤
│  悬浮 AI 对话窗口（可拖拽位置+大小，富交互卡片/按钮）     │
└───────────────────────────────────────────────────────┘
```

## 一、页面布局

### 1.1 顶栏标签

- 每个需求会话对应一个 tab，显示状态色点 + 标题
- 支持关闭、拖拽排序
- 右侧："⊞ 拆分"按钮（垂直拆分当前面板）、"+ 新需求"按钮
- 技术：React DOM

### 1.2 VS Code 拆分

- 左右两个面板，中间拖拽分隔条调整比例
- 左默认画布，右默认 PRD 文档
- 可切换面板内容：需求画布 / PRD 文档 / 依赖关系 / 进度总览
- 支持多次拆分（最多 3 栏）
- 技术：CSS flex + pointer event 拖拽

### 1.3 悬浮 AI 对话

- `position: fixed`，z-index 最高
- 头部拖拽移动位置，右下角拖拽调整大小
- 最小化 / 最大化 / 关闭
- 全局可用，切换 tab 时上下文自动切换
- 技术：React DOM

## 二、pixi.js 需求画布

### 2.1 渲染引擎

- pixi.js v8（WebGL 2）
- 无限画布：平移（拖拽空白区域）+ 缩放（滚轮，0.1x~3x）
- 三级 LOD：
  - `zoom < 0.3`：色块 + 标题截断
  - `zoom 0.3~0.7`：小卡片（标题 + 状态 + 进度条）
  - `zoom > 0.7`：完整卡片（全部信息 + 阴影 + 边框）

### 2.2 节点类型

| 类型 | 渲染 | 可编辑 |
|------|------|--------|
| 功能模块卡片 | 圆角矩形 + 左色条 + 图标 + 标题 + 状态徽章 + 功能列表（✓/○） | 双击标题编辑，点击功能项切换状态 |
| 界面线稿 | 虚线边框 + 窗口装饰 + 内部 UI 元素模拟 | 双击打开线稿编辑器（DOM overlay） |
| AI 标注 | 半透明背景 + 图标 + 文字 | 双击编辑文字 |
| 分组区域 | 极低透明度填充 + 标签 | 拖拽调整范围 |

### 2.3 交互

| 操作 | 行为 |
|------|------|
| 单击节点 | 选中，显示操作手柄 |
| 双击节点 | 进入编辑模式（DOM overlay 覆盖在 canvas 上） |
| 拖拽节点 | 移动位置，连线跟随 |
| 框选 | 从空白处拖拽画选框，选中多个节点 |
| 右键节点 | 上下文菜单（编辑/删除/复制/改状态/添加子节点） |
| 右键空白 | 上下文菜单（添加模块/添加线稿/添加标注/粘贴） |
| 从节点边缘拖出 | 创建连线到另一个节点 |
| Delete 键 | 删除选中节点 |
| Ctrl+Z / Ctrl+Y | 撤销 / 重做 |
| Ctrl+A | 全选 |
| 空格+拖拽 | 平移画布（不选中节点） |

### 2.4 连线

- 贝塞尔曲线，从源节点右侧到目标节点左侧
- 颜色跟随源节点状态色，30% 透明
- 拖拽连线创建：从节点边缘拖出 → 悬停目标节点高亮 → 松开建立依赖
- 点击连线 → 选中 → Delete 删除

### 2.5 自动布局

- 算法：dagre（已安装）
- 方向：LR（左到右）
- 触发：点击"自动布局"按钮，或首次从 AI 生成时
- 自由摆放：手动拖拽后节点位置持久化到后端

### 2.6 minimap

- 右下角小地图（150×100px）
- 显示全部节点缩略位置 + 当前视口框
- 点击/拖拽 minimap 快速导航

## 三、AI 对话系统

### 3.1 Claude 会话管理

```
Task 表新增: claude_session_id (String, nullable)

用户发消息:
  1. 检查 task.claude_session_id
  2. 有 → claude -p "msg" --resume {session_id} --output-format stream-json
  3. 无 → claude -p "msg" --system-prompt "..." --output-format stream-json
  4. 从 stream 中提取 session_id → 存入 task.claude_session_id
  5. 进程执行完毕自动退出（不常驻）
  6. 下次消息再 --resume
```

优势：进程不常驻省内存，session_id 保证上下文延续。

### 3.2 富交互消息类型

AI 回复不只是纯文本，支持以下卡片类型：

| 类型 | 描述 | 用户交互 |
|------|------|---------|
| **选项卡片** | 标题 + 描述 + 多选/单选列表 + 确认/跳过按钮 | 点击选择 → 点击确认 |
| **快捷标签** | 行内 tag 按钮组 | 点击切换选中状态 |
| **进度卡片** | 模块确认进度条 + "全部确认"按钮 | 点击确认 |
| **线稿预览** | 内嵌小型线稿 + "查看大图/编辑/固定到画布"操作 | 点击操作按钮 |
| **模块引用** | 蓝色标签 `📋 模块名` | 点击跳转画布定位 |
| **确认提示** | 是/否二选一 | 点击按钮 |

消息协议扩展：
```json
{
  "type": "chat_chunk",
  "data": {
    "text": "...",
    "cards": [
      {
        "type": "choice",
        "title": "微信登录方式",
        "options": [
          {"id": "scan", "label": "PC 扫码", "desc": "...", "selected": true},
          {"id": "mp", "label": "公众号授权", "desc": "..."}
        ],
        "multi": true
      }
    ]
  }
}
```

用户点击卡片按钮后，前端自动发送结构化回复：
```json
{"type": "chat", "message": "__CARD_REPLY__", "card_data": {"type": "choice", "selected": ["scan", "mp"]}}
```

### 3.3 AI 自动创建任务

AI 通过 system_prompt 指引，在判断用户描述了一个新需求时，回复中包含特殊标记：

```
---NEW_TASK---
{"title": "用户登录系统", "description": "支持微信扫码和手机验证码登录"}
---NEW_TASK---
```

前端检测到后：
1. 调用 `POST /api/projects/{id}/tasks` 创建任务
2. 自动切换到新 tab
3. 开始需求访谈（`POST /api/tasks/{id}/interview/start`）

### 3.4 AI → 画布实时同步

AI 回复中包含画布更新指令：

```
---CANVAS_UPDATE---
{"action": "add_module", "data": {"id": "auth", "title": "用户认证", "icon": "🔐", "features": [...]}}
---CANVAS_UPDATE---
```

前端解析后直接更新 pixi.js 画布，无需刷新。

## 四、PRD 文档面板

### 4.1 可编辑文档

- 基于 Markdown 编辑器（推荐 @uiw/react-md-editor 或 milkdown）
- AI 生成 PRD 后自动填充
- 用户可直接编辑任何章节
- 编辑后自动保存到 `task.prd_content`

### 4.2 双向同步

- **画布 → 文档**：画布上修改模块标题/状态/功能列表 → 文档对应章节自动更新
- **文档 → 画布**：文档中编辑模块描述 → 画布上对应卡片内容更新
- 同步粒度：模块级别（每个模块有唯一 ID 关联）

### 4.3 编辑节点（画布上）

- 双击卡片标题 → DOM input overlay 出现在 canvas 上对应位置
- 编辑完成（Enter/失焦）→ 更新 pixi 节点 + 同步 PRD 文档
- 功能列表项：点击 ○ 变 ✓，点击 ✓ 变 ○

## 五、聊天消息性能（百万级）

### 5.1 架构

```
后端 DB (全量)
    ↓ 按需分页 API (GET /api/tasks/{id}/interview/messages?before=xxx&limit=50)
    ↓
IndexedDB 本地缓存 (已拉取的消息)
    ↓
内存 (当前可视区 ± 200 条)
    ↓
虚拟滚动渲染 (可视区 ~20 条 DOM 节点)
```

### 5.2 实现

- 虚拟滚动：react-virtuoso（支持反向滚动、动态高度）
- 本地缓存：IndexedDB（Dexie.js），按 task_id 分表
- 加载策略：初始加载最新 50 条，向上滚动时加载更早的 50 条
- 搜索：后端全文搜索 API，前端只渲染结果

## 六、数据模型变更

### 6.1 Task 表新增

```python
claude_session_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
canvas_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON: 节点位置/连线
```

### 6.2 InterviewMessage 表扩展

```python
# 已有: id, task_id, role, content, extra, created_at
# extra 字段存储富交互卡片数据（JSON）
```

### 6.3 新增 API

```
GET  /api/tasks/{id}/canvas          → 获取画布数据（节点+连线+位置）
PUT  /api/tasks/{id}/canvas          → 保存画布数据
GET  /api/tasks/{id}/interview/messages?before={id}&limit=50  → 分页消息
```

## 七、技术选型

| 组件 | 技术 | 理由 |
|------|------|------|
| 画布渲染 | pixi.js v8 | WebGL，200+ 节点不卡 |
| 自动布局 | dagre | 已安装，成熟的 DAG 布局 |
| 文档编辑 | milkdown 或 @uiw/react-md-editor | Markdown 编辑，轻量 |
| 虚拟滚动 | react-virtuoso | 反向滚动支持好，动态高度 |
| 本地缓存 | Dexie.js (IndexedDB) | API 简洁，性能好 |
| 状态管理 | Zustand | 已有基础设施 |

## 八、文件结构

```
tauri/src/
├── features/
│   └── prd-canvas/                    # 新增：PRD 画布页面
│       ├── index.tsx                  # 页面入口（tab栏 + 拆分布局）
│       ├── prd-canvas.module.css
│       ├── components/
│       │   ├── CanvasPanel.tsx        # pixi.js 画布容器
│       │   ├── PrdDocPanel.tsx        # PRD 文档编辑面板
│       │   ├── TabBar.tsx             # 顶栏标签
│       │   └── SplitLayout.tsx        # 可拖拽拆分布局
│       ├── canvas/
│       │   ├── PixiCanvas.ts          # pixi Application 初始化 + 世界容器
│       │   ├── ModuleNode.ts          # 功能模块卡片节点
│       │   ├── WireframeNode.ts       # 界面线稿节点
│       │   ├── NoteNode.ts            # AI 标注节点
│       │   ├── EdgeRenderer.ts        # 连线渲染
│       │   ├── SelectionManager.ts    # 框选/多选
│       │   ├── ContextMenu.ts         # 右键菜单
│       │   ├── DomOverlay.ts          # 编辑时的 DOM 覆盖层
│       │   ├── Minimap.ts             # 小地图
│       │   └── CanvasStore.ts         # 画布状态 Zustand store
│       └── hooks/
│           ├── useCanvasSync.ts       # 画布 ↔ PRD 双向同步
│           └── useMessagePagination.ts # 消息分页 + IndexedDB
│
├── components/
│   └── FloatingChat/                  # 重构：悬浮 AI 对话
│       ├── FloatingChat.tsx           # 主组件（拖拽+resize+富交互）
│       ├── FloatingChat.module.css
│       ├── MessageList.tsx            # 虚拟滚动消息列表
│       ├── RichCard.tsx               # 富交互卡片渲染
│       ├── ChoiceCard.tsx             # 选项卡片
│       ├── ProgressCard.tsx           # 进度卡片
│       ├── WireframePreview.tsx       # 线稿预览卡片
│       └── index.ts
│
├── lib/store/
│   └── chat.ts                        # 扩展：claude_session_id 管理
│
└── hooks/
    └── useChatStream.ts               # 扩展：富卡片解析 + session resume
```

## 九、不做的事

- 不做实时协同编辑（单用户场景）
- 不做画布上的手绘/自由画笔
- 不做 3D 视图
- 线稿编辑器不做全功能 UI 设计工具（只支持基础元素拖拽）
- 不做离线模式（需要后端 API）
