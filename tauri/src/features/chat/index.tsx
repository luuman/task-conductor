// ChatReportPage — 会话操作时间线，8 种可切换样式
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../../lib/api'
import type { AiSession, TranscriptMessage } from '../../lib/api/types'
import { useChatStore } from '../../lib/store/chat'
import { ChatStoreCtx, createLocalChatStore, useActiveChatStore } from '../../lib/store/chat-ctx'
import { parseTimelineWithQuestions, formatTs, cleanSystemXml, detectRisks, inferBlockIntent, generateCommitMessage, type TimelineStep, type UserQuestion, type RiskItem, type IntentLabel } from './timeline-parser'
import { Select } from '../../ui/select'
import { RichTextBlock, CodeExpandCtx } from '../../components/ChatRenderer'
import { IconFileText, IconPencil, IconFilePlus } from '../../ui/icon'
import {
  RENDERERS, StyleA, StyleB, StyleD, StyleG, StyleH,
  groupConsecutiveSameType, RichText,
  buildCatLabelMap, dotColor,
  type StyleKey,
} from './ChatTimeline'
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import { useSessionData, type QuestionItem } from '../../components/SessionChat/useSessionData'
import { useAppStore } from '../../lib/store/app'
import '../../styles/hljs-ayu-dark.css'
import s from './chat-report.module.css'

// ── 样式常量（从 ChatTimeline 导入共用） ──
export type { StyleKey }
export { StyleA, StyleB, StyleD, StyleG, StyleH, RENDERERS, groupConsecutiveSameType }

const LS_KEY = 'tc_chat_style'
const getDefaultStyle = (): StyleKey => (localStorage.getItem(LS_KEY) as StyleKey) || 'a'


// ── Right sidebar ──
function MetaSidebar({ session, steps, questions, allQuestions, activeQ, codeExpanded, onToggleCode, onScrollToQuestion }: {
  session: AiSession | null; steps: TimelineStep[]; questions: UserQuestion[]; allQuestions?: QuestionItem[]; activeQ: number
  codeExpanded: boolean; onToggleCode: () => void; onScrollToQuestion?: (qi: number) => void
}) {
  const { t } = useTranslation()
  const qNavRef = useRef<HTMLDivElement>(null)

  // 始终用解析器产出的 questions（与 questionVirtuosoIndices 完全对齐）
  // allQuestions 来自后端 API，未过滤 cleanSystemXml，会导致索引错位，仅用于显示总数
  const navQuestions = questions
  const totalQCount = allQuestions && allQuestions.length > 0 ? allQuestions.length : questions.length

  // 联动：activeQ 变化时自动滚动导航列表
  useEffect(() => {
    const container = qNavRef.current
    if (!container) return
    const activeEl = container.children[activeQ] as HTMLElement | undefined
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [activeQ])

  const toolSteps = useMemo(() => steps.filter(st => st.kind === 'tool'), [steps])
  const cats = useMemo(() => {
    const m: Record<string, number> = {}
    toolSteps.forEach(st => { m[st.category] = (m[st.category] || 0) + 1 })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [toolSteps])

  // 风险检测
  const risks = useMemo<RiskItem[]>(() => detectRisks(steps), [steps])

  // 每个问题块的意图推断
  const questionIntents = useMemo<IntentLabel[]>(() =>
    questions.map((q, qi) => {
      const nextQ = questions[qi + 1]
      return inferBlockIntent(steps.slice(q.stepIndex, nextQ ? nextQ.stepIndex : steps.length))
    }),
    [questions, steps]
  )

  // Commit 消息
  const [commitMsg, setCommitMsg] = useState('')
  const [commitCopied, setCommitCopied] = useState(false)
  const handleGenCommit = useCallback(() => {
    setCommitMsg(generateCommitMessage(steps, questions))
  }, [steps, questions])
  const handleCopyCommit = useCallback(() => {
    navigator.clipboard.writeText(commitMsg).catch(() => {})
    setCommitCopied(true)
    setTimeout(() => setCommitCopied(false), 1500)
  }, [commitMsg])

  const duration = useMemo(() => {
    if (!session?.started_at || !session?.last_seen_at) return ''
    const start = new Date(session.started_at).getTime()
    const end = new Date(session.last_seen_at).getTime()
    const diff = Math.round((end - start) / 1000)
    if (diff < 60) return `${diff}s`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`
  }, [session?.started_at, session?.last_seen_at])

  const i18nCatMap = useMemo(() => buildCatLabelMap(t), [t])

  const fileStats = useMemo(() => {
    const readFiles = new Set<string>()
    const editFiles = new Set<string>()
    const newFiles = new Set<string>()
    for (const st of toolSteps) {
      const fp = String(st.toolInput?.file_path || '')
      if (!fp) continue
      if (st.category === 'read') readFiles.add(fp)
      else if (st.category === 'edit') editFiles.add(fp)
      else if (st.category === 'write') newFiles.add(fp)
    }
    return { read: readFiles.size, edit: editFiles.size, write: newFiles.size }
  }, [toolSteps])

  if (!session) return null

  return (
    <div className={s.sidebar}>
      
      {/* 问题导航 */}
      {(navQuestions.length > 0) && (
        <>
          <div className={s.sbSection}>
            <div className={s.sbTitle} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{t('chat_sidebar.question_nav')} ({navQuestions.length}{totalQCount > navQuestions.length ? `/${totalQCount}` : ''})</span>
              <span style={{ flex: 1 }} />
              <span className={s.expandToggleWrap}>
                <button
                  className={s.expandToggle}
                  style={{ background: codeExpanded ? 'var(--tc-border-active)' : 'var(--tc-panel-bg)' }}
                  onClick={onToggleCode}
                >
                  <span className={s.expandDot} style={{ left: codeExpanded ? 'calc(100% - 12px)' : '2px' }} />
                </button>
              </span>
            </div>
            <div className={s.qNav} ref={qNavRef}>
              {navQuestions.map((q, i) => {
                const intent = questionIntents[i]
                const intentCls = intent ? (s as Record<string, string>)[`intent_${intent}`] : ''
                const intentLabel = intent ? t(`chat_sidebar.intent_${intent}`) : ''
                return (
                  <a
                    key={`nq-${i}`}
                    className={`${s.qNavItem} ${i === activeQ ? s.qNavActive : ''}`}
                    href="#"
                    onClick={e => {
                      e.preventDefault()
                      onScrollToQuestion?.(i)
                    }}
                  >
                    <span className={s.qNavNum}>Q{i + 1}</span>
                    <span className={s.qNavText}>{stripDomContext(q.text)}</span>
                    {intentLabel && <span className={`${s.intentBadge} ${intentCls}`}>{intentLabel}</span>}
                  </a>
                )
              })}
            </div>
          </div>
        </>
      )}

    

      <hr className={s.sbDivider} />

      {/* 推荐任务 */}
      <div className={s.sbSection}>
        <div className={s.sbTitle}>{t('chat_sidebar.recommended_tasks')}</div>
        <div className={s.sbTasks}>
          <div className={s.sbTask}>优化 UserCard 气泡样式</div>
          <div className={s.sbTask}>改进 BashStatusLine 高亮</div>
          <div className={s.sbTask}>添加 Read pill 动画</div>
          <div className={s.sbTask}>实现 Mermaid 缩放</div>
        </div>
      </div>

      <hr className={s.sbDivider} />

      {/* 推荐问题 */}
      <div className={s.sbSection}>
        <div className={s.sbTitle}>{t('chat_sidebar.recommended_questions')}</div>
        <ul className={s.sbQuestions}>
          <li className={s.sbQuestion}>哪种类型最需要优先改进？</li>
          <li className={s.sbQuestion}>Edit diff 需要 side-by-side？</li>
          <li className={s.sbQuestion}>Bash 支持 ANSI 颜色码？</li>
          <li className={s.sbQuestion}>AskUser 选项需要键盘导航？</li>
        </ul>
      </div>

        <hr className={s.sbDivider} />

      {/* 会话元数据 */}
      <div className={s.sbSection}>
        <div className={s.sbTitle}>{t('chat_sidebar.session_metadata')}</div>
        <div className={s.sbRow}><span className={s.sbKey}>{t('chat_sidebar.session_id')}</span><span className={s.sbVal}>{session.session_id.slice(0, 8)}</span></div>
        <div className={s.sbRow}><span className={s.sbKey}>{t('chat_sidebar.status')}</span><span className={s.sbVal} style={{ color: session.status === 'active' ? '#4ade80' : session.status === 'stopped' ? '#f87171' : undefined }}>● {session.status === 'active' ? t('chat_sidebar.status_active') : session.status === 'stopped' ? t('chat_sidebar.status_stopped') : t('chat_sidebar.status_unknown')}</span></div>
        <div className={s.sbRow}><span className={s.sbKey}>{t('chat_sidebar.model')}</span><span className={s.sbVal}>claude-opus-4-6</span></div>
        <div className={s.sbRow}><span className={s.sbKey}>{t('chat_sidebar.started')}</span><span className={s.sbVal}>{formatTs(session.started_at)}</span></div>
        <div className={s.sbRow}><span className={s.sbKey}>{t('chat_sidebar.ended')}</span><span className={s.sbVal}>{formatTs(session.last_seen_at || '')}</span></div>
        {duration && <div className={s.sbRow}><span className={s.sbKey}>{t('chat_sidebar.duration')}</span><span className={s.sbVal}>{duration}</span></div>}
        {session.cwd && <div className={s.sbRow}><span className={s.sbKey}>{t('chat_sidebar.cwd')}</span><span className={s.sbVal} style={{ fontSize: 9 }}>{session.cwd.split('/').pop()}</span></div>}
        {session.cwd && <div className={s.sbRow}><span className={s.sbKey}>{t('chat_sidebar.git_branch')}</span><span className={s.sbVal}>master</span></div>}
      </div>

      <hr className={s.sbDivider} />

      {/* 操作统计 */}
      <div className={s.sbSection}>
        <div className={s.sbTitle}>{t('chat_sidebar.op_stats')}</div>
        <div className={s.sbRow}><span className={s.sbKey}>{t('chat_sidebar.tool_calls')}</span><span className={s.sbVal}>{toolSteps.length}</span></div>
        <div className={s.sbRow}><span className={s.sbKey}>{t('chat_sidebar.text_output')}</span><span className={s.sbVal}>{steps.length - toolSteps.length} {t('chat_sidebar.text_output_unit')}</span></div>
        {cats.map(([cat, count]) => (
          <div key={cat} className={s.sbRow}>
            <span className={s.sbKey}>{i18nCatMap[cat] || cat}</span>
            <span className={s.sbVal} style={{ color: dotColor(cat as TimelineStep['category']) }}>{count}</span>
          </div>
        ))}
      </div>

      <hr className={s.sbDivider} />

      {/* 涉及文件 */}
      <div className={s.sbSection}>
        <div className={s.sbTitle}>{t('chat_sidebar.files_involved')}</div>
        <div className={s.sbRow}><span className={s.sbKey} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><IconFileText size={11} /> {t('chat_sidebar.file_read')}</span><span className={s.sbVal}>{fileStats.read} {t('chat_sidebar.file_unit')}</span></div>
        <div className={s.sbRow}><span className={s.sbKey} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><IconPencil size={11} /> {t('chat_sidebar.file_edit')}</span><span className={s.sbVal}>{fileStats.edit} {t('chat_sidebar.file_unit')}</span></div>
        <div className={s.sbRow}><span className={s.sbKey} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><IconFilePlus size={11} /> {t('chat_sidebar.file_write')}</span><span className={s.sbVal}>{fileStats.write} {t('chat_sidebar.file_unit')}</span></div>
      </div>

      {/* 风险检测 */}
      {risks.length > 0 && (
        <>
          <hr className={s.sbDivider} />
          <div className={s.sbSection}>
            <div className={s.sbTitle} style={{ color: '#f87171' }}>⚠ {t('chat_sidebar.risk_detection')} ({risks.length})</div>
            <div className={s.riskList}>
              {risks.map((r, i) => (
                <div key={i} className={s.riskItem}>
                  <span className={r.level === 'high' ? s.riskLevelHigh : s.riskLevelMed}>
                    {r.level === 'high' ? t('chat_sidebar.risk_high') : t('chat_sidebar.risk_medium')}
                  </span>
                  <div className={s.riskBody}>
                    <span className={s.riskLabel}>{r.label}</span>
                    <span className={s.riskDetail}>{r.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* 一键生成 Commit 消息 */}
      {(fileStats.edit > 0 || fileStats.write > 0) && (
        <>
          <hr className={s.sbDivider} />
          <div className={s.sbSection}>
            <div className={s.sbTitle}>{t('chat_sidebar.commit_msg_title')}</div>
            {commitMsg ? (
              <div className={s.commitBox}>
                <pre className={s.commitPre}>{commitMsg}</pre>
                <button
                  className={`${s.commitCopyBtn} ${commitCopied ? s.commitCopied : ''}`}
                  onClick={handleCopyCommit}
                >
                  {commitCopied ? '✓' : t('chat_sidebar.commit_copy')}
                </button>
              </div>
            ) : (
              <button className={s.commitGenBtn} onClick={handleGenCommit}>
                {t('chat_sidebar.commit_gen')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════
// 用户消息行（含 hover 复制按钮）
// ════════════════════════════════════════════════
const COLLAPSE_THRESHOLD = 150 // 超过此字符数的用户消息默认折叠

function UserMsgRow({ rawText, children }: { rawText: string; children: React.ReactNode }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const needsCollapse = stripDomContext(rawText).length > COLLAPSE_THRESHOLD

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(rawText).catch(() => {
      const el = document.createElement('textarea')
      el.value = rawText
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    })
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [rawText])

  return (
    <div className={s.userMsgRow}>
      <button
        className={`${s.userCopyBtn} ${copied ? s.userCopyBtnDone : ''}`}
        onClick={handleCopy}
        title={t('chat_sidebar.copy_message')}
        tabIndex={-1}
      >
        {copied
          ? '\u2713'
          : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        }
      </button>
      <div className={s.queryPill}>
        <div className={needsCollapse && !expanded ? `${s.queryPillBody} ${s.queryPillBodyCollapsed}` : s.queryPillBody}>
          {children}
        </div>
        {needsCollapse && (
          <button className={s.queryPillExpandBtn} onClick={() => setExpanded(v => !v)}>
            {expanded ? t('chat_sidebar.collapse') : t('chat_sidebar.expand_all')}
          </button>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════
// 选词浮动工具栏
// ════════════════════════════════════════════════
function SelectionToolbar({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const { t } = useTranslation()
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [selText, setSelText] = useState('')
  const [copied, setCopied] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleMouseUp() {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) { setPos(null); return }
      const text = sel.toString().trim()
      if (!text) { setPos(null); return }
      const container = containerRef.current
      if (!container) { setPos(null); return }
      const range = sel.getRangeAt(0)
      if (!container.contains(range.commonAncestorContainer)) { setPos(null); return }
      const rect = range.getBoundingClientRect()
      setSelText(text)
      setCopied(false)
      setPos({ x: rect.left + rect.width / 2, y: rect.top })
    }

    function handleMouseDown(e: MouseEvent) {
      if (toolbarRef.current?.contains(e.target as Node)) return
      setPos(null)
      setCopied(false)
    }

    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [containerRef])

  if (!pos) return null

  const handleCopy = () => {
    navigator.clipboard.writeText(selText).catch(() => {
      const el = document.createElement('textarea')
      el.value = selText
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    })
    setCopied(true)
    setTimeout(() => { setPos(null); setCopied(false) }, 1200)
  }

  return createPortal(
    <div
      ref={toolbarRef}
      className={s.selToolbar}
      style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, calc(-100% - 10px))' }}
      onMouseDown={e => e.preventDefault()}
    >
      <button className={`${s.selBtn} ${copied ? s.selBtnCopied : ''}`} onClick={handleCopy} tabIndex={-1}>
        {copied ? t('chat_sidebar.selection_copied') : t('chat_sidebar.selection_copy')}
      </button>
    </div>,
    document.body
  )
}

// ════════════════════════════════════════════════
// Main page
// ════════════════════════════════════════════════
function stripDomContext(text: string): string {
  // 先清理系统 XML 标签
  const cleaned = cleanSystemXml(text)
  const i1 = cleaned.indexOf('\n\n【元素 #')
  const i2 = cleaned.indexOf('--- 问题元素')
  const candidates = [i1, i2].filter(i => i !== -1)
  if (candidates.length === 0) return cleaned
  return cleaned.slice(0, Math.min(...candidates)).trim()
}

/** 从原始消息文本中解析 DOM context 块 */
type ParsedDomChip = {
  index: number; selector: string; path: string; text: string
  size: string; color: string; bg: string; fontSize: string; html: string
}

function parseDomContextChips(raw: string): ParsedDomChip[] {
  const results: ParsedDomChip[] = []
  const re = /【元素 #(\d+)】(\S+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(raw)) !== null) {
    const idx = parseInt(match[1], 10)
    const selector = match[2]
    const blockStart = match.index
    const nextBlock = raw.indexOf('【元素 #', blockStart + 1)
    const block = raw.slice(blockStart, nextBlock === -1 ? undefined : nextBlock)
    const pathMatch = block.match(/路径:\s*(.+)/)
    const textMatch = block.match(/文本:\s*"(.+?)"/)
    const sizeMatch = block.match(/尺寸:\s*(.+)/)
    const styleMatch = block.match(/样式:\s*color=(\S+)\s+bg=(\S+)\s+font=(\S+)/)
    const htmlMatch = block.match(/HTML:\s*(.+)/)
    results.push({
      index: idx,
      selector,
      path: pathMatch?.[1]?.trim() || '',
      text: textMatch?.[1]?.trim() || '',
      size: sizeMatch?.[1]?.trim() || '',
      color: styleMatch?.[1] || '',
      bg: styleMatch?.[2] || '',
      fontSize: styleMatch?.[3] || '',
      html: htmlMatch?.[1]?.trim() || '',
    })
  }
  return results
}

/** 消息中渲染 DOM context 元素预览卡片 */
function InlineDomChips({ raw }: { raw: string }) {
  const chips = parseDomContextChips(raw)
  if (chips.length === 0) return null
  return (
    <div className={s.domCardList}>
      {chips.map((chip) => {
        const tag = chip.selector.split(/[.#]/)[0] || 'div'
        const pathParts = chip.path ? chip.path.split(' > ') : []
        return (
          <div key={chip.index} className={s.domCard}>
            <div className={s.domCardHeader}>
              <span className={s.domCardIndex}>{chip.index}</span>
              <span className={s.domCardTag}>&lt;{tag}&gt;</span>
              {chip.size && <span className={s.domCardSize}>{chip.size.split('@')[0].trim()}</span>}
            </div>
            {chip.text && (
              <div className={s.domCardContent}>{chip.text}</div>
            )}
            {pathParts.length > 0 && (
              <div className={s.domCardPath}>
                {pathParts.map((p, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span className={s.domCardPathSep}>&rsaquo;</span>}
                    <span>{p}</span>
                  </React.Fragment>
                ))}
              </div>
            )}
            {(chip.color || chip.bg) && chip.bg !== 'rgba(0, 0, 0, 0)' && (
              <div className={s.domCardStyles}>
                {chip.color && <span className={s.domCardSwatch} style={{ background: chip.color }} title={`color: ${chip.color}`} />}
                {chip.bg && chip.bg !== 'rgba(0, 0, 0, 0)' && <span className={s.domCardSwatch} style={{ background: chip.bg }} title={`bg: ${chip.bg}`} />}
                {chip.fontSize && <span className={s.domCardMeta}>{chip.fontSize}</span>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── 时间格式化（相对时间） ──
function relativeTime(iso: string): string {
  if (!iso) return ''
  const t = i18n.t.bind(i18n)
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z')
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('chat_sidebar.relative_just_now')
  if (mins < 60) return t('chat_sidebar.relative_minutes_ago', { mins })
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
  if (diff < 7 * 86400000) return t('chat_sidebar.relative_days_ago', { days: Math.floor(diff / 86400000) })
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// ── 会话行渲染（Notion 表格风格：圆点 | 标题 | 事件数 | 时间） ──
// desc 格式: status|events|time|project|source|is_favorite
function SessionItem(option: { value: string; label: string; desc?: string }) {
  const parts = (option.desc || '').split('|')
  const status = parts[0] || ''
  const events = parts[1] || ''
  const time = parts[2] || ''
  const project = parts[3] || ''
  const source = parts[4] || 'live'
  const isFavorite = parts[5] === '1'
  const dotBg = status === 'active' ? '#56d364' : status === 'idle' ? '#e3b341' : '#8b949e'

  return (
    <>
      <span style={{ width: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotBg }} />
      </span>
      {project && (
        <span style={{ flexShrink: 0, fontSize: 9, padding: '1px 4px', borderRadius: 3, background: 'var(--tc-background-tertiary)', color: 'var(--tc-foreground-secondary)', marginRight: 4, maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project}</span>
      )}
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, fontWeight: 500 }}>{option.label}</span>
      {isFavorite && (
        <span style={{ flexShrink: 0, fontSize: 10, color: '#f5a623', marginRight: 2 }}>★</span>
      )}
      {source === 'archived' && (
        <span style={{ flexShrink: 0, fontSize: 9, padding: '1px 3px', borderRadius: 3, background: 'var(--tc-background-tertiary)', color: 'var(--tc-foreground-secondary)', marginRight: 2 }}>☁</span>
      )}
      <span style={{ width: 30, flexShrink: 0, textAlign: 'right', fontSize: 10, fontFamily: "'Geist Mono', monospace", color: 'var(--tc-foreground-secondary)' }}>{events}</span>
      <span style={{ width: 50, flexShrink: 0, textAlign: 'right', fontSize: 9, color: 'var(--tc-foreground-secondary)' }}>{time}</span>
    </>
  )
}

import { PromptInput } from './PromptInput'
import { useArchivedSessions, useToggleFavorite, useDeleteArchived } from './useArchivedSessions'
import type { ArchivedSession } from '../../lib/tauri-sync'

// Virtuoso 虚拟列表项类型
type VItem =
  | { kind: 'user'; key: string; qi: number; question: UserQuestion }
  | { kind: 'steps'; key: string; steps: TimelineStep[] }
  | { kind: 'live'; key: string; message: TranscriptMessage }
  | { kind: 'thinking'; key: string }

function ChatReportPageInner({ global = false }: { global?: boolean } = {}) {
  const { t } = useTranslation()
  const [style, setStyle] = useState<StyleKey>(getDefaultStyle)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY && e.newValue) setStyle(e.newValue as StyleKey)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  const [activeQ, setActiveQ] = useState(0)
  const [codeExpanded, setCodeExpanded] = useState(false)
  const mainAreaRef = useRef<HTMLDivElement>(null)
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  // 使用局部 store（由外层 ChatReportPage Provider 注入，与 FloatingAssistant 完全隔离）
  const {
    messages: chatMessages,
    currentReply,
    isGenerating,
    claudeSessionId,
    setClaudeSessionId: setLocalClaudeSessionId,
    setCurrentReply: setLocalCurrentReply,
  } = useActiveChatStore()

  // 获取当前项目 cwd（与 /sessions 页面一致，使用 appStore）
  const activeProjectId = useAppStore((st) => st.activeProjectId)
  const [projectCwd, setProjectCwd] = useState<string | undefined>(undefined)
  const [cwdReady, setCwdReady] = useState(global)  // global 模式立即就绪
  useEffect(() => {
    if (global) { setCwdReady(true); return }
    if (!activeProjectId) { setProjectCwd(undefined); setCwdReady(true); return }
    setCwdReady(false)
    const pid = Number(activeProjectId)
    api.getProjects().then(list => {
      const proj = list.find(p => p.id === pid)
      setProjectCwd(proj?.repo_url || undefined)
      setCwdReady(true)
    }).catch(() => { setProjectCwd(undefined); setCwdReady(true) })
  }, [global, activeProjectId])

  // 使用 useSessionData 统一管理分页加载 + WS 实时更新
  const {
    sessions: liveSessions, selectedId, selectSession,
    transcript, transcriptLoading: loading,
    loadMore, hasMore, loadAll, allQuestions,
  } = useSessionData({ filterByCwd: cwdReady ? (global ? undefined : projectCwd) : '\x00', autoLoadAll: false, initialLimit: 200 })

  // 归档会话（来自 Tauri IPC，仅在 Tauri 环境下可用）
  const { data: archivedSessions = [] } = useArchivedSessions()
  const toggleFavoriteMutation = useToggleFavorite()
  const deleteArchivedMutation = useDeleteArchived()

  // 筛选器状态
  type FilterType = 'all' | 'live' | 'archived' | 'favorite'
  const [filter, setFilter] = useState<FilterType>('all')

  // 合并 live + archived 会话，按最新事件时间排序，archived 去重
  const mergedSessions = useMemo(() => {
    const liveIds = new Set(liveSessions.map((s: any) => s.session_id))
    const archivedOnly = archivedSessions
      .filter((s: ArchivedSession) => !liveIds.has(s.session_id) && s.is_deleted !== 1)
      .map((s: ArchivedSession) => ({ ...s, source: 'archived' as const, last_seen_at: s.last_event_at }))
    return [
      ...liveSessions.map((s: any) => ({ ...s, source: 'live' as const })),
      ...archivedOnly,
    ].sort((a, b) => {
      const ta = (a as any).last_seen_at || (a as any).last_event_at || ''
      const tb = (b as any).last_seen_at || (b as any).last_event_at || ''
      return tb.localeCompare(ta)
    })
  }, [liveSessions, archivedSessions])

  // 根据筛选器过滤
  const sessions = useMemo(() => {
    switch (filter) {
      case 'live': return mergedSessions.filter((s) => s.source === 'live')
      case 'archived': return mergedSessions.filter((s) => s.source === 'archived')
      case 'favorite': return mergedSessions.filter((s) => (s as any).is_favorite === 1)
      default: return mergedSessions
    }
  }, [mergedSessions, filter])

  // 自动选中第一个会话
  useEffect(() => {
    if (sessions.length > 0 && !selectedId) {
      selectSession(sessions[0].session_id)
    }
  }, [sessions, selectedId, selectSession])

  // 切换会话时同步局部 claudeSessionId，清空流式回复（只影响局部 store）
  useEffect(() => {
    setLocalClaudeSessionId(selectedId || null)
    setLocalCurrentReply('')
  }, [selectedId, setLocalClaudeSessionId, setLocalCurrentReply])

  const { steps, questions } = useMemo(() => parseTimelineWithQuestions(transcript), [transcript])
  const selectedSession = sessions.find(ss => ss.session_id === selectedId) ?? null
  const showLiveConversation = !!selectedId && claudeSessionId === selectedId
  const liveItems = useMemo<VItem[]>(() => {
    if (!showLiveConversation) return []
    const displayMessages = currentReply
      ? [...chatMessages, { role: 'assistant' as const, ts: new Date().toISOString(), blocks: [{ type: 'text' as const, text: currentReply }] }]
      : chatMessages

    const items: VItem[] = displayMessages.map((message, i) => ({
      kind: 'live' as const,
      key: `live-${message.ts}-${i}`,
      message,
    }))
    if (isGenerating && !currentReply) items.push({ kind: 'thinking', key: 'live-thinking' })
    return items
  }, [chatMessages, currentReply, isGenerating, showLiveConversation])

  // 构建虚拟列表项：每个用户问题和每组工具步骤各为一项
  const vitems = useMemo<VItem[]>(() => {
    if (steps.length === 0 && questions.length === 0) return []
    if (questions.length === 0) {
      return groupConsecutiveSameType(steps).map((step, i) => ({
        kind: 'steps' as const, key: `s-${i}`, steps: [step],
      }))
    }
    const result: VItem[] = []
    // 第一个问题之前可能有孤儿 steps（来自被跳过的系统消息后的 assistant 响应）
    if (questions[0]?.stepIndex > 0) {
      groupConsecutiveSameType(steps.slice(0, questions[0].stepIndex)).forEach((step, si) => {
        result.push({ kind: 'steps', key: `orphan-s${si}`, steps: [step] })
      })
    }
    questions.forEach((q, qi) => {
      result.push({ kind: 'user', key: `q-${qi}`, qi, question: q })
      const nextQ = questions[qi + 1]
      const startIdx = q.stepIndex
      const endIdx = nextQ ? nextQ.stepIndex : steps.length
      groupConsecutiveSameType(steps.slice(startIdx, endIdx)).forEach((step, si) => {
        result.push({ kind: 'steps', key: `q${qi}-s${si}`, steps: [step] })
      })
    })
    return result
  }, [steps, questions])
  const listItems = useMemo(() => [...vitems, ...liveItems], [vitems, liveItems])

  // 问题在虚拟列表中的索引映射
  const questionVirtuosoIndices = useMemo(() =>
    vitems.reduce<number[]>((acc, item, i) => {
      if (item.kind === 'user') acc.push(i)
      return acc
    }, []),
    [vitems],
  )
  // ref 版：让 handleRangeChanged 引用稳定，避免 rangeChanged prop 每次 transcript 更新都变化
  // （prop 变化 → Virtuoso 重新绑定内部 stream → 触发循环 bug）
  const questionVirtuosoIndicesRef = useRef(questionVirtuosoIndices)
  useEffect(() => { questionVirtuosoIndicesRef.current = questionVirtuosoIndices }, [questionVirtuosoIndices])
  const activeQRef = useRef(0)
  useEffect(() => { activeQRef.current = activeQ }, [activeQ])

  // 滚动时自动高亮当前可见的问题
  // 用视口上 1/3 处作为判断基准：问题项进入该区域就立即切换，比只用 startIndex 更灵敏
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleRangeChanged = useCallback(({ startIndex, endIndex }: { startIndex: number; endIndex: number }) => {
    const indices = questionVirtuosoIndicesRef.current
    const threshold = startIndex + Math.max(1, Math.floor((endIndex - startIndex) / 3))
    for (let i = indices.length - 1; i >= 0; i--) {
      if (indices[i] <= threshold) {
        if (activeQRef.current !== i) {
          activeQRef.current = i
          setActiveQ(i)
        }
        break
      }
    }
  }, []) // 空依赖：引用永远稳定，rangeChanged prop 不变，不触发 Virtuoso 内部重新订阅

  // 问题导航跳转（如果数据未全部加载则先 loadAll）
  const pendingScrollQ = useRef<number | null>(null)
  const scrollToQuestion = useCallback((qi: number) => {
    if (hasMore) {
      pendingScrollQ.current = qi
      loadAll()
      return
    }
    const vIdx = questionVirtuosoIndices[qi]
    if (vIdx != null) {
      virtuosoRef.current?.scrollToIndex({ index: vIdx, align: 'start', behavior: 'smooth' })
    }
  }, [questionVirtuosoIndices, hasMore, loadAll])

  // loadAll 完成后执行待定的跳转
  useEffect(() => {
    if (pendingScrollQ.current != null && !hasMore && questionVirtuosoIndices.length > 0) {
      const qi = pendingScrollQ.current
      pendingScrollQ.current = null
      const vIdx = questionVirtuosoIndices[qi]
      if (vIdx != null) {
        setTimeout(() => {
          virtuosoRef.current?.scrollToIndex({ index: vIdx, align: 'start', behavior: 'smooth' })
        }, 100)
      }
    }
  }, [hasMore, questionVirtuosoIndices])

  // 新对话消息到达时滚动到底部
  useEffect(() => {
    if (liveItems.length === 0) return
    requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({ index: listItems.length - 1, align: 'end', behavior: 'smooth' })
    })
  }, [liveItems.length, listItems.length])

  useEffect(() => {
    pendingScrollQ.current = null
    setActiveQ(0)
  }, [selectedId])

  const Renderer = RENDERERS[style]

  // Virtuoso 回调全部稳定引用，防止 Virtuoso 内部 layout effect 循环触发
  // computeItemKey / itemContent 用 useCallback 缓存，避免每次渲染新函数引用
  const computeItemKey = useCallback((_: number, item: VItem) => item.key, [])
  const itemContent = useCallback((_: number, item: VItem) => {
    if (item.kind === 'user') {
      return (
        <div className={s.turnSection} style={{ padding: '0 20px' }}>
          <UserMsgRow rawText={item.question.text}>
            <div className={s.userText}><RichText text={stripDomContext(item.question.text)} /></div>
          </UserMsgRow>
        </div>
      )
    }
    if (item.kind === 'live') {
      const raw = item.message.blocks.map((b) => b.text ?? '').join('\n').trim()
      const text = item.message.role === 'user' ? stripDomContext(raw) : raw
      if (!text && item.message.role !== 'user') return null
      if (item.message.role === 'user' && !text && parseDomContextChips(raw).length === 0) return null
      return item.message.role === 'user' ? (
        <div className={s.turnSection} style={{ padding: '0 20px' }}>
          <UserMsgRow rawText={raw}>
            {text && <div className={s.userText}><RichText text={text} /></div>}
            <InlineDomChips raw={raw} />
          </UserMsgRow>
        </div>
      ) : (
        <div style={{ padding: '0 20px' }}>
          <div className={s.chatAiBlock}>
            <div className={s.richText}><RichTextBlock text={text} /></div>
          </div>
        </div>
      )
    }
    if (item.kind === 'thinking') {
      return (
        <div className={s.pThinking} style={{ padding: '0 20px' }}>
          <span className={s.pThinkingDot} />
          <span>思考中...</span>
        </div>
      )
    }
    return (
      <div style={{ padding: '0 20px' }}>
        <Renderer steps={item.steps} />
      </div>
    )
  }, [Renderer])


  return (
    <div className={s.page}>
      <div className={s.topBar}>
        <span className={s.topLabel}>{t('chat_sidebar.session_label')}</span>
        {/* 筛选器 */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {(['all', 'live', 'archived', 'favorite'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '2px 8px',
                fontSize: 10,
                borderRadius: 4,
                border: '1px solid var(--tc-border)',
                background: filter === f ? 'var(--tc-accent)' : 'var(--tc-panel-bg)',
                color: filter === f ? 'var(--tc-accent-fg, #fff)' : 'var(--tc-foreground-secondary)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {f === 'all' ? t('chat.filter.all')
                : f === 'live' ? t('chat.filter.live')
                : f === 'archived' ? t('chat.filter.archived')
                : t('chat.filter.favorite')}
            </button>
          ))}
        </div>
        <Select
          options={sessions.map((ss: any) => ({
            value: ss.session_id,
            label: stripDomContext(ss.summary || '') || (ss.note?.alias || t('chat_sidebar.session_default_label', { id: ss.session_id.slice(0, 8) })),
            desc: `${ss.status || ''}|${ss.event_count}|${relativeTime(ss.last_seen_at || ss.started_at || ss.last_event_at || '')}|${global ? (ss.cwd?.split('/').pop() || '') : ''}|${ss.source || 'live'}|${(ss as any).is_favorite || 0}`,
          }))}
          value={selectedId || ''}
          onChange={v => selectSession(v)}
          placeholder={t('chat_sidebar.select_session_placeholder')}
          searchable
          searchPlaceholder={t('chat_sidebar.search_session_placeholder')}
          wide
          renderItem={SessionItem}
          style={{ flex: 1, minWidth: 0 }}
        />
        {/* 归档会话操作按钮：★ 收藏 / 🗑 软删除 */}
        {selectedId && (() => {
          const sel = sessions.find((s: any) => s.session_id === selectedId)
          if (!sel || (sel as any).source !== 'archived') return null
          const isFav = (sel as any).is_favorite === 1
          return (
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button
                title={t('chat.filter.favorite')}
                onClick={() => toggleFavoriteMutation.mutate(selectedId)}
                style={{
                  padding: '2px 6px', fontSize: 12, borderRadius: 4,
                  border: '1px solid var(--tc-border)',
                  background: isFav ? 'var(--tc-accent)' : 'var(--tc-panel-bg)',
                  color: isFav ? 'var(--tc-accent-fg, #fff)' : '#f5a623',
                  cursor: 'pointer',
                }}
              >★</button>
              <button
                title={t('common.delete')}
                onClick={() => {
                  deleteArchivedMutation.mutate(selectedId)
                  selectSession('')
                }}
                style={{
                  padding: '2px 6px', fontSize: 12, borderRadius: 4,
                  border: '1px solid var(--tc-border)',
                  background: 'var(--tc-panel-bg)',
                  color: '#f87171',
                  cursor: 'pointer',
                }}
              >🗑</button>
            </div>
          )
        })()}
      </div>

      <SelectionToolbar containerRef={mainAreaRef} />
      <div className={s.body}>
        <div className={s.mainCol}>
          <div className={s.mainArea} ref={mainAreaRef} style={{ overflow: 'hidden', padding: 0 }}>
            <CodeExpandCtx.Provider value={codeExpanded}>
              {loading ? (
                <div className={s.empty}><span>{t('common.loading')}</span></div>
              ) : listItems.length === 0 ? (
                <div className={s.empty}><span className={s.emptyIcon}>💬</span><span>{t('admin.sessions.select_session')}</span></div>
              ) : (
                <Virtuoso
                  key={selectedId ?? 'empty'}
                  ref={virtuosoRef}
                  data={listItems}
                  style={{ height: '100%', width: '100%' }}
                  increaseViewportBy={600}
                  rangeChanged={handleRangeChanged}
                  startReached={hasMore ? loadMore : undefined}
                  computeItemKey={computeItemKey}
                  itemContent={itemContent}
                />
              )}
            </CodeExpandCtx.Provider>
          </div>

          {/* 底部操作栏 — 在可滚动区域之外，不遮盖内容 */}
          {vitems.length > 0 && (
            <div className={s.bottomBar}>
              <PromptInput />
            </div>
          )}
        </div>
        <MetaSidebar session={selectedSession} steps={steps} questions={questions} allQuestions={allQuestions} activeQ={activeQ} codeExpanded={codeExpanded} onToggleCode={() => setCodeExpanded(v => !v)} onScrollToQuestion={scrollToQuestion} />
      </div>
    </div>
  )
}

// 路由 default export（项目级，带 filterByCwd）
export default function ProjectChatReportPage() {
  return <ChatReportPage />
}
