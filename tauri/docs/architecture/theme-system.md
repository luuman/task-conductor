# 主题系统

## 架构概览

两层 Token 架构，参考 VS Code 的 color token 体系：

```
基础层（JSON 文件定义）          →   语义层（组件消费的 CSS Variables）
─────────────────────                ──────────────────────────────
base.bg-primary: "#1e1e1e"    →     --tc-sidebar-bg
base.accent: "#007acc"        →     --tc-focus-ring, --tc-border-active
```

## 基础层（14 个 Token）

在主题 JSON 文件中定义，每个主题必须提供全部 14 个值：

| Token | 用途 |
|-------|------|
| `base.bg-primary` | 主背景（内容区、侧边栏） |
| `base.bg-secondary` | 次背景（顶栏、面板） |
| `base.bg-hover` | 悬停背景 |
| `base.fg-primary` | 主文字色 |
| `base.fg-secondary` | 次文字色（标签、提示） |
| `base.accent` | 强调色（链接、焦点） |
| `base.accent-bg` | 强调背景（选中项） |
| `base.accent-fg` | 强调文字（选中项文字） |
| `base.border` | 边框色 |
| `base.border-active` | 活动边框（焦点、选中） |
| `base.error` | 错误色 |
| `base.warning` | 警告色 |
| `base.success` | 成功色 |
| `base.info` | 信息色 |

## 语义层（23 个 CSS Variables）

由 `tokens.ts` 中的 `SEMANTIC_MAP` 定义映射：

```typescript
export const SEMANTIC_MAP: Record<string, string> = {
  // 通用
  '--tc-foreground':              'base.fg-primary',
  '--tc-foreground-secondary':    'base.fg-secondary',
  '--tc-focus-ring':              'base.accent',

  // TopBar
  '--tc-topbar-bg':               'base.bg-secondary',
  '--tc-topbar-fg':               'base.fg-primary',
  '--tc-topbar-border':           'base.border',

  // Sidebar
  '--tc-sidebar-bg':              'base.bg-primary',
  '--tc-sidebar-fg':              'base.fg-primary',
  '--tc-sidebar-item-hover':      'base.bg-hover',
  '--tc-sidebar-item-active-bg':  'base.accent-bg',
  '--tc-sidebar-item-active-fg':  'base.accent-fg',
  '--tc-sidebar-border':          'base.border',

  // Content
  '--tc-content-bg':              'base.bg-primary',

  // Panel
  '--tc-panel-bg':                'base.bg-secondary',
  '--tc-panel-border':            'base.border',

  // 边框
  '--tc-border':                  'base.border',
  '--tc-border-active':           'base.border-active',

  // 状态
  '--tc-error':                   'base.error',
  '--tc-warning':                 'base.warning',
  '--tc-success':                 'base.success',
  '--tc-info':                    'base.info',

  // 滚动条
  '--tc-scrollbar-thumb':         'base.bg-hover',
  '--tc-scrollbar-thumb-hover':   'base.fg-secondary',
}
```

## 主题 JSON 格式

每个主题是一个 JSON 文件，存放在 `src/ui/theme/themes/`：

```json
{
  "name": "Dark+",
  "type": "dark",
  "colors": {
    "base.bg-primary": "#1e1e1e",
    "base.bg-secondary": "#252526",
    "base.bg-hover": "#2a2d2e",
    "base.fg-primary": "#cccccc",
    "base.fg-secondary": "#969696",
    "base.accent": "#007acc",
    "base.accent-bg": "#094771",
    "base.accent-fg": "#ffffff",
    "base.border": "#3c3c3c",
    "base.border-active": "#007acc",
    "base.error": "#f44747",
    "base.warning": "#cca700",
    "base.success": "#89d185",
    "base.info": "#75beff"
  }
}
```

## ThemeProvider

### 工作流程

1. 从 localStorage 读取上次主题名（key: `tc-theme`），默认 `Dark+`
2. 在注册表中查找对应的 ThemeJSON
3. 调用 `resolveTheme()` 将基础 token → 语义 CSS Variables
4. 注入 `document.documentElement.style`
5. 设置 `data-theme="dark|light"` 属性

### API

```typescript
const { theme, themeType, setTheme, themes, registerTheme } = useTheme()

// 切换主题
setTheme('Light+')

// 注册自定义主题
registerTheme({
  name: 'Monokai',
  type: 'dark',
  colors: { ... }
})

// 获取当前信息
theme       // "Dark+"
themeType   // "dark"
themes      // ["Dark+", "Light+"]
```

### 错误处理

- `setTheme('不存在的主题')` → `console.warn` 并忽略
- 主题 JSON 缺少某个 color key → 回退到 Dark+ 的对应值
- localStorage 不可用 → 静默失败，使用默认值

## 内置主题

| 主题 | 文件 | 类型 |
|------|------|------|
| Dark+ | `themes/dark-plus.json` | dark |
| Light+ | `themes/light-plus.json` | light |

## 在组件中使用

CSS Modules 中直接引用 CSS Variables：

```css
.myComponent {
  background: var(--tc-content-bg);
  color: var(--tc-foreground);
  border: 1px solid var(--tc-border);
}

.myComponent:hover {
  background: var(--tc-sidebar-item-hover);
}
```
