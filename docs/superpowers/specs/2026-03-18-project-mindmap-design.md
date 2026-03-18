# 项目脑图功能设计

日期：2026-03-18
状态：已批准

## 概述

为 TaskConductor Tauri 客户端新增两种项目脑图可视化：

1. **文件结构脑图** — 在 DevTools 页面新增 tab，以脑图形式展示项目目录/模块结构
2. **任务全景脑图** — 独立管理页面 `/admin/mindmap`，以脑图展示项目→任务→阶段的三级树

两者共享同一套脑图基础组件，基于 @xyflow/react + dagre 实现。

## 需求

- 自动从后端数据生成初始脑图（文件树 / 任务数据）
- 完整编辑能力：拖拽移动、双击改名、Tab 添加子节点、Enter 添加同级、Delete 删除、右键菜单
- 撤销/重做（Ctrl+Z / Ctrl+Y，限 50 步）
- localStorage 持久化用户编辑
- 视觉风格对齐 Dribbble 参考图（网格点阵背景 + 彩色分支 + glow 选中 + 贝塞尔曲线连线）

## 技术方案

使用 @xyflow/react（通用流程图库）+ dagre（树形自动布局）。

选择理由：frontend 的 TaskWorkflow 已使用 @xyflow/react，团队有经验；灵活性足以覆盖两种脑图场景；dagre 提供开箱即用的有向图布局。

备选方案（已排除）：
- simple-mind-map：开箱即用但非 React 原生，与 CSS Modules 主题集成成本高
- D3 + SVG：最轻量但编辑功能全部自建，开发量过大

## 架构

### 组件结构

```
tauri/src/
├── components/mindmap/                  ← 共享脑图基础设施
│   ├── MindMapCanvas.tsx                ← @xyflow/react 封装
│   │   ├── 网格点阵背景（#13131a + 24px 间距圆点）
│   │   ├── 缩放/平移/fitView
│   │   ├── 左侧工具条（搜索/添加/连线/文本）
│   │   └── 底部胶囊缩放控件
│   ├── MindMapNode.tsx                  ← 自定义节点
│   │   ├── 彩色描边 + 分支色 8% 背景
│   │   ├── 图标 + 标签 + 状态 badge
│   │   ├── 折叠/展开控制
│   │   └── 子项计数
│   ├── MindMapEdge.tsx                  ← 自定义贝塞尔曲线边（颜色跟随分支）
│   ├── MindMapToolbar.tsx               ← 浮动工具栏（B/I/图片/链接/表情）
│   ├── MindMapContextMenu.tsx           ← 右键菜单（添加子节点/删除/复制/剪切）
│   ├── MindMapZoomControls.tsx          ← 底部缩放控件（−/○/百分比/+）
│   ├── use-mindmap-store.ts             ← Zustand store
│   ├── use-mindmap-layout.ts            ← dagre 布局 hook
│   ├── mindmap-utils.ts                 ← 数据转换 + 颜色分配
│   └── mindmap.module.css               ← 样式
│
├── features/__dev__/tabs/
│   └── FileTreeMap.tsx                  ← 文件结构脑图（DevTools 新 tab）
│
├── features/admin/pages/
│   └── AdminMindMap.tsx                 ← 任务全景脑图（独立管理页）
```

### 数据流

```
后端 API                    自动生成              画布渲染
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│ /api/files  │────→│ mindmap-utils│────→│ MindMapCanvas   │
│ /api/tasks  │     │ 转换为节点   │     │ (@xyflow/react) │
└─────────────┘     └──────────────┘     └────────┬────────┘
                                                  │
                                          用户编辑（拖拽/增删改）
                                                  │
                                          ┌───────▼────────┐
                                          │ Zustand Store   │
                                          │ (use-mindmap)   │
                                          └───────┬────────┘
                                                  │
                                          ┌───────▼────────┐
                                          │ localStorage   │
                                          └────────────────┘
```

## 数据模型

### MindMapNode

```typescript
interface MindMapNode {
  id: string
  type: 'root' | 'branch' | 'leaf'
  label: string
  icon?: string            // emoji 或文件图标名
  color?: string           // 分支主色（如 #2dd4bf）
  status?: string          // 任务状态 badge（done/dev/pending）
  meta?: Record<string, unknown>  // 扩展数据（文件路径/任务ID等）
  collapsed?: boolean
  parentId?: string | null
}
```

设计决策：
- 树结构用 `parentId` 扁平存储，@xyflow/react 和 dagre 都接受扁平输入
- edges 由 `parentId` 自动派生，不单独存储
- 撤销/重做用 history stack 存储状态快照（限 50 步）

### Zustand Store 接口

```typescript
interface MindMapState {
  nodes: MindMapNode[]
  // CRUD
  addNode(parentId: string, label: string): void
  addSibling(nodeId: string, label: string): void
  updateNode(id: string, patch: Partial<MindMapNode>): void
  removeNode(id: string): void       // 级联删除子节点
  toggleCollapse(id: string): void
  // 撤销/重做
  undo(): void
  redo(): void
  // 持久化
  save(key: string): void           // → localStorage
  load(key: string): void           // ← localStorage
  // 初始化
  initFromData(nodes: MindMapNode[]): void
}
```

### localStorage key 规则

- 文件脑图：`mindmap:file:{projectId}`
- 任务脑图：`mindmap:task:{projectId}`

## 后端新增

### GET /api/projects/{id}/file-tree

返回项目目录的递归树形 JSON，支持深度限制参数。

```
GET /api/projects/{id}/file-tree?depth=3
```

响应：

```json
{
  "name": "task-conductor",
  "type": "directory",
  "children": [
    {
      "name": "backend",
      "type": "directory",
      "children": [
        { "name": "app", "type": "directory", "children": [] },
        { "name": "requirements.txt", "type": "file" }
      ]
    }
  ]
}
```

任务全景脑图复用现有 `GET /api/projects` + `GET /api/projects/{id}/tasks`，无需新增 API。

## 视觉设计

### 配色

| 用途 | 色值 | 说明 |
|------|------|------|
| 画布背景 | `#13131a` | 深色底 |
| 网格圆点 | `rgba(255,255,255,0.06)` | 24px 间距 |
| 根节点 | `#ff6b6b` | 珊瑚红描边 + 8% 背景 |
| 分支 A | `#2dd4bf` | 青绿 |
| 分支 B | `#a855f7` | 紫色 |
| 分支 C | `#fbbf24` | 琥珀 |
| 分支 D | `#3b82f6` | 蓝色 |
| 分支 E | `#f472b6` | 粉色 |

分支颜色按顺序自动分配，循环使用。

### 节点样式

- 圆角：根节点 12px，分支/叶子 8px
- 描边：根节点 2px，其余 1.5px
- 背景：分支色 8% 透明度
- 选中效果：描边加粗 + `box-shadow: 0 0 16-20px {color} 15%` glow

### 连线

- 贝塞尔曲线（cubic bezier）
- 颜色跟随父节点分支色，透明度 25-40%
- 线宽：一级 2px，二级 1.5px

### 工具栏

- 左侧纵向工具条：搜索/添加/连线/文本，毛玻璃深色背景
- 浮动工具栏（选中节点上方）：B/I/图片/链接/表情/更多
- 底部缩放控件：胶囊形，−/适应/百分比/+

## 交互

### 节点操作

| 操作 | 行为 |
|------|------|
| 双击 | 编辑节点文本 |
| 右键 | 上下文菜单（添加子节点/删除/复制/剪切/粘贴） |
| 拖拽空白处 | 移动节点视觉位置 |
| 拖拽到另一节点上 | 重新挂载（reparent），改变树结构 |
| 点击折叠图标 | 展开/折叠子树 |
| Tab | 添加子节点 |
| Enter | 添加同级节点 |
| Delete | 删除选中节点 |

### 画布操作

| 操作 | 行为 |
|------|------|
| 滚轮 | 缩放 |
| 拖拽空白区域 | 平移画布 |
| Ctrl+Z / Ctrl+Y | 撤销/重做 |
| Ctrl+A | 全选 |
| 适应按钮 | fitView 自动缩放 |
| 重新生成/刷新 | 重新拉取后端数据覆盖当前状态 |

## 路由与导航变更

### 新增路由

```
/admin/mindmap → AdminMindMap
```

### DevTools 页面

新增 tab "File Map"，与现有 Components / UI Icons / File Icons 并列。

### AdminLayout 侧边栏

新增"脑图"导航项，排在"会话"和"设置"之间。

## 新增依赖

| 包 | 用途 |
|----|------|
| `@xyflow/react` | 流程图/脑图画布 |
| `dagre` | 树形自动布局 |
| `@types/dagre` | TypeScript 类型 |

## 新增文件清单

| 文件 | 说明 |
|------|------|
| `components/mindmap/MindMapCanvas.tsx` | 核心画布封装 |
| `components/mindmap/MindMapNode.tsx` | 自定义节点 |
| `components/mindmap/MindMapEdge.tsx` | 自定义曲线边 |
| `components/mindmap/MindMapToolbar.tsx` | 浮动工具栏 |
| `components/mindmap/MindMapContextMenu.tsx` | 右键菜单 |
| `components/mindmap/MindMapZoomControls.tsx` | 底部缩放控件 |
| `components/mindmap/use-mindmap-store.ts` | Zustand store |
| `components/mindmap/use-mindmap-layout.ts` | dagre 布局 hook |
| `components/mindmap/mindmap-utils.ts` | 数据转换 + 颜色 |
| `components/mindmap/mindmap.module.css` | 样式 |
| `features/__dev__/tabs/FileTreeMap.tsx` | 文件脑图 tab |
| `features/admin/pages/AdminMindMap.tsx` | 任务全景页 |
| `backend/app/routers/files.py` | file-tree API |

## 修改文件清单

| 文件 | 变更 |
|------|------|
| `features/__dev__/DevToolsPage.tsx` | 新增 File Map tab |
| `app/Router.tsx` | 新增 /admin/mindmap 路由 |
| `features/admin/AdminLayout.tsx` | 侧边栏新增脑图导航项 |
| `tauri/package.json` | 新增 3 个依赖 |
| `backend/app/main.py` | 注册 files router |

## 不做的事

- 评论面板（参考图右侧 Comments 栏）
- 多人协作编辑
- 导出 PNG/SVG（可后续迭代）
- 修改现有组件或页面样式
