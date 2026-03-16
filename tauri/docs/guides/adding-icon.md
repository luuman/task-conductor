# 如何新增图标

## 步骤

### 1. 创建图标组件

在 `src/ui/icon/icons/` 下新建文件，如 `star.tsx`：

```tsx
import { Icon, type IconProps } from '../Icon'

export function IconStar(props: IconProps) {
  return (
    <Icon {...props}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </Icon>
  )
}
```

规范：
- 使用 `Icon` 基础组件包装
- 接收 `IconProps`（size, color, ...SVGAttributes）
- SVG 路径基于 24×24 viewBox
- stroke-based 线条风格（不用 fill，除非特殊需要）
- 组件名以 `Icon` 开头

### 2. 导出

在 `src/ui/icon/index.ts` 中添加：

```typescript
export { IconStar } from './icons/star'
```

### 3. 使用

```tsx
import { IconStar } from '@/ui/icon'

<IconStar size={16} />
<IconStar size={20} color="var(--tc-warning)" />
```

## SVG 路径来源

推荐从 [Lucide Icons](https://lucide.dev/icons/) 获取 SVG path，它们都是 24×24 viewBox + stroke-based，与我们的 Icon 基础组件兼容。
