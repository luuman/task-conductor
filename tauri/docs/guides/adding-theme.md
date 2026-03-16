# 如何新增主题

## 步骤

### 1. 创建主题 JSON

在 `src/ui/theme/themes/` 下新建文件，如 `monokai.json`：

```json
{
  "name": "Monokai",
  "type": "dark",
  "colors": {
    "base.bg-primary": "#272822",
    "base.bg-secondary": "#1e1f1c",
    "base.bg-hover": "#3e3d32",
    "base.fg-primary": "#f8f8f2",
    "base.fg-secondary": "#75715e",
    "base.accent": "#a6e22e",
    "base.accent-bg": "#3e3d32",
    "base.accent-fg": "#f8f8f2",
    "base.border": "#3e3d32",
    "base.border-active": "#a6e22e",
    "base.error": "#f92672",
    "base.warning": "#e6db74",
    "base.success": "#a6e22e",
    "base.info": "#66d9ef"
  }
}
```

必须提供全部 14 个 color key，缺失项会回退到 Dark+ 的值。

### 2. 在 ThemeProvider 中注册

编辑 `src/ui/theme/ThemeProvider.tsx`，导入并注册：

```typescript
import monokai from './themes/monokai.json'

// 在 registry 初始化中添加：
const registry = useRef<Map<string, ThemeJSON>>(
  new Map([
    ['Dark+', darkPlus as ThemeJSON],
    ['Light+', lightPlus as ThemeJSON],
    ['Monokai', monokai as ThemeJSON],  // ← 新增
  ])
)
```

### 3. 使用

```typescript
const { setTheme } = useTheme()
setTheme('Monokai')
```

## 注意事项

- `type` 字段只能是 `'dark'` 或 `'light'`，影响 `data-theme` 属性
- 主题名（`name`）是注册 key，必须唯一
- 运行时也可通过 `registerTheme()` 动态注册
