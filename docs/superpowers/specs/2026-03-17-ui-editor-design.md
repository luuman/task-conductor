# UI Editor 设计文档

> AI 驱动的 UI 组件构建器，集成到 TaskConductor 的 Pipeline UI 阶段

## 1. 概述

### 1.1 目标

为 TaskConductor 添加可视化 UI 编辑器，让 AI 生成 React+Tailwind 组件，用户可通过对话迭代、拖拽排序和属性/代码编辑进行微调，最终导出为项目源码、StageArtifact 或 .fig 文件。

### 1.2 入口

- **Pipeline UI 阶段**：PRD 阶段完成后，UI Executor 自动触发 AI 生成，用户在编辑器中审阅/微调后审批
- **Sidebar 独立入口**：用户随时可进入编辑器，独立于 pipeline 使用

### 1.3 核心能力

| 能力 | 说明 |
|------|------|
| AI 生成 UI | Claude 根据需求/PRD 生成组件树，对话式迭代修改 |
| 组件级拖拽 | 图层列表拖拽排序，调整组件顺序 |
| 属性编辑 | 选中组件后，右侧面板编辑 Tailwind 属性（背景色、间距、布局等） |
| 代码编辑 | 右侧 tab 切换到代码视图，直接编辑 React+Tailwind 代码 |
| 实时预览 | iframe + 临时 Vite dev server，完整 React 生态支持 |
| 三路导出 | 项目源码 / StageArtifact / .fig 文件 |

## 2. 架构

### 2.1 技术选型

| 层 | 技术 | 说明 |
|----|------|------|
| 数据模型 | 组件树 JSON（ComponentNode） | 单一数据源，所有操作都在树上进行 |
| 状态管理 | Zustand v5 | 编辑器独立 store，不影响现有 App.tsx props 提升 |
| 拖拽 | @dnd-kit（已有依赖） | 图层列表拖拽排序 |
| 代码编辑器 | Monaco Editor（或 CodeMirror） | 右侧代码 tab |
| 预览渲染 | iframe + Vite dev server | 后端管理临时 Vite 进程 |
| AI 调用 | ClaudePool（现有） | 结构化输出 ComponentNode[] |
| .fig 导出 | OpenPencil figma codec（移植） | ComponentNode → .fig 格式 |

### 2.2 数据流

```
用户/AI 输入
    ↓
组件树 JSON（Zustand store）
    ↓ 拖拽排序 → 更新 children 顺序
    ↓ 属性编辑 → 更新 node.props
    ↓ 代码编辑 → 标记为 custom code block
    ↓ AI 迭代 → apply patch（增/删/改节点）
    ↓
三路导出
    ├→ React codegen → .tsx 文件 → 项目源码
    ├→ JSON snapshot → StageArtifact（DB）
    └→ Figma codec → .fig 文件下载
```

## 3. 数据模型

### 3.1 ComponentNode

```typescript
interface ComponentNode {
  id: string                        // 唯一 ID
  type: 'page' | 'section' | 'component' | 'element'
  name: string                      // 显示名："Hero", "PricingCards"
  tag: string                       // HTML/React 标签："div", "button", "PriceCard"
  props: {
    className?: string              // Tailwind classes
    text?: string                   // 文本内容
    style?: Record<string, string>  // 内联样式（备用）
    [key: string]: any              // 自定义 props
  }
  children: string[]                // 子节点 id 列表（有序）
  parentId: string | null
  locked: boolean                   // 锁定不可编辑
  visible: boolean                  // 图层可见性
  customCode?: string               // 用户自定义代码覆盖（优先于树生成）
  meta?: {
    generatedBy: 'ai' | 'user' | 'template'
    version: number
  }
}
```

### 3.2 ChatMessage

```typescript
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string                   // 用户指令或 AI 回复文本
  patches?: NodePatch[]             // AI 回复附带的组件树变更
  timestamp: number
}
```

### 3.3 EditorStore（Zustand）

```typescript
interface EditorStore {
  // 文档
  nodes: Record<string, ComponentNode>
  rootId: string

  // 选择
  selectedId: string | null
  hoveredId: string | null

  // 历史
  history: { past: Snapshot[], future: Snapshot[] }

  // AI
  chatMessages: ChatMessage[]
  isGenerating: boolean

  // 操作
  selectNode: (id: string) => void
  moveNode: (id: string, newParentId: string, index: number) => void
  updateProps: (id: string, props: Partial<ComponentNode['props']>) => void
  applyPatch: (patch: NodePatch[]) => void
  undo: () => void
  redo: () => void
}
```

### 3.4 AI Patch 格式

```typescript
type NodePatch =
  | { op: 'add', node: ComponentNode, parentId: string, index?: number }
  | { op: 'update', id: string, changes: Partial<ComponentNode> }
  | { op: 'remove', id: string }
  | { op: 'move', id: string, newParentId: string, index: number }
```

## 4. 编辑器布局

### 4.1 页面结构

```
┌───────────────────────────────────────────────────┐
│  左侧面板(220px)  │  中间预览区(flex)  │  右侧面板(260px)  │
│                    │                    │                    │
│  ┌──────────┐      │  ┌──────────────┐  │  ┌──────────────┐ │
│  │ Layers   │      │  │ 工具栏       │  │  │ 属性 │ 代码  │ │
│  │ (dnd-kit │      │  │ Desktop/     │  │  │              │ │
│  │  拖拽)   │      │  │ Tablet/      │  │  │ 选中组件属性 │ │
│  │          │      │  │ Mobile       │  │  │ 或代码编辑器 │ │
│  ├──────────┤      │  ├──────────────┤  │  │              │ │
│  │Templates │      │  │              │  │  │              │ │
│  │ 模板库   │      │  │  iframe      │  │  │              │ │
│  └──────────┘      │  │  预览        │  │  ├──────────────┤ │
│                    │  │              │  │  │ 导出代码 .fig│ │
│                    │  └──────────────┘  │  └──────────────┘ │
└───────────────────────────────────────────────────┘

    ┌─────────────────┐
    │ AI Chat（悬浮）  │  ← 可拖拽到任意位置
    │ 对话式迭代       │     可最小化/关闭
    │ [输入指令...][↑] │
    └─────────────────┘
```

### 4.2 交互细节

- **图层列表**：dnd-kit 拖拽排序，点击选中，右键菜单（删除/复制/锁定）
- **预览区**：iframe 内注入选择脚本，点击组件 → postMessage → 父窗口高亮 + 选中
- **工具栏**：Desktop/Tablet/Mobile 视口切换、缩放、undo/redo
- **属性面板**：Tailwind class 编辑（背景色拾色器、间距 slider、布局按钮组）
- **代码面板**：Monaco Editor 显示选中组件代码，修改后标记为 customCode
- **AI Chat**：悬浮窗可拖拽，标题栏 grab，支持最小化/关闭/调整大小

## 5. AI 生成策略

### 5.1 Prompt 设计（参考 OpenPencil）

**首次生成**：
```
你是一个 UI 组件生成器。根据以下需求生成 React+Tailwind 组件树。

需求：{用户输入 或 PRD artifact}

设计原则：
- 8px 间距网格（8/16/24/32/48/80）
- Type scale: display 48-64, heading 28-36, body 16
- 配色: 1 primary + 1 accent + neutral scale
- 响应式优先

输出格式：ComponentNode[] JSON 数组
{schema 定义}
```

**迭代修改**：
```
当前组件树：{JSON}
用户指令：{message}

返回 NodePatch[] 数组，只包含需要变更的操作。
```

### 5.2 页面分解（参考 OpenPencil Orchestrator）

复杂页面自动拆分为 section 并行生成：
- 分析需求 → 识别 sections（nav, hero, features, pricing, faq, footer）
- 每个 section 独立生成 ComponentNode 子树
- 合并到 root page 节点下

### 5.3 设计原则注入

从 OpenPencil `design-principles/` 和 `role-definitions/` 移植：
- 组件角色定义（button, card, input, table 等在不同上下文的尺寸/样式规则）
- 配色方案生成规则
- 间距和排版规则

## 6. 预览系统

### 6.1 Vite Dev Server 管理

```python
# 后端新增 preview_manager.py
class PreviewManager:
    """管理临时 Vite dev server 实例"""

    async def create_preview(self, editor_id: str, nodes: list[dict]) -> str:
        """
        1. 创建临时目录 /tmp/tc-preview-{editor_id}/
        2. 生成 package.json, vite.config.ts, index.html, App.tsx
        3. ComponentNode[] → React JSX 代码写入 components/
        4. npm install（首次）+ vite dev（动态端口）
        5. 返回 http://localhost:{port}
        """

    async def update_preview(self, editor_id: str, nodes: list[dict]):
        """热更新：重新生成 JSX 文件，Vite HMR 自动刷新"""

    async def cleanup(self, editor_id: str):
        """停止 Vite 进程，清理临时目录"""
```

### 6.2 iframe 通信

```typescript
// 注入到预览 iframe 的脚本
// 点击组件 → 发送 componentId 到父窗口
window.addEventListener('click', (e) => {
  const target = e.target.closest('[data-component-id]')
  if (target) {
    window.parent.postMessage({
      type: 'component-select',
      id: target.dataset.componentId
    }, '*')
  }
})

// 父窗口 → iframe：高亮指定组件
window.addEventListener('message', (e) => {
  if (e.data.type === 'highlight') {
    // 添加/移除高亮边框
  }
})
```

## 7. 代码生成（React Codegen）

### 7.1 ComponentNode → JSX

```typescript
function generateJSX(node: ComponentNode, allNodes: Record<string, ComponentNode>): string {
  if (node.customCode) return node.customCode

  const children = node.children
    .map(id => generateJSX(allNodes[id], allNodes))
    .join('\n')

  const props = Object.entries(node.props)
    .filter(([k]) => k !== 'text' && k !== 'className')
    .map(([k, v]) => `${k}={${JSON.stringify(v)}}`)
    .join(' ')

  return `<${node.tag} className="${node.props.className || ''}" ${props}>
    ${node.props.text || ''}${children}
  </${node.tag}>`
}
```

### 7.2 导出为 .tsx 文件

每个 type='section' 的节点导出为独立组件文件：
- `Hero.tsx`, `PricingCards.tsx`, `FAQ.tsx`
- `Page.tsx` 组合所有 section

## 8. Figma 导出

### 8.1 移植范围

从 OpenPencil `src/services/figma/` 移植 .fig 文件编码器：
- ComponentNode → Figma Document JSON
- Figma Document JSON → .fig 二进制（ZIP 压缩）

### 8.2 映射规则

| ComponentNode | Figma Node |
|---------------|------------|
| page | PAGE |
| section | FRAME（Auto Layout） |
| component | COMPONENT |
| element(div) | FRAME |
| element(text) | TEXT |
| element(img) | RECTANGLE + Image Fill |

Tailwind classes → Figma 属性：
- `bg-*` → fills
- `p-*` / `m-*` → padding
- `flex` / `grid` → Auto Layout
- `text-*` → fontSize + fontWeight
- `rounded-*` → cornerRadius

## 9. 后端 API

### 9.1 新增端点

```python
# routers/editor.py

@router.post("/api/editor/generate")
async def generate_ui(req: GenerateRequest):
    """AI 首次生成组件树"""
    # req: { prompt: str, prd_artifact_id?: str, design_config?: dict }
    # resp: { nodes: ComponentNode[], rootId: str }

@router.post("/api/editor/chat")
async def chat_iterate(req: ChatRequest):
    """AI 对话迭代"""
    # req: { nodes: dict, message: str, history: ChatMessage[] }
    # resp: { patches: NodePatch[], reply: str }

@router.post("/api/editor/preview")
async def start_preview(req: PreviewRequest):
    """启动/更新预览"""
    # req: { editor_id: str, nodes: dict }
    # resp: { url: str }

@router.delete("/api/editor/preview/{editor_id}")
async def stop_preview(editor_id: str):
    """停止预览 server"""

@router.post("/api/editor/export/code")
async def export_code(req: ExportCodeRequest):
    """导出 React 代码到项目目录"""
    # req: { nodes: dict, rootId: str, output_dir: str }
    # resp: { files: [{ path: str, content: str }] }

@router.post("/api/editor/export/fig")
async def export_fig(req: ExportFigRequest):
    """导出 .fig 文件"""
    # req: { nodes: dict, rootId: str }
    # resp: FileResponse(.fig)

@router.get("/api/editor/templates")
async def list_templates():
    """组件模板库"""
    # resp: { templates: [{ id, name, category, preview, nodes }] }
```

### 9.2 Pipeline 集成

```python
# pipeline/stages/ui.py
class UIExecutor(StageExecutor):
    """UI 阶段 executor"""

    stage_name = "ui"

    async def execute(self, task, context):
        # 1. 从 PRD artifact 提取组件需求
        prd = self.get_previous_artifact(task, "prd")

        # 2. 调用 /api/editor/generate 生成初始组件树
        nodes = await self.generate_from_prd(prd)

        # 3. 保存为 artifact，状态设为 awaiting_approval
        self.save_artifact(task, "ui", {
            "nodes": nodes,
            "editor_url": f"/editor?task={task.id}"
        })

        # 4. 通知用户审阅（TTS + webhook）
        await notify_human_required(task, "UI 组件已生成，请在编辑器中审阅")
```

## 10. 前端文件结构

```
frontend/src/
  features/editor/              # 编辑器功能模块
    EditorPage.tsx              # /editor 路由页面
    stores/
      editor-store.ts           # Zustand store（nodes, history, selection）
      chat-store.ts             # AI 聊天状态
    components/
      LayerPanel.tsx            # 左侧图层列表（dnd-kit）
      TemplatePanel.tsx         # 组件模板库
      PreviewCanvas.tsx         # 中间 iframe 预览区
      Toolbar.tsx               # 工具栏（viewport/undo/redo）
      PropertyPanel.tsx         # 右侧属性编辑
      CodePanel.tsx             # 右侧代码编辑（Monaco）
      AIChatFloat.tsx           # 悬浮 AI 对话窗
      ExportBar.tsx             # 底部导出按钮
    lib/
      codegen.ts                # ComponentNode → JSX 代码生成
      figma-codec.ts            # ComponentNode → .fig（移植自 OpenPencil）
      design-principles.ts      # 设计原则常量（移植自 OpenPencil）
    types.ts                    # ComponentNode, NodePatch, ChatMessage 等类型
```

## 11. 从 OpenPencil 移植清单

| OpenPencil 路径 | 目标 | 用途 |
|-----------------|------|------|
| `services/ai/orchestrator-prompts.ts` | `lib/design-principles.ts` | 页面分解 prompt 策略 |
| `services/ai/design-principles/` | `lib/design-principles.ts` | 设计原则（间距、排版、配色） |
| `services/ai/role-definitions/` | `lib/design-principles.ts` | 组件角色定义 |
| `services/figma/` | `lib/figma-codec.ts` | .fig 文件编码 |
| `stores/document-store.ts` | `stores/editor-store.ts` | 参考 Zustand 状态设计 |
| `uikit/` | 后端模板库数据 | 预置组件模板 |

## 12. 不在 MVP 范围

- Figma 双向同步（仅单向导出 .fig）
- 多人协同编辑
- 版本对比/diff 视图
- 动画/过渡效果编辑
- 自定义组件库上传
- Vue/HTML/其他框架导出（预留接口）
