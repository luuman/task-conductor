# Button 组件

## Props

```typescript
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg' | 'icon'
}
```

## 变体

| 变体 | 背景 | 文字 | 边框 |
|------|------|------|------|
| `default` | `--tc-border-active` | 白色 | 无 |
| `ghost` | 透明 | `--tc-foreground` | 无 |
| `outline` | 透明 | `--tc-foreground` | `--tc-border` |

## 尺寸

| 尺寸 | 高度 | 内边距 | 字号 |
|------|------|--------|------|
| `sm` | 28px | 0 8px | 12px |
| `md` | 32px | 0 12px | 13px |
| `lg` | 36px | 0 16px | 13px |
| `icon` | 28×28px | 0 | — |

## 用法

```tsx
import { Button } from '@/ui'

<Button>提交</Button>
<Button variant="ghost" size="sm">取消</Button>
<Button variant="outline">编辑</Button>
<Button size="icon"><IconPlus size={14} /></Button>
<Button disabled>不可用</Button>
```
