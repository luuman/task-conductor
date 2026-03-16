import {
  lazy,
  Suspense,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../../lib/api'
import type { ClaudeConfig, ClaudeOverview } from '../../../lib/api/types'
import { Skeleton } from '../../../ui/skeleton/Skeleton'
import styles from './claude-config.module.css'

/* ───────── Lazy section imports ───────── */

const SecOverview = lazy(() => import('./sections/SecOverview'))
const SecSettings = lazy(() => import('./sections/SecSettings'))
const SecSkills = lazy(() => import('./sections/SecSkills'))
const SecAgents = lazy(() => import('./sections/SecAgents'))
const SecCommands = lazy(() => import('./sections/SecCommands'))
const SecMcp = lazy(() => import('./sections/SecMcp'))
const SecHooks = lazy(() => import('./sections/SecHooks'))
const SecRules = lazy(() => import('./sections/SecRules'))
const SecPermissions = lazy(() => import('./sections/SecPermissions'))
const SecEnvVars = lazy(() => import('./sections/SecEnvVars'))
const SecPlugins = lazy(() => import('./sections/SecPlugins'))
const SecMonitoring = lazy(() => import('./sections/SecMonitoring'))
const SecTrash = lazy(() => import('./sections/SecTrash'))
const SecAbout = lazy(() => import('./sections/SecAbout'))

const SECTION_COMPONENTS: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {
  overview: SecOverview, settings: SecSettings, skills: SecSkills,
  agents: SecAgents, commands: SecCommands, mcp: SecMcp,
  hooks: SecHooks, rules: SecRules, permissions: SecPermissions,
  env: SecEnvVars, plugins: SecPlugins, monitoring: SecMonitoring,
  trash: SecTrash, about: SecAbout,
}

/* ───────── Nav definition ───────── */

interface NavItem {
  id: string
  icon: string
  label: string
}

interface NavGroup {
  key: string
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    key: 'core',
    label: 'claudeConfig.nav.core',
    items: [
      { id: 'overview', icon: '\u{1F4CA}', label: 'claudeConfig.nav.overview' },
      { id: 'settings', icon: '\u2699\uFE0F', label: 'claudeConfig.nav.settings' },
    ],
  },
  {
    key: 'extensions',
    label: 'claudeConfig.nav.extensions',
    items: [
      { id: 'skills', icon: '\u2728', label: 'claudeConfig.nav.skills' },
      { id: 'agents', icon: '\u{1F916}', label: 'claudeConfig.nav.agents' },
      { id: 'commands', icon: '\u{1F4DD}', label: 'claudeConfig.nav.commands' },
      { id: 'mcp', icon: '\u{1F50C}', label: 'claudeConfig.nav.mcp' },
    ],
  },
  {
    key: 'security',
    label: 'claudeConfig.nav.security',
    items: [
      { id: 'hooks', icon: '\u{1FA9D}', label: 'claudeConfig.nav.hooks' },
      { id: 'rules', icon: '\u{1F4D0}', label: 'claudeConfig.nav.rules' },
      { id: 'permissions', icon: '\u{1F512}', label: 'claudeConfig.nav.permissions' },
      { id: 'env', icon: '\u{1F30D}', label: 'claudeConfig.nav.env' },
    ],
  },
  {
    key: 'system',
    label: 'claudeConfig.nav.system',
    items: [
      { id: 'plugins', icon: '\u{1F9E9}', label: 'claudeConfig.nav.plugins' },
      { id: 'monitoring', icon: '\u{1F4C8}', label: 'claudeConfig.nav.monitoring' },
      { id: 'trash', icon: '\u{1F5D1}\uFE0F', label: 'claudeConfig.nav.trash' },
      { id: 'about', icon: '\u{2139}\uFE0F', label: 'claudeConfig.nav.about' },
    ],
  },
]

const ALL_SECTION_IDS = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id))

/* ───────── Component ───────── */

export default function ClaudeConfigPage() {
  const { t } = useTranslation()

  /* ── state ── */
  const [config, setConfig] = useState<ClaudeConfig | null>(null)
  const [overview, setOverview] = useState<ClaudeOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string>('overview')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(null)

  /* ── refs ── */
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const contentRef = useRef<HTMLDivElement>(null)

  /* ── toast ── */
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }, [])

  /* ── data loading ── */
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [c, o] = await Promise.all([
          api.claudeConfig.getConfig().catch(() => null),
          api.claudeConfig.getOverview().catch(() => null),
        ])
        if (cancelled) return
        if (c) setConfig(c)
        if (o) setOverview(o)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  /* ── scroll spy ── */
  useEffect(() => {
    const container = contentRef.current
    if (!container) return

    const onScroll = () => {
      const containerRect = container.getBoundingClientRect()
      let closest: string | null = null
      let closestDist = Infinity

      for (const id of ALL_SECTION_IDS) {
        const el = sectionRefs.current[id]
        if (!el) continue
        const rect = el.getBoundingClientRect()
        const dist = Math.abs(rect.top - containerRect.top)
        if (dist < closestDist) {
          closestDist = dist
          closest = id
        }
      }
      if (closest) setActiveId(closest)
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [])

  /* ── nav click → scroll ── */
  const scrollTo = useCallback((id: string) => {
    const el = sectionRefs.current[id]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    setActiveId(id)
  }, [])

  /* ── filtered nav ── */
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return NAV_GROUPS
    const q = search.toLowerCase()
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter(
        (i) =>
          i.id.toLowerCase().includes(q) ||
          t(i.label).toLowerCase().includes(q)
      ),
    })).filter((g) => g.items.length > 0)
  }, [search, t])

  /* ── ref setter helper ── */
  const setSectionRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    sectionRefs.current[id] = el
  }, [])

  /* ── render section placeholder ── */
  const renderSection = (_id: string) => {
    if (loading) {
      return (
        <div className={styles.sectionSkeleton}>
          <Skeleton variant="text" width="40%" height={20} />
          <Skeleton variant="rect" width="100%" height={80} borderRadius={8} />
        </div>
      )
    }
    // All sections are placeholders for now - actual components will be swapped in later
    return <div className={styles.sectionPlaceholder}>{t('claudeConfig.comingSoon')}</div>
  }

  /* ── Suppress unused var warnings ── */
  void config
  void overview
  void showToast

  return (
    <div className={styles.page}>
      {toast && <div className={styles.toast}>{toast}</div>}

      {/* ── Left nav ── */}
      <nav className={styles.nav}>
        <input
          className={styles.navSearch}
          placeholder={t('claudeConfig.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {filteredGroups.map((group) => (
          <div key={group.key} className={styles.navGroup}>
            <div className={styles.navGroupLabel}>{t(group.label)}</div>
            {group.items.map((item) => (
              <div
                key={item.id}
                className={`${styles.navItem} ${activeId === item.id ? styles.navItemActive : ''}`}
                onClick={() => scrollTo(item.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') scrollTo(item.id)
                }}
              >
                <span className={styles.navItemIcon}>{item.icon}</span>
                <span>{t(item.label)}</span>
              </div>
            ))}
          </div>
        ))}
      </nav>

      {/* ── Right content ── */}
      <div className={styles.content} ref={contentRef}>
        {ALL_SECTION_IDS.map((id) => (
          <div
            key={id}
            ref={setSectionRef(id)}
            id={`sec-${id}`}
            className={styles.sectionWrap}
          >
            {renderSection(id)}
          </div>
        ))}
      </div>
    </div>
  )
}
