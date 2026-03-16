import { type ReactNode, useState, useCallback, useMemo } from 'react'
import styles from './claude-config.module.css'

/* ===== SectionHeader ===== */

interface SectionHeaderProps {
  icon: string
  title: string
  description?: string
  right?: ReactNode
}

export function SectionHeader({ icon, title, description, right }: SectionHeaderProps) {
  return (
    <div className={styles.sectionHeader}>
      <div className={styles.sectionHeaderLeft}>
        <span className={styles.sectionIcon}>{icon}</span>
        <div className={styles.sectionTitleGroup}>
          <h2 className={styles.sectionTitle}>{title}</h2>
          {description && <p className={styles.sectionDesc}>{description}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}

/* ===== DetailPanel ===== */

interface DetailPanelProps {
  title: string
  path?: string
  metadata?: Record<string, unknown>
  content?: string
  onClose?: () => void
}

export function DetailPanel({ title, path, metadata, content, onClose }: DetailPanelProps) {
  return (
    <div className={styles.detailPanel}>
      <div className={styles.detailHeader}>
        <span className={styles.detailTitle}>{title}</span>
        {onClose && (
          <button className={styles.detailCloseBtn} onClick={onClose} type="button">
            &times;
          </button>
        )}
      </div>
      {path && <div className={styles.detailPath}>{path}</div>}
      {metadata && Object.keys(metadata).length > 0 && (
        <div className={styles.detailMeta}>
          {Object.entries(metadata).map(([k, v]) => (
            <div key={k} className={styles.detailMetaRow}>
              <span className={styles.detailMetaKey}>{k}</span>
              <span className={styles.detailMetaValue}>{String(v ?? '')}</span>
            </div>
          ))}
        </div>
      )}
      {content && <div className={styles.detailContent}>{content}</div>}
    </div>
  )
}

/* ===== PresetGallery ===== */

interface PresetItem {
  name: string
  title: string
  desc: string
  icon: string
  installed: boolean
}

interface PresetGalleryProps {
  presets: PresetItem[]
  onInstall: (name: string, content: string) => void
  loading?: string | null
}

export function PresetGallery({ presets, onInstall, loading }: PresetGalleryProps) {
  return (
    <div className={styles.presetGrid}>
      {presets.map((p) => (
        <div key={p.name} className={styles.presetCard}>
          <div className={styles.presetCardTop}>
            <span className={styles.presetIcon}>{p.icon}</span>
            <span className={styles.presetTitle}>{p.title}</span>
          </div>
          <p className={styles.presetDesc}>{p.desc}</p>
          {p.installed ? (
            <span className={styles.presetInstalled}>Installed</span>
          ) : (
            <button
              className={styles.presetInstallBtn}
              disabled={loading === p.name}
              onClick={() => onInstall(p.name, '')}
              type="button"
            >
              {loading === p.name ? 'Installing...' : 'Install'}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

/* ===== ActivityChart ===== */

interface ActivityDataPoint {
  date: string
  message_count: number
  tool_call_count: number
  session_count: number
}

interface ActivityChartProps {
  data: ActivityDataPoint[]
}

export function ActivityChart({ data }: ActivityChartProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)

  const chartData = useMemo(() => {
    // Take last 60 days
    const slice = data.slice(-60)
    if (slice.length === 0) return { points: [] as typeof slice, maxVal: 1, labels: [] as string[] }
    const maxVal = Math.max(
      1,
      ...slice.map((d) => Math.max(d.message_count, d.tool_call_count))
    )
    // X-axis labels every 7 days
    const labels: string[] = []
    for (let i = 0; i < slice.length; i += 7) {
      labels.push(slice[i].date.slice(5)) // MM-DD
    }
    return { points: slice, maxVal, labels }
  }, [data])

  const { points, maxVal, labels } = chartData
  if (points.length === 0) return <div className={styles.chartWrap} />

  const padding = { top: 8, right: 8, bottom: 22, left: 8 }
  const svgW = 600
  const svgH = 140
  const chartW = svgW - padding.left - padding.right
  const chartH = svgH - padding.top - padding.bottom
  const barGroupW = chartW / points.length
  const barW = Math.max(1, barGroupW * 0.35)
  const gap = Math.max(1, barGroupW * 0.05)

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent, d: ActivityDataPoint) => {
      const rect = e.currentTarget.closest('svg')?.getBoundingClientRect()
      if (!rect) return
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top - 30,
        text: `${d.date}: ${d.message_count} msgs, ${d.tool_call_count} tools, ${d.session_count} sessions`,
      })
    },
    []
  )

  const handleMouseLeave = useCallback(() => setTooltip(null), [])

  return (
    <div className={styles.chartWrap} style={{ position: 'relative' }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none">
        <g transform={`translate(${padding.left}, ${padding.top})`}>
          {points.map((d, i) => {
            const x = i * barGroupW
            const msgH = (d.message_count / maxVal) * chartH
            const toolH = (d.tool_call_count / maxVal) * chartH
            return (
              <g
                key={d.date}
                onMouseEnter={(e) => handleMouseEnter(e, d)}
                onMouseLeave={handleMouseLeave}
              >
                {/* Message bar (blue) */}
                <rect
                  x={x}
                  y={chartH - msgH}
                  width={barW}
                  height={msgH}
                  fill="var(--tc-border-active)"
                  opacity={0.8}
                  rx={1}
                />
                {/* Tool call bar (orange) */}
                <rect
                  x={x + barW + gap}
                  y={chartH - toolH}
                  width={barW}
                  height={toolH}
                  fill="var(--tc-warning)"
                  opacity={0.8}
                  rx={1}
                />
              </g>
            )
          })}
          {/* X-axis labels */}
          {labels.map((label, i) => (
            <text
              key={label}
              x={i * 7 * barGroupW + barGroupW / 2}
              y={chartH + 14}
              textAnchor="middle"
              fill="var(--tc-foreground-secondary)"
              fontSize={8}
            >
              {label}
            </text>
          ))}
        </g>
      </svg>
      {tooltip && (
        <div
          className={styles.chartTooltip}
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  )
}

/* ===== MdPreview ===== */

interface MdPreviewProps {
  content: string
}

function sanitizeHtml(html: string): string {
  // Strip all tags except safe ones
  return html.replace(/<(?!\/?(?:h[1-6]|p|br|ul|ol|li|code|pre|strong|em|a)\b)[^>]*>/gi, '')
}

function markdownToHtml(md: string): string {
  let html = md
  // Code blocks (``` ... ```)
  html = html.replace(/```[\s\S]*?```/g, (match) => {
    const code = match.slice(3, -3).replace(/^\w*\n/, '')
    return `<pre><code>${escapeHtml(code)}</code></pre>`
  })
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')
  // List items
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
  // Paragraphs: wrap remaining lines
  html = html.replace(/^(?!<[hupol]|$)(.+)$/gm, '<p>$1</p>')
  return html
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function MdPreview({ content }: MdPreviewProps) {
  const html = useMemo(() => sanitizeHtml(markdownToHtml(content)), [content])
  return (
    <div
      className={styles.mdPreview}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
