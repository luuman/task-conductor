# TopBar 组件

## 概览

顶部导航栏，固定高度 48px，三区 flexbox 布局。左区宽度对齐 Sidebar，右侧有竖分割线。

```
┌──────────────┬────────────────────────┬──────────────────────┐
│ Logo ‹       │  面包屑导航            │  🔍 ⚙ 💬 🔔 │ 👤 User│
│ (对齐Sidebar) │                        │                      │
└──────────────┴────────────────────────┴──────────────────────┘
```

## Props

```typescript
interface TopBarProps {
  logo?: ReactNode        // 文字标题（如 "TaskConductor"）
  logoIcon?: ReactNode    // Logo 图标（如 <IconLogo />）
  breadcrumb?: BreadcrumbItem[]  // 面包屑路径
  actions?: ReactNode     // 自定义操作区（插入到工具图标之前）
  userName?: string       // 用户名
  userRole?: string       // 用户角色（可选）
}

interface BreadcrumbItem {
  label: string
  href?: string           // 预留，暂未实现点击跳转
  icon?: ReactNode
}
```

## 用法

```tsx
<TopBar
  logoIcon={<IconLogo size={22} />}
  logo="TaskConductor"
  breadcrumb={[
    { label: 'Demo Project' },
    { label: '需求分析' },
  ]}
  userName="User"
  userRole="Admin"
/>
```

## 内置功能

- Sidebar 折叠/展开按钮（通过 `useShell()` 控制）
- 四个工具按钮：搜索、设置、消息、通知（目前无功能，预留）
- 用户头像 + 名称展示
- Tauri 窗口拖拽支持（`-webkit-app-region: drag`）

## 关键 CSS 类

| 类名 | 用途 |
|------|------|
| `.topbar` | 容器，grid-area: topbar |
| `.left` | Logo 区，宽度跟随 Sidebar |
| `.leftCollapsed` | 折叠时 Logo 区收窄到 48px |
| `.center` | 面包屑区，flex: 1 |
| `.right` | 工具栏 + 用户区 |
| `.iconBtn` | 工具图标按钮（32×32, hover 高亮） |
| `.userSection` | 用户区域，左侧有竖分割线 |
