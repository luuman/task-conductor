# 布局系统

## 整体结构

AppShell 使用 CSS Grid 实现三区布局：

```
┌────────────────────────────────────────────────────┐
│ TopBar（48px）                                      │
│ ┌──────────────┬───────────────────────────────────┐│
│ │ Logo 区      │  面包屑        工具栏 + 用户      ││
│ │ (对齐Sidebar) │                                   ││
│ └──────────────┴───────────────────────────────────┘│
├──────────────┬─────────────────────────────────────┤
│ Sidebar      │                                      │
│ 240px ↔ 48px │          Content Area               │
│              │         （Outlet 渲染）              │
│  导航项列表   │                                      │
│              ├─────────────────────────────────────┤
│              │    Panel（可折叠，默认收起）          │
│  [管理后台]   │    拖拽调整高度，min 150 / max 400  │
└──────────────┴─────────────────────────────────────┘
```

## CSS Grid 定义

```css
.shell {
  display: grid;
  grid-template-rows: 48px 1fr;
  grid-template-columns: 240px 1fr;    /* 展开状态 */
  grid-template-areas:
    "topbar  topbar"
    "sidebar main";
  height: 100vh;
  width: 100vw;
  transition: grid-template-columns 0.2s ease;
}

/* 折叠状态 */
.shell[data-sidebar-collapsed="true"] {
  grid-template-columns: 48px 1fr;
}
```

## ShellContext

`AppShell` 通过 React Context 向子组件提供布局状态：

```typescript
interface ShellContextValue {
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
  togglePanel: () => void
  panelHeight: number
  setPanelHeight: (height: number) => void
}
```

任何子组件通过 `useShell()` hook 获取：

```typescript
import { useShell } from '@/layouts'

function MyComponent() {
  const { sidebarCollapsed, toggleSidebar, togglePanel } = useShell()
  // ...
}
```

## 组件组合方式

`Layout.tsx` 中的组合：

```tsx
<AppShell>
  <TopBar ... />
  <Sidebar ... />
  <div className={shellStyles.main}>
    <div className={shellStyles.content}>
      <Outlet />                    {/* 路由内容 */}
    </div>
    <Panel>                         {/* 可折叠底部面板 */}
      {panelContent}
    </Panel>
  </div>
</AppShell>
```

- `TopBar` 和 `Sidebar` 直接作为 AppShell 的子元素，通过 `grid-area` 定位
- `main` 区域是 flex column，`content` 占 `flex: 1`，Panel 在底部

## TopBar 与 Sidebar 的对齐

TopBar 的左区（Logo + 折叠按钮）宽度跟随 Sidebar：

```css
.left {
  width: var(--tc-sidebar-width, 240px);  /* 匹配 Sidebar 宽度 */
  border-right: 1px solid var(--tc-topbar-border);  /* 竖分割线 */
  transition: width 0.2s ease;
}

.leftCollapsed {
  width: 48px;  /* 折叠时同步收窄 */
}
```

视觉上，TopBar 的竖分割线与 Sidebar 的右边框形成一条连贯的竖线。

## Sidebar 折叠行为

| 状态 | 宽度 | 文字 | 图标 | Header |
|------|------|------|------|--------|
| 展开 | 240px | 显示 | 显示 | 标题 + 操作按钮 |
| 折叠 | 48px | 隐藏 | 居中显示 | 仅操作按钮 |

折叠通过 CSS 实现，不销毁 DOM：

```css
.collapsed .itemLabel { display: none; }
.collapsed .item { justify-content: center; }
.collapsed .headerTitle { display: none; }
.collapsed .footerBtnLabel { display: none; }
```

折叠时每个项显示 `title` tooltip。

## Panel 拖拽调整

Panel 顶部有一个 4px 高的拖拽条：

```
拖拽流程：
mousedown on dragBar
  → 记录 startY, startHeight
  → mousemove → 计算 delta → clamp(minHeight, maxHeight) → setPanelHeight
  → mouseup → 清理监听器
```

Panel 收起时 `height: 0`，展开时按 `panelHeight` 渲染。
