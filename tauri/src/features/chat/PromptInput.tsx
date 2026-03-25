import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TranscriptMessage } from '../../lib/api/types'
import { useChatStore } from '../../lib/store/chat'
import { useChatStream } from '../../hooks/useChatStream'
import { IconX, IconPlus, IconLink, IconSettings, IconMaximize, IconFileText, IconCrosshair } from '../../ui/icon'
import s from './chat-report.module.css'

const QUICK_CHIPS = [
  { label: '澄清用户问题', color: '#60a5fa' },
  { label: '定义用户上下文', color: '#a78bfa' },
  { label: '选择可交付成果', color: '#34d399' },
  { label: '精化需求', color: '#fb923c' },
]

type Attachment = { id: string; name: string; kind: 'image' | 'file'; dataUrl?: string }

type DomContext = {
  _id: string
  tag: string
  id: string
  classes: string[]
  text: string
  path: string
  rect: { x: number; y: number; width: number; height: number }
  styles: { color: string; background: string; fontSize: string; display: string }
  outerHTML: string
}

function makeAiMsg(role: 'user' | 'assistant', text: string): TranscriptMessage {
  return { role, ts: new Date().toISOString(), blocks: [{ type: 'text', text }] }
}

/** 捕获目标元素的关键信息 */
function captureDomContext(el: Element): DomContext {
  const _id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const rect = el.getBoundingClientRect()
  const computed = window.getComputedStyle(el)

  // 构建路径（最多 3 层祖先）
  const pathParts: string[] = []
  let cur: Element | null = el.parentElement
  for (let i = 0; i < 3 && cur && cur !== document.body; i++, cur = cur.parentElement) {
    const cls = cur.className && typeof cur.className === 'string'
      ? '.' + cur.className.trim().split(/\s+/)[0]
      : ''
    pathParts.unshift(cur.tagName.toLowerCase() + cls)
  }

  const cls = el.className && typeof el.className === 'string'
    ? el.className.trim().split(/\s+/).filter(Boolean)
    : []

  const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80)

  // 简化 outerHTML（截断到 200 字符）
  const html = el.outerHTML.replace(/\s+/g, ' ').slice(0, 200)

  return {
    _id,
    tag: el.tagName.toLowerCase(),
    id: el.id || '',
    classes: cls,
    text,
    path: pathParts.join(' > '),
    rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
    styles: {
      color: computed.color,
      background: computed.backgroundColor,
      fontSize: computed.fontSize,
      display: computed.display,
    },
    outerHTML: html,
  }
}

/** 把单个 DomContext 格式化为文本块 */
function formatOneDomContext(ctx: DomContext, index: number): string {
  const selector = ctx.tag
    + (ctx.id ? `#${ctx.id}` : '')
    + (ctx.classes.length ? `.${ctx.classes[0]}` : '')

  const lines = [
    `--- 问题元素 #${index + 1} ---`,
    `元素: ${selector}`,
    ctx.path ? `路径: ${ctx.path} > ${selector}` : '',
    ctx.text ? `文本内容: "${ctx.text}"` : '',
    `位置与尺寸: x=${ctx.rect.x} y=${ctx.rect.y} ${ctx.rect.width}×${ctx.rect.height}px`,
    `样式: color=${ctx.styles.color} background=${ctx.styles.background} font-size=${ctx.styles.fontSize}`,
    `HTML: ${ctx.outerHTML}`,
    '---',
  ].filter(Boolean)

  return lines.join('\n')
}

/** 把多个 DomContext 拼接成完整上下文文本 */
function formatDomContextList(list: DomContext[]): string {
  if (list.length === 0) return ''
  return '\n\n' + list.map((ctx, i) => formatOneDomContext(ctx, i)).join('\n')
}

/** DOM 高亮覆盖层（portal 渲染到 body，pointer-events:none） */
function DomPickerOverlay({ rect }: { rect: DOMRectReadOnly | null }) {
  if (!rect) return null
  const style: React.CSSProperties = {
    position: 'fixed',
    left: rect.left - 2,
    top: rect.top - 2,
    width: rect.width + 4,
    height: rect.height + 4,
    border: '2px solid #60a5fa',
    borderRadius: 4,
    background: 'rgba(96,165,250,0.10)',
    pointerEvents: 'none',
    zIndex: 99999,
    boxShadow: '0 0 0 1px rgba(96,165,250,0.3)',
    transition: 'all 0.08s ease',
  }
  return createPortal(<div style={style} />, document.body)
}

type ModelInfo = { id: string; name: string; default?: boolean }

function _fmtTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function PromptInput() {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [expanded, setExpanded] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [isPicking, setIsPicking] = useState(false)
  const [pickRect, setPickRect] = useState<DOMRectReadOnly | null>(null)
  const [domCtxList, setDomCtxList] = useState<DomContext[]>([])
  const { isGenerating, addMessage, setMessages, setCurrentReply, inputDraft, setInputDraft,
          selectedModel, setSelectedModel, lastStats } = useChatStore()
  const { send, stop } = useChatStream()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modelMenuRef = useRef<HTMLDivElement>(null)

  // 监听外部 inputDraft（来自 empty state 建议卡片点击），应用后立即清空
  useEffect(() => {
    if (!inputDraft) return
    setValue(inputDraft)
    setInputDraft('')
    setTimeout(() => { textareaRef.current?.focus() }, 0)
  }, [inputDraft, setInputDraft])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)
  const isEmpty = value.trim() === '' && attachments.length === 0 && domCtxList.length === 0

  // 加载模型列表
  useEffect(() => {
    fetch('/api/chat/models')
      .then(r => r.ok ? r.json() : [])
      .then((list: ModelInfo[]) => { if (list.length) setModels(list) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!showSettings) return
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setShowSettings(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSettings])

  useEffect(() => {
    if (!showModelMenu) return
    const handler = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) setShowModelMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showModelMenu])

  // DOM 拾取模式
  useEffect(() => {
    if (!isPicking) {
      document.body.style.cursor = ''
      setPickRect(null)
      return
    }
    document.body.style.cursor = 'crosshair'

    const onMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      if (el && el !== document.body && el !== document.documentElement) {
        setPickRect(el.getBoundingClientRect())
      }
    }

    const onClick = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const el = document.elementFromPoint(e.clientX, e.clientY)
      if (el && el !== document.body && el !== document.documentElement) {
        setDomCtxList(v => [...v, captureDomContext(el)])
      }
      // 不退出拾取模式，允许继续选多个
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setIsPicking(false); setPickRect(null); document.body.style.cursor = '' }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isPicking])

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [])

  const handleSend = useCallback(() => {
    const text = value.trim()
    if ((!text && domCtxList.length === 0) || isGenerating) return
    const ctxText = formatDomContextList(domCtxList)
    const fullText = ctxText
      ? (text || `请帮我分析以下 ${domCtxList.length} 个元素`) + ctxText
      : text
    addMessage(makeAiMsg('user', fullText))
    send(fullText)
    setValue('')
    setAttachments([])
    setDomCtxList([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [value, domCtxList, isGenerating, addMessage, send])

  const handleStop = useCallback(() => stop(), [stop])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    files.forEach(file => {
      const id = `${Date.now()}-${Math.random()}`
      const isImage = file.type.startsWith('image/')
      if (isImage) {
        const reader = new FileReader()
        reader.onload = ev => {
          setAttachments(v => [...v, { id, name: file.name, kind: 'image', dataUrl: ev.target?.result as string }])
        }
        reader.readAsDataURL(file)
      } else {
        setAttachments(v => [...v, { id, name: file.name, kind: 'file' }])
      }
    })
    e.target.value = ''
    textareaRef.current?.focus()
  }, [])

  const removeAttachment = useCallback((id: string) => {
    setAttachments(v => v.filter(a => a.id !== id))
  }, [])

  return (
    <>
      {isPicking && <DomPickerOverlay rect={pickRect} />}
      {isPicking && createPortal(
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 99998, cursor: 'crosshair',
        }} />,
        document.body
      )}

      <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileChange} />
      <input ref={imageInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileChange} />

      <div className={s.promptCard}>
        {(attachments.length > 0 || domCtxList.length > 0) && (
          <div className={s.pAttachRow}>
            {attachments.map(a => a.kind === 'image' && a.dataUrl ? (
              <span key={a.id} className={s.pImgThumb}>
                <img src={a.dataUrl} alt={a.name} title={a.name} />
                <button onClick={() => removeAttachment(a.id)}><IconX size={8} /></button>
              </span>
            ) : (
              <span key={a.id} className={s.pAttachChip}>
                <IconFileText size={11} />
                <span>{a.name}</span>
                <button className={s.pAttachClose} onClick={() => removeAttachment(a.id)}><IconX size={10} /></button>
              </span>
            ))}
            {domCtxList.map((ctx, i) => {
              // 优先显示有意义的内容：有文本则展示文本，否则展示路径片段
              const selector = ctx.tag + (ctx.id ? `#${ctx.id}` : '') + (ctx.classes[0] ? `.${ctx.classes[0]}` : '')
              // 取路径最后一段作为位置提示
              const pathTail = ctx.path ? ctx.path.split(' > ').slice(-1)[0] : ''
              const location = pathTail ? `${pathTail} › ${ctx.tag}` : selector
              const preview = ctx.text
                ? `"${ctx.text.slice(0, 24)}${ctx.text.length > 24 ? '…' : ''}"`
                : `${ctx.rect.width}×${ctx.rect.height}px`
              const tooltip = [
                `#${i + 1} ${selector}`,
                ctx.path ? `路径: ${ctx.path}` : '',
                ctx.text ? `文本: ${ctx.text}` : '',
                `位置: (${ctx.rect.x}, ${ctx.rect.y})  ${ctx.rect.width}×${ctx.rect.height}px`,
              ].filter(Boolean).join('\n')
              return (
                <span key={ctx._id} className={s.pDomChip} title={tooltip}>
                  <IconCrosshair size={10} />
                  <span className={s.pDomChipIndex}>{i + 1}</span>
                  <span className={s.pDomChipLabel}>{location}</span>
                  <span className={s.pDomChipText}>{preview}</span>
                  <button className={s.pAttachClose} onClick={() => setDomCtxList(v => v.filter(c => c._id !== ctx._id))}><IconX size={10} /></button>
                </span>
              )
            })}
            {domCtxList.length > 1 && (
              <button
                className={s.pDomClearAll}
                onClick={() => setDomCtxList([])}
                title="清除所有标记元素"
              >
                全部清除
              </button>
            )}
          </div>
        )}

        <div className={s.pInputRow}>
          <textarea
            ref={textareaRef}
            className={s.pTextarea}
            style={{ maxHeight: expanded ? 400 : 160 }}
            placeholder={isGenerating ? '正在处理...' : (isPicking ? '点击页面上任意元素以选取…' : '向 AI 提问... (⌘↵ 发送)')}
            value={value}
            onChange={e => { setValue(e.target.value); autoResize() }}
            onKeyDown={handleKeyDown}
            disabled={isGenerating || isPicking}
            rows={1}
          />
          <button
            className={s.pExpandBtn}
            title={expanded ? '收起' : '展开输入框'}
            onClick={() => { setExpanded(v => !v); setTimeout(() => autoResize(), 0) }}
          >
            <IconMaximize size={13} />
          </button>
        </div>

        <div className={s.pToolbar}>
          <div className={s.pToolLeft}>
            <button className={s.pToolBtn} title="添加附件" onClick={() => fileInputRef.current?.click()}>
              <IconPlus size={14} />
            </button>
            <button className={s.pToolBtn} title="插入链接">
              <IconLink size={14} />
            </button>
            <button
              className={`${s.pToolBtn} ${isPicking ? s.pToolBtnActive : ''}`}
              title={isPicking ? '取消拾取 (Esc)' : '点选页面元素，告诉 AI 哪里有问题'}
              onClick={() => setIsPicking(v => !v)}
            >
              <IconCrosshair size={14} />
            </button>
            <div className={s.pToolSep} />
            {/* 模型选择器 */}
            <div ref={modelMenuRef} style={{ position: 'relative' }}>
              <button
                className={s.pModelBtn}
                title="选择模型"
                onClick={() => setShowModelMenu(v => !v)}
              >
                {(models.find(m => m.id === selectedModel) || models[0])?.name ?? 'Sonnet 4'}
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 3 }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {showModelMenu && models.length > 0 && (
                <div className={s.settingsDropdown} style={{ minWidth: 160, zIndex: 200 }}>
                  {models.map(m => (
                    <button
                      key={m.id}
                      className={s.settingsItem}
                      style={m.id === selectedModel ? { color: 'var(--tc-accent)' } : undefined}
                      onClick={() => { setSelectedModel(m.id); setShowModelMenu(false) }}
                    >
                      {m.id === selectedModel && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className={s.pToolRight}>
            <div ref={settingsRef} style={{ position: 'relative' }}>
              <button
                className={s.pToolBtn}
                title="设置"
                onClick={() => setShowSettings(v => !v)}
                style={showSettings ? { color: 'var(--tc-foreground)', background: 'rgba(255,255,255,0.06)' } : undefined}
              >
                <IconSettings size={14} />
              </button>
              {showSettings && (
                <div className={s.settingsDropdown}>
                  <button
                    className={s.settingsItem}
                    onClick={() => { setMessages([]); setCurrentReply(''); setShowSettings(false) }}
                  >
                    清除对话记录
                  </button>
                </div>
              )}
            </div>
            {isGenerating ? (
              <button className={s.pStopBtn} onClick={handleStop} title="停止">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              </button>
            ) : (
              <button className={s.pSendBtn} onClick={handleSend} disabled={isEmpty} title="发送 (⌘↵)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {isPicking && (
          <div className={s.pPickingHint}>
            <IconCrosshair size={12} />
            {domCtxList.length > 0
              ? <span>已选 <strong>{domCtxList.length}</strong> 个，继续点击选更多，<kbd>Esc</kbd> 完成</span>
              : <span>点击页面任意元素以选取，<kbd>Esc</kbd> 取消</span>
            }
          </div>
        )}

        {isGenerating && !isPicking && (
          <div className={s.pThinking}>
            <span className={s.pThinkingDot} />
            <span>正在生成回复...</span>
          </div>
        )}

        {!isGenerating && !isPicking && lastStats && (lastStats.cost_usd !== undefined || lastStats.duration_ms) && (
          <div className={s.pStatsBar}>
            {lastStats.duration_ms != null && lastStats.duration_ms > 0 && (
              <span>⏱ {lastStats.duration_ms >= 60000
                ? `${Math.floor(lastStats.duration_ms / 60000)}m${Math.floor((lastStats.duration_ms % 60000) / 1000)}s`
                : `${(lastStats.duration_ms / 1000).toFixed(1)}s`}</span>
            )}
            {(lastStats.input_tokens || lastStats.output_tokens) ? (
              <span>↓{_fmtTokens(lastStats.input_tokens ?? 0)} ↑{_fmtTokens(lastStats.output_tokens ?? 0)}</span>
            ) : null}
            {lastStats.cost_usd != null && lastStats.cost_usd > 0 && (
              <span>${lastStats.cost_usd.toFixed(4)}</span>
            )}
          </div>
        )}
      </div>

      {isEmpty && !isGenerating && !isPicking && (
        <div className={s.pChips}>
          {QUICK_CHIPS.map(chip => (
            <button
              key={chip.label}
              className={s.pChip}
              onClick={() => { setValue(chip.label); setTimeout(() => textareaRef.current?.focus(), 0) }}
            >
              <span className={s.pChipDot} style={{ background: chip.color }} />
              {chip.label}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
