// ChatReportPage — 会话报告视图
// 对齐 Dribbble 参考图：icon bar + main report + right sidebar

import { useCallback, useState } from 'react'
import { DEMO_TURNS, type ReportTurn } from './demo-data'
import styles from './chat-report.module.css'

// ── Source Cards ──
function SourceCards({ sources }: { sources: ReportTurn['sources'] }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? sources : sources.slice(0, 4)
  const remaining = sources.length - 4

  return (
    <div className={styles.sourceCards}>
      {visible.map((s, i) => (
        <div key={i} className={styles.sourceCard}>
          <div className={styles.sourceCardTitle}>{s.name}</div>
          <div className={styles.sourceCardMeta}>
            <span className={styles.langDot} style={{ background: s.langColor }} />
            {s.lang} · {s.lines}
          </div>
        </div>
      ))}
      {!showAll && remaining > 0 && (
        <button className={styles.sourceMore} onClick={() => setShowAll(true)}>
          +{remaining} More
        </button>
      )}
    </div>
  )
}

// ── Code Block ──
function CodeBlock({ lang, filename, code }: { lang: string; filename?: string; code: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [code])

  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeHeader}>
        <span className={styles.codeLang}>{lang}</span>
        {filename && <span className={styles.codeFilename}>{filename}</span>}
        <button className={styles.codeCopy} onClick={handleCopy}>
          {copied ? '✓ 已复制' : '📋 复制代码'}
        </button>
      </div>
      <div className={styles.codeBody}>{code}</div>
    </div>
  )
}

// ── File Changes ──
function FileChanges({ changes }: { changes: ReportTurn['changes'] }) {
  if (changes.length === 0) return null
  return (
    <div className={styles.fileList}>
      {changes.map((f, i) => (
        <div key={i} className={styles.fileItem}>
          <span className={styles.langDot} style={{ background: f.langColor }} />
          <span className={styles.fileName}>{f.name}</span>
          {f.isNew ? (
            <span className={styles.fileNew}>新建 {f.additions} lines</span>
          ) : (
            <span className={styles.fileStats}>
              <span className={styles.fileAdd}>+{f.additions}</span>
              <span className={styles.fileDel}>−{f.deletions}</span>
            </span>
          )}
          <span className={styles.fileChevron}>▶</span>
        </div>
      ))}
    </div>
  )
}

// ── Commands ──
function CommandList({ commands }: { commands: ReportTurn['commands'] }) {
  if (commands.length === 0) return null
  return (
    <div className={styles.cmdList}>
      {commands.map((c, i) => (
        <div key={i} className={styles.cmdItem}>
          <span className={styles.cmdPrompt}>$</span>
          <span className={styles.cmdText}>{c.shortCmd}</span>
          <span className={`${styles.cmdBadge} ${c.status === 'pass' ? styles.cmdPass : styles.cmdFail}`}>
            {c.badge}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Agents ──
function AgentCards({ agents }: { agents: ReportTurn['agents'] }) {
  if (agents.length === 0) return null
  return (
    <>
      {agents.map((a, i) => (
        <div key={i} className={styles.agentCard}>
          <div className={styles.agentHeader}>
            <span className={styles.agentIcon}>🤖</span>
            {a.description}
          </div>
          <div className={styles.agentSummary}>{a.summary}</div>
        </div>
      ))}
    </>
  )
}

// ── Results text (simple Markdown-like rendering) ──
function ResultsText({ text }: { text: string }) {
  // 简单的 Markdown 渲染：**bold**, `code`, 有序/无序列表
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let listItems: string[] = []
  let listType: 'ol' | 'ul' | null = null

  const flushList = () => {
    if (listItems.length === 0) return
    const items = listItems.map((item, i) => <li key={i} dangerouslySetInnerHTML={{ __html: formatInline(item) }} />)
    if (listType === 'ol') elements.push(<ol key={elements.length}>{items}</ol>)
    else elements.push(<ul key={elements.length}>{items}</ul>)
    listItems = []
    listType = null
  }

  const formatInline = (s: string) => {
    return s
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
  }

  for (const line of lines) {
    const olMatch = line.match(/^\d+\.\s+(.+)/)
    const ulMatch = line.match(/^[-*]\s+(.+)/)
    if (olMatch) {
      if (listType !== 'ol') flushList()
      listType = 'ol'
      listItems.push(olMatch[1])
    } else if (ulMatch) {
      if (listType !== 'ul') flushList()
      listType = 'ul'
      listItems.push(ulMatch[1])
    } else {
      flushList()
      const trimmed = line.trim()
      if (trimmed) {
        elements.push(<p key={elements.length} dangerouslySetInnerHTML={{ __html: formatInline(trimmed) }} />)
      }
    }
  }
  flushList()

  return <div className={styles.results}>{elements}</div>
}

// ── Right Sidebar ──
function Sidebar({ turn }: { turn: ReportTurn }) {
  return (
    <div className={styles.sidebar}>
      <div className={styles.sbSection}>
        <div className={styles.sbTitle}>Data Sources</div>
        <div className={styles.sbSourceGrid}>
          {turn.sources.slice(0, 2).map((s, i) => (
            <div key={i} className={styles.sbThumb}>
              <div className={styles.sbThumbBox} />
              <div className={styles.sbThumbName}>{s.name.replace(/\.\w+$/, '')}</div>
            </div>
          ))}
        </div>
        <div className={styles.sbHint}>Add from connected databases or upload to the system.</div>
        <div className={styles.sbUploadRow}>
          <button className={styles.sbUploadBtn}>📎 Upload file</button>
          <button className={styles.sbUploadBtn}>🖼 Upload media</button>
        </div>
        <span className={styles.sbBrowse}>📂 Browse existing records</span>
      </div>

      <div className={styles.sbSection}>
        <div className={styles.sbTitle}>Recommended tasks</div>
        <div className={styles.sbTasks}>
          {turn.suggestedTasks.map((t, i) => (
            <div key={i} className={styles.sbTask}>{t}</div>
          ))}
        </div>
      </div>

      <div className={styles.sbSection}>
        <div className={styles.sbTitle}>Recommended questions</div>
        <ul className={styles.sbQuestions}>
          {turn.suggestedQuestions.map((q, i) => (
            <li key={i} className={styles.sbQuestion}>{q}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ── Main Report Page ──
export default function ChatReportPage() {
  const [selectedId, setSelectedId] = useState(DEMO_TURNS[0].id)
  const turn = DEMO_TURNS.find(t => t.id === selectedId) ?? DEMO_TURNS[0]

  return (
    <div className={styles.page}>
      {/* Left icon bar */}
      <div className={styles.iconBar}>
        {['🏠', '💬', '📁', '🔍', '⚙️'].map((icon, i) => (
          <button key={i} className={`${styles.iconBtn} ${i === 1 ? styles.iconBtnActive : ''}`}>
            {icon}
          </button>
        ))}
        <div className={styles.iconBarSpacer} />
        <button className={styles.iconBtn}>👤</button>
      </div>

      {/* Main content */}
      <div className={styles.main}>
        <div className={styles.mainScroll}>
          {/* Query pill */}
          <div className={styles.queryPill}>{turn.question}</div>

          {/* Sources */}
          {turn.sources.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}><span className={styles.sectionDot} /> Sources</div>
              <SourceCards sources={turn.sources} />
            </div>
          )}

          {/* Results */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}><span className={styles.sectionDot} /> Results</div>
            <ResultsText text={turn.resultText} />
          </div>

          {/* Code blocks */}
          {turn.codeBlocks.map((cb, i) => (
            <div key={i} className={styles.section}>
              {cb.filename && (
                <p style={{ fontSize: 13, color: 'var(--tc-text-secondary, #a1a1aa)', marginBottom: 4 }}>
                  {cb.filename}:
                </p>
              )}
              <CodeBlock lang={cb.lang} filename={cb.filename} code={cb.code} />
            </div>
          ))}

          {/* Changes */}
          {turn.changes.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}><span className={styles.sectionDot} /> Changes</div>
              <FileChanges changes={turn.changes} />
            </div>
          )}

          {/* Commands */}
          {turn.commands.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}><span className={styles.sectionDot} /> Commands</div>
              <CommandList commands={turn.commands} />
            </div>
          )}

          {/* Agents */}
          {turn.agents.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}><span className={styles.sectionDot} /> Agents</div>
              <AgentCards agents={turn.agents} />
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className={styles.bottomBar}>
          <div className={styles.bottomActions}>
            <button className={styles.actionBtn}>♡ Share</button>
            <button className={styles.actionBtn}>↗ Share</button>
            <button className={styles.actionBtn}>↻ Rewrite</button>
            <button className={styles.actionBtn}>📋 Copy</button>
            {/* Turn switcher */}
            {DEMO_TURNS.map(t => (
              <button
                key={t.id}
                className={styles.actionBtn}
                style={t.id === selectedId ? { borderColor: 'var(--tc-accent, #7c5cfc)', color: 'var(--tc-accent-light, #a78bfa)' } : undefined}
                onClick={() => setSelectedId(t.id)}
              >
                {t.question.slice(0, 15)}…
              </button>
            ))}
          </div>
          <div className={styles.followUpWrap}>
            <span className={styles.followUpIcon}>@</span>
            <input className={styles.followUpInput} placeholder="Ask follow up question..." />
            <div className={styles.citationToggle}>
              <span>Citation</span>
              <div className={styles.toggleTrack}><div className={styles.toggleThumb} /></div>
            </div>
            <button className={styles.sendBtn}>↑</button>
          </div>
        </div>
      </div>

      {/* Right sidebar */}
      <Sidebar turn={turn} />
    </div>
  )
}
