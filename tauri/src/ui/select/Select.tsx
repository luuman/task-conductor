/**
 * Select — 通用下拉选择组件
 * 支持搜索过滤、自定义渲染、键盘导航
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { IconChevronLeft } from '../icon'
import styles from './select.module.css'

export interface SelectOption {
  value: string
  label: string
  desc?: string
}

export interface SelectProps {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchable?: boolean
  searchPlaceholder?: string
  wide?: boolean
  /** 自定义列表项渲染 */
  renderItem?: (option: SelectOption, isActive: boolean) => React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export function Select({
  options, value, onChange,
  placeholder = '请选择',
  searchable = false,
  searchPlaceholder = '搜索...',
  wide = false,
  renderItem,
  className,
  style,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = options.find(o => o.value === value)
  const displayText = selected?.label || placeholder

  // 打开时聚焦搜索
  useEffect(() => {
    if (open && searchable) {
      setTimeout(() => searchRef.current?.focus(), 50)
    }
    if (!open) setSearch('')
  }, [open, searchable])

  // 过滤
  const filtered = search
    ? options.filter(o =>
        o.label.toLowerCase().includes(search.toLowerCase()) ||
        o.desc?.toLowerCase().includes(search.toLowerCase())
      )
    : options

  const handleSelect = useCallback((val: string) => {
    onChange(val)
    setOpen(false)
    setSearch('')
  }, [onChange])

  // 键盘导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault()
      setOpen(true)
    }
  }, [open])

  return (
    <div className={`${styles.root} ${className || ''}`} ref={rootRef} style={style}>
      <button
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        onClick={() => setOpen(!open)}
        onKeyDown={handleKeyDown}
      >
        <span className={styles.triggerText}>{displayText}</span>
        <IconChevronLeft
          size={10}
          className={styles.triggerIcon}
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(-90deg)' }}
        />
      </button>

      {open && (
        <>
          <div className={styles.overlay} onClick={() => { setOpen(false); setSearch('') }} />
          <div className={`${styles.dropdown} ${wide ? styles.dropdownWide : ''}`}>
            {searchable && (
              <div className={styles.search}>
                <input
                  ref={searchRef}
                  type="text"
                  className={styles.searchInput}
                  placeholder={searchPlaceholder}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            )}
            <div className={styles.list}>
              {filtered.length === 0 ? (
                <div className={styles.emptyMsg}>无匹配项</div>
              ) : (
                filtered.map(o => (
                  <div
                    key={o.value}
                    className={`${styles.item} ${o.value === value ? styles.itemActive : ''}`}
                    onClick={() => handleSelect(o.value)}
                  >
                    {renderItem ? renderItem(o, o.value === value) : (
                      <>
                        <span className={styles.itemText}>{o.label}</span>
                        {o.desc && <span className={styles.itemDesc}>{o.desc}</span>}
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
