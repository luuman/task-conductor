import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../ui/theme/useTheme'
import {
  IconLayoutGrid, IconBot, IconSettings, IconRadio, IconHome,
  IconPalette, IconGlobe, IconClipboard, IconBlocks, IconLink, IconSearch,
} from '../../ui/icon'
import styles from './command-menu.module.css'

export interface CommandMenuItem {
  id: string
  label: string
  icon?: ReactNode
  shortcut?: string
  group: string
  action: () => void
}

export interface CommandMenuProps {
  open: boolean
  onClose: () => void
}

export function CommandMenu({ open, onClose }: CommandMenuProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const items = useMemo<CommandMenuItem[]>(() => {
    const nav = (path: string) => () => { navigate(path); onClose() }
    const scrollTo = (id: string) => () => {
      const el = document.getElementById(id)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      onClose()
    }

    return [
      // Navigation
      { id: 'nav-admin', label: t('admin.nav.dashboard'), icon: '📊', shortcut: undefined, group: t('commandMenu.group.navigation'), action: nav('/admin') },
      { id: 'nav-claude-config', label: t('admin.nav.claude_config'), icon: '🤖', shortcut: undefined, group: t('commandMenu.group.navigation'), action: nav('/admin/claude-config') },
      { id: 'nav-settings', label: t('admin.nav.settings'), icon: '⚙️', shortcut: undefined, group: t('commandMenu.group.navigation'), action: nav('/admin/settings') },
      { id: 'nav-sessions', label: t('admin.nav.sessions'), icon: '📡', shortcut: undefined, group: t('commandMenu.group.navigation'), action: nav('/admin/sessions') },
      { id: 'nav-workspace', label: t('commandMenu.backToWorkspace'), icon: '🏠', shortcut: undefined, group: t('commandMenu.group.navigation'), action: nav('/') },

      // Actions
      {
        id: 'action-theme',
        label: t('commandMenu.toggleTheme'),
        icon: '🎨',
        shortcut: undefined,
        group: t('commandMenu.group.actions'),
        action: () => {
          setTheme(theme === 'Dark+' ? 'Light+' : 'Dark+')
          onClose()
        },
      },
      {
        id: 'action-lang',
        label: t('commandMenu.toggleLanguage'),
        icon: '🌐',
        shortcut: undefined,
        group: t('commandMenu.group.actions'),
        action: () => {
          i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh')
          onClose()
        },
      },

      // Claude Config sections
      { id: 'config-overview', label: 'Overview', icon: '📋', shortcut: undefined, group: t('commandMenu.group.config'), action: scrollTo('section-overview') },
      { id: 'config-settings', label: 'Settings', icon: '⚙️', shortcut: undefined, group: t('commandMenu.group.config'), action: scrollTo('section-settings') },
      { id: 'config-skills', label: 'Skills', icon: '🧩', shortcut: undefined, group: t('commandMenu.group.config'), action: scrollTo('section-skills') },
      { id: 'config-hooks', label: 'Hooks', icon: '🪝', shortcut: undefined, group: t('commandMenu.group.config'), action: scrollTo('section-hooks') },
    ]
  }, [t, navigate, onClose, theme, setTheme, i18n])

  const filtered = useMemo(() => {
    if (!query.trim()) return items
    const q = query.toLowerCase()
    return items.filter(item => item.label.toLowerCase().includes(q))
  }, [items, query])

  // Group the filtered items
  const groups = useMemo(() => {
    const map = new Map<string, CommandMenuItem[]>()
    for (const item of filtered) {
      const existing = map.get(item.group)
      if (existing) {
        existing.push(item)
      } else {
        map.set(item.group, [item])
      }
    }
    return map
  }, [filtered])

  // Flatten for keyboard nav indexing
  const flatItems = useMemo(() => {
    const result: CommandMenuItem[] = []
    for (const items of groups.values()) {
      result.push(...items)
    }
    return result
  }, [groups])

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Clamp selected index when filtered results change
  useEffect(() => {
    setSelectedIndex(prev => Math.min(prev, Math.max(0, flatItems.length - 1)))
  }, [flatItems.length])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => (prev + 1) % Math.max(1, flatItems.length))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => (prev - 1 + flatItems.length) % Math.max(1, flatItems.length))
        break
      case 'Enter':
        e.preventDefault()
        if (flatItems[selectedIndex]) {
          flatItems[selectedIndex].action()
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [flatItems, selectedIndex, onClose])

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  if (!open) return null

  let flatIndex = 0

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.container} onKeyDown={handleKeyDown}>
        <div className={styles.searchWrapper}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            ref={inputRef}
            className={styles.searchInput}
            type="text"
            placeholder={t('commandMenu.searchPlaceholder')}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0) }}
          />
        </div>
        <div className={styles.divider} />
        <div className={styles.results} ref={listRef}>
          {flatItems.length === 0 ? (
            <div className={styles.empty}>{t('commandMenu.empty')}</div>
          ) : (
            Array.from(groups.entries()).map(([groupName, groupItems]) => (
              <div key={groupName}>
                <div className={styles.groupLabel}>{groupName}</div>
                {groupItems.map(item => {
                  const idx = flatIndex++
                  return (
                    <div
                      key={item.id}
                      className={styles.item}
                      data-selected={idx === selectedIndex}
                      data-index={idx}
                      onClick={() => item.action()}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
                      <span className={styles.itemLabel}>{item.label}</span>
                      {item.shortcut && <span className={styles.itemShortcut}>{item.shortcut}</span>}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
