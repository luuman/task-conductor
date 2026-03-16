# 图标系统

## Icon 基础组件

所有图标的包装器，统一 SVG 属性：

```typescript
interface IconProps extends SVGAttributes<SVGElement> {
  size?: number    // 默认 16
  color?: string   // 默认 currentColor
}
```

规范：24×24 viewBox，stroke-based（线条风格），strokeWidth=2。

## 用法

```tsx
import { IconSearch, IconBell } from '@/ui/icon'

<IconSearch size={18} />
<IconBell size={16} color="red" />
```

## 图标清单

| 组件名 | 文件 | 用途 |
|--------|------|------|
| `IconChevronLeft` | chevron-left.tsx | Sidebar 折叠按钮 |
| `IconChevronRight` | chevron-right.tsx | Sidebar 展开按钮 |
| `IconSearch` | search.tsx | TopBar 搜索 |
| `IconBell` | bell.tsx | TopBar 通知 |
| `IconSettings` | settings.tsx | TopBar 设置 |
| `IconMessage` | message.tsx | TopBar 消息 / AI 对话 |
| `IconPlus` | plus.tsx | 新建操作 |
| `IconFileText` | file-text.tsx | 文档/任务项 |
| `IconLayoutGrid` | layout-grid.tsx | 管理后台按钮 |
| `IconX` | x.tsx | Panel 关闭 |
| `IconGripHorizontal` | grip-horizontal.tsx | 拖拽手柄 |
| `IconUser` | user.tsx | 用户头像占位 |
| `IconLogo` | logo.tsx | 应用 Logo（六边形） |
| `IconMonitor` | monitor.tsx | 会话监控 |
| `IconGitBranch` | git-branch.tsx | 版本控制 |
| `IconFolder` | folder.tsx | 文件浏览 |

## 新增图标

1. 在 `src/ui/icon/icons/` 下创建 `my-icon.tsx`：

```tsx
import { Icon, type IconProps } from '../Icon'
export function IconMyIcon(props: IconProps) {
  return <Icon {...props}><path d="..." /></Icon>
}
```

2. 在 `src/ui/icon/index.ts` 中导出：

```typescript
export { IconMyIcon } from './icons/my-icon'
```
