# Panel 组件

## 概览

可折叠的底部面板，位于 Content Area 底部，默认收起。展开后可通过拖拽条调整高度。

## Props

```typescript
interface PanelProps {
  children: ReactNode
  minHeight?: number    // 默认 150（px）
  maxHeight?: number    // 默认 400（px）
}
```

## 用法

```tsx
import { useShell } from '@/layouts'

function MyPage() {
  const { togglePanel } = useShell()

  return (
    <>
      <button onClick={togglePanel}>打开面板</button>
      <Panel>
        <div>日志内容...</div>
      </Panel>
    </>
  )
}
```

## 状态控制

通过 `useShell()` 控制：

```typescript
const { panelOpen, setPanelOpen, togglePanel, panelHeight, setPanelHeight } = useShell()
```

## 拖拽调整高度

顶部 4px 高的拖拽条：

1. `mousedown` → 记录起始 Y 和起始高度
2. `mousemove` → 计算 delta → `clamp(minHeight, maxHeight)` → 更新高度
3. `mouseup` → 清理事件监听

拖拽条 hover 时显示 `--tc-border-active` 颜色提示。

## 关键 CSS 类

| 类名 | 用途 |
|------|------|
| `.wrapper` | 外层容器，控制 height 过渡 |
| `.collapsed` | 收起状态（height: 0） |
| `.panel` | 面板主体（flex column） |
| `.dragBar` | 拖拽条（4px, cursor: ns-resize） |
| `.closeBtn` | 关闭按钮（IconX, 24×24） |
| `.content` | 内容区（flex: 1, overflow: auto） |
