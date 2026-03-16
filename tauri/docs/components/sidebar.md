# Sidebar 组件

## 概览

左侧导航栏，支持展开（240px）和折叠（48px 图标模式）两种状态，带平滑过渡动画。

## Props

```typescript
interface SidebarProps {
  header?: ReactNode           // 顶部区域（标题 + 操作按钮）
  items: SidebarItem[]         // 导航项列表
  footer?: ReactNode           // 底部区域（如管理后台按钮）
  activeKey?: string           // 当前选中项 key
  onSelect?: (key: string) => void  // 选中回调（不内置路由，消费方负责 navigate）
}

interface SidebarItem {
  key: string
  label: string
  icon?: ReactNode
}
```

## 用法

```tsx
<Sidebar
  items={[
    { key: '1', label: '需求分析', icon: <IconFileText size={16} /> },
    { key: '2', label: '技术方案', icon: <IconFileText size={16} /> },
  ]}
  activeKey="1"
  onSelect={(key) => navigate(`/tasks/${key}`)}
  footer={
    <button className={sidebarStyles.footerBtn}>
      <IconLayoutGrid size={16} />
      <span className={sidebarStyles.footerBtnLabel}>管理后台</span>
    </button>
  }
/>
```

## 折叠行为

| 属性 | 展开 | 折叠 |
|------|------|------|
| 宽度 | 240px | 48px |
| 文字 | 显示 | 隐藏（`display: none`） |
| 图标 | 左侧对齐 | 居中 |
| Header 标题 | 显示 | 隐藏 |
| Footer 文字 | 显示 | 隐藏 |
| Tooltip | 无 | `title` 属性显示项名 |

折叠状态由 `useShell().sidebarCollapsed` 控制，通过 TopBar 的折叠按钮触发。

## 导航项状态

| 状态 | 背景 | 文字色 |
|------|------|--------|
| 默认 | 透明 | `--tc-sidebar-fg` |
| Hover | `--tc-sidebar-item-hover` | `--tc-sidebar-fg` |
| Active | `--tc-sidebar-item-active-bg` | `--tc-sidebar-item-active-fg` |

## 可复用的 CSS 类

Sidebar 的 CSS Module 导出了一些可在外部使用的类名（如 Layout.tsx 中使用）：

| 类名 | 用途 |
|------|------|
| `.headerTitle` | 分组标题样式（11px, 大写, 间距） |
| `.headerAction` | 头部操作按钮（22×22, hover 高亮） |
| `.footerBtn` | 底部按钮样式（全宽, flex, gap） |
| `.footerBtnLabel` | 底部按钮文字（折叠时隐藏） |

## 键盘支持

导航项支持 `Enter` 和 `Space` 键触发选中，`tabIndex={0}` 可聚焦。
