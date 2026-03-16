# 如何新增业务页面

## 步骤

### 1. 创建 Feature 模块

在 `src/features/` 下新建目录：

```
src/features/sessions/
├── index.tsx              # 页面组件
└── sessions.module.css    # 页面样式
```

`index.tsx`：

```tsx
import styles from './sessions.module.css'

export default function SessionsPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>会话监控</h1>
    </div>
  )
}
```

`sessions.module.css`：

```css
.page {
  padding: 24px;
}

.title {
  font-size: 18px;
  font-weight: 600;
  color: var(--tc-foreground);
}
```

### 2. 添加路由

编辑 `src/app/Router.tsx`：

```typescript
// 添加 lazy import
const SessionsPage = lazy(() => import('../features/sessions'))

// 在 <Route element={<Layout />}> 内添加
<Route path="/sessions" element={<SessionsPage />} />
```

### 3. 添加国际化 key（如需要）

`src/i18n/zh.json`：
```json
"sessions": {
  "title": "会话监控",
  ...
}
```

`src/i18n/en.json`：
```json
"sessions": {
  "title": "Sessions",
  ...
}
```

## 注意事项

- 页面组件使用 `export default`（配合 `lazy()` 动态导入）
- 样式使用 CSS Modules，CSS Variables 引用主题 token
- 如果页面需要 API 数据，使用 TanStack Query 的 `useQuery`
- 如果页面需要 WebSocket，使用 `lib/ws` 的 `wsManager`
- 路由匹配后，页面通过 `<Outlet />` 渲染在 Layout 的 Content 区域内
