import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TranscriptMessage } from '../../lib/api/types'
import { useChatStore } from '../../lib/store/chat'
import { useChatStream } from '../../hooks/useChatStream'
import { IconX, IconPlus, IconLink, IconSettings, IconMaximize, IconCrosshair } from '../../ui/icon'
import { useTranslation } from 'react-i18next'
import s from './chat-report.module.css'

const QUICK_CHIP_COLORS = ['#60a5fa', '#a78bfa', '#34d399', '#fb923c']

type Attachment = { id: string; name: string; kind: 'image' | 'file' | 'folder'; dataUrl?: string; ext?: string; size?: number; itemCount?: number }

const FILE_COLOR_MAP: Record<string, string> = {
  pdf: '#ef4444',
  doc: '#2563eb', docx: '#2563eb',
  xls: '#16a34a', xlsx: '#16a34a', csv: '#16a34a',
  ppt: '#ea580c', pptx: '#ea580c',
  txt: '#9ca3af', md: '#8b5cf6', mdx: '#8b5cf6',
  json: '#f59e0b', yaml: '#f59e0b', yml: '#f59e0b',
  js: '#f59e0b', jsx: '#60a5fa', ts: '#60a5fa', tsx: '#60a5fa',
  py: '#3b82f6', rb: '#ef4444', go: '#06b6d4', rs: '#ea580c',
  css: '#06b6d4', scss: '#ec4899', html: '#ea580c',
  svg: '#10b981', xml: '#f59e0b',
  zip: '#8b5cf6', tar: '#8b5cf6', gz: '#8b5cf6',
  mp4: '#ec4899', mov: '#ec4899', mp3: '#ec4899', wav: '#ec4899',
  sh: '#71717a', bash: '#71717a',
}

function getFileColor(ext: string): string {
  return FILE_COLOR_MAP[ext.toLowerCase()] ?? '#71717a'
}

function fmtFileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileTypeSvg({ ext }: { ext: string }) {
  const color = getFileColor(ext)
  const label = (ext || 'FILE').toUpperCase().slice(0, 4)
  return (
    <svg width="30" height="36" viewBox="0 0 30 36" fill="none" style={{ flexShrink: 0 }}>
      <path d="M3 0 H18 L27 9 V33 Q27 36 24 36 H6 Q3 36 3 33 Z" fill={color} fillOpacity="0.15" />
      <path d="M3 0 H18 L27 9 V33 Q27 36 24 36 H6 Q3 36 3 33 Z" stroke={color} strokeWidth="1" strokeOpacity="0.6" />
      <path d="M18 0 L18 9 L27 9" stroke={color} strokeWidth="1" strokeOpacity="0.6" fill="none" />
      <text x="15" y="27" textAnchor="middle" fontSize="7" fontWeight="800" fill={color} fontFamily="ui-monospace,monospace">{label}</text>
    </svg>
  )
}

function FolderSvg() {
  return (
    <svg width="40" height="34" viewBox="0 0 40 34" fill="none" style={{ flexShrink: 0 }}>
      <path d="M2 13 L2 9 Q2 7 4 7 L14 7 Q17 7 18 10 L19 13 Z" fill="#5ba4f5" />
      <rect x="2" y="12" width="36" height="20" rx="3" fill="#4b96e8" />
      <rect x="2" y="12" width="36" height="7" fill="#5ba4f5" />
      <rect x="2" y="17" width="36" height="2" fill="#4b96e8" />
    </svg>
  )
}

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
    `【元素 #${index + 1}】${selector}`,
    ctx.path ? `路径: ${ctx.path} > ${selector}` : '',
    ctx.text ? `文本: "${ctx.text}"` : '',
    `尺寸: ${ctx.rect.width}×${ctx.rect.height}px @ (${ctx.rect.x}, ${ctx.rect.y})`,
    `样式: color=${ctx.styles.color} bg=${ctx.styles.background} font=${ctx.styles.fontSize}`,
    `HTML: ${ctx.outerHTML}`,
  ].filter(Boolean)

  return lines.join('\n')
}

/** 把多个 DomContext 拼接成完整上下文文本 */
function formatDomContextList(list: DomContext[]): string {
  if (list.length === 0) return ''
  return '\n\n' + list.map((ctx, i) => formatOneDomContext(ctx, i)).join('\n\n')
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

const PERMISSION_MODES = [
  { id: 'bypassPermissions', label: 'Bypass' },
  { id: 'acceptEdits',       label: 'Accept Edits' },
  { id: 'plan',              label: 'Plan' },
  { id: 'default',           label: 'Default' },
]

function _fmtTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function PromptInput() {
  const { t } = useTranslation()
  const quickChips = useMemo(() => [
    { label: t('prompt_input.quick_chip_clarify'), color: QUICK_CHIP_COLORS[0] },
    { label: t('prompt_input.quick_chip_context'), color: QUICK_CHIP_COLORS[1] },
    { label: t('prompt_input.quick_chip_deliverable'), color: QUICK_CHIP_COLORS[2] },
    { label: t('prompt_input.quick_chip_refine'), color: QUICK_CHIP_COLORS[3] },
  ], [t])
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [expanded, setExpanded] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [showPermMenu, setShowPermMenu] = useState(false)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [isPicking, setIsPicking] = useState(false)
  const [pickRect, setPickRect] = useState<DOMRectReadOnly | null>(null)
  const [domCtxList, setDomCtxList] = useState<DomContext[]>([])
  const { isGenerating, addMessage, setMessages, setCurrentReply, inputDraft, setInputDraft,
          selectedModel, setSelectedModel, lastStats,
          permissionMode, setPermissionMode } = useChatStore()
  const { send, stop } = useChatStream()
  const [modelMenuPos, setModelMenuPos] = useState<{ left: number; bottom: number } | null>(null)
  const [permMenuPos, setPermMenuPos] = useState<{ left: number; bottom: number } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modelBtnRef = useRef<HTMLButtonElement>(null)
  const permBtnRef = useRef<HTMLButtonElement>(null)
  const modelMenuRef = useRef<HTMLDivElement>(null)
  const permMenuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)

  // 监听外部 inputDraft（来自 empty state 建议卡片点击），应用后立即清空
  useEffect(() => {
    if (!inputDraft) return
    setValue(inputDraft)
    setInputDraft('')
    setTimeout(() => { textareaRef.current?.focus() }, 0)
  }, [inputDraft, setInputDraft])
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
      const target = e.target as Node
      if (modelBtnRef.current?.contains(target) || modelMenuRef.current?.contains(target)) return
      setShowModelMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showModelMenu])

  useEffect(() => {
    if (!showPermMenu) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (permBtnRef.current?.contains(target) || permMenuRef.current?.contains(target)) return
      setShowPermMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPermMenu])

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
    if ((!text && attachments.length === 0 && domCtxList.length === 0) || isGenerating) return
    const ctxText = formatDomContextList(domCtxList)
    // 把附件序列化为 [Image: source: ...] 或 [File: name] 格式，追加到消息末
    const attachText = attachments.map(a => {
      if (a.kind === 'image') {
        // dataUrl 附件：直接内嵌；如果有真实文件路径则用路径格式
        return `\n[Image: source: ${a.dataUrl ?? a.name}]`
      }
      return `\n[File: ${a.name}]`
    }).join('')
    const displayText = text || (attachments.length > 0 ? '' : t('prompt_input.analyze_elements', { count: domCtxList.length }))
    const fullText = [displayText, attachText, ctxText].filter(Boolean).join('')
    const userMsg = displayText + attachText
    console.log(`[发送消息] 附件数=${attachments.length} 附件文本="${attachText.slice(0, 120)}" 用户消息="${userMsg.slice(0, 120)}"`)
    addMessage(makeAiMsg('user', fullText))
    send(fullText)
    setValue('')
    setAttachments([])
    setDomCtxList([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [value, attachments, domCtxList, isGenerating, addMessage, send])

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
      const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() ?? '' : ''
      if (isImage) {
        const reader = new FileReader()
        reader.onload = ev => {
          setAttachments(v => [...v, { id, name: file.name, kind: 'image', dataUrl: ev.target?.result as string, ext, size: file.size }])
        }
        reader.readAsDataURL(file)
      } else {
        setAttachments(v => [...v, { id, name: file.name, kind: 'file', ext, size: file.size }])
      }
    })
    e.target.value = ''
    textareaRef.current?.focus()
  }, [])

  const removeAttachment = useCallback((id: string) => {
    setAttachments(v => v.filter(a => a.id !== id))
  }, [])

  const btnWidth = modelBtnRef.current?.offsetWidth ?? 120

  return (
    <>
      {isPicking && <DomPickerOverlay rect={pickRect} />}
      {isPicking && createPortal(
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 99998, pointerEvents: 'none',
        }} />,
        document.body
      )}
      {/* 模型选择下拉（portal，避免被 overflow:hidden 裁剪） */}
      {showModelMenu && modelMenuPos && models.length > 0 && createPortal(
        <div
          ref={modelMenuRef}
          style={{
            position: 'fixed',
            left: modelMenuPos.left,
            bottom: modelMenuPos.bottom,
            width: Math.max(btnWidth, 140),
            background: 'var(--tc-sidebar-bg)',
            border: '1px solid var(--tc-border)',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            zIndex: 9999,
            overflow: 'hidden',
          }}
        >
          {models.map(m => (
            <button
              key={m.id}
              className={s.settingsItem}
              style={m.id === selectedModel ? { color: 'var(--tc-accent)', display: 'flex', alignItems: 'center' } : { display: 'flex', alignItems: 'center' }}
              onClick={() => { setSelectedModel(m.id); setShowModelMenu(false) }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{ marginRight: 6, opacity: m.id === selectedModel ? 1 : 0, flexShrink: 0 }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {m.name}
            </button>
          ))}
        </div>,
        document.body
      )}

      {showPermMenu && permMenuPos && createPortal(
        <div
          ref={permMenuRef}
          style={{
            position: 'fixed',
            left: permMenuPos.left,
            bottom: permMenuPos.bottom,
            width: 120,
            background: 'var(--tc-sidebar-bg)',
            border: '1px solid var(--tc-border)',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            zIndex: 9999,
            overflow: 'hidden',
          }}
        >
          {PERMISSION_MODES.map(m => (
            <button
              key={m.id}
              className={s.settingsItem}
              style={m.id === permissionMode ? { color: 'var(--tc-accent)', display: 'flex', alignItems: 'center' } : { display: 'flex', alignItems: 'center' }}
              onClick={() => {
                setPermissionMode(m.id)
                setShowPermMenu(false)
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{ marginRight: 6, opacity: m.id === permissionMode ? 1 : 0, flexShrink: 0 }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {m.label}
            </button>
          ))}
        </div>,
        document.body
      )}

      <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileChange} />
      <input ref={imageInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileChange} />

      <div className={s.promptCard}>
        {(attachments.length > 0 || domCtxList.length > 0) && (
          <div className={s.pAttachRow}>
            {attachments.map(a => {
              if (a.kind === 'image' && a.dataUrl) {
                return (
                  <div key={a.id} className={s.pImgCard}>
                    <img src={a.dataUrl} alt={a.name} />
                    <div className={s.pImgCardBar}>
                      <span className={s.pImgCardName}>{a.name}</span>
                      <button className={s.pAttachClose} onClick={() => removeAttachment(a.id)}><IconX size={9} /></button>
                    </div>
                  </div>
                )
              }
              return (
                <div key={a.id} className={s.pFileCard}>
                  {a.kind === 'folder' ? <FolderSvg /> : <FileTypeSvg ext={a.ext || ''} />}
                  <div className={s.pFileCardMeta}>
                    <span className={s.pFileCardName}>{a.name}</span>
                    <span className={s.pFileCardInfo}>
                      {a.kind === 'folder'
                        ? (a.itemCount ? t('prompt_input.files_count', { count: a.itemCount }) : t('prompt_input.folder_label'))
                        : [(a.ext || 'FILE').toUpperCase(), fmtFileSize(a.size)].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <button className={s.pAttachClose} onClick={() => removeAttachment(a.id)}><IconX size={9} /></button>
                </div>
              )
            })}
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
                title={t('prompt_input.clear_all_elements')}
              >
                {t('prompt_input.clear_all_btn')}
              </button>
            )}
          </div>
        )}

        <div className={s.pInputRow}>
          <textarea
            ref={textareaRef}
            className={s.pTextarea}
            style={{ maxHeight: expanded ? 400 : 160 }}
            placeholder={isGenerating ? t('prompt_input.placeholder_generating') : (isPicking ? t('prompt_input.placeholder_picking') : t('prompt_input.placeholder_default'))}
            value={value}
            onChange={e => { setValue(e.target.value); autoResize() }}
            onKeyDown={handleKeyDown}
            disabled={isGenerating || isPicking}
            rows={1}
          />
          <button
            className={s.pExpandBtn}
            title={expanded ? t('prompt_input.collapse') : t('prompt_input.expand')}
            onClick={() => { setExpanded(v => !v); setTimeout(() => autoResize(), 0) }}
          >
            <IconMaximize size={13} />
          </button>
        </div>

        <div className={s.pToolbar}>
          <div className={s.pToolLeft}>
            <button className={s.pToolBtn} title={t('prompt_input.add_attachment')} onClick={() => fileInputRef.current?.click()}>
              <IconPlus size={14} />
            </button>
            <button className={s.pToolBtn} title={t('prompt_input.insert_link')}>
              <IconLink size={14} />
            </button>
            <button
              className={`${s.pToolBtn} ${isPicking ? s.pToolBtnActive : ''}`}
              title={isPicking ? t('prompt_input.pick_cancel') : t('prompt_input.pick_hint')}
              onClick={() => setIsPicking(v => !v)}
            >
              <IconCrosshair size={14} />
            </button>
            <div className={s.pToolSep} />
            {/* 模型选择器 */}
            <button
              ref={modelBtnRef}
              className={s.pModelBtn}
              title={t('prompt_input.select_model')}
              onClick={() => {
                if (showModelMenu) { setShowModelMenu(false); return }
                const r = modelBtnRef.current?.getBoundingClientRect()
                if (r) setModelMenuPos({ left: r.left, bottom: window.innerHeight - r.top + 4 })
                setShowModelMenu(true)
              }}
            >
              {(models.find(m => m.id === selectedModel) || models[0])?.name ?? 'Sonnet 4'}
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 3 }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <div className={s.pToolSep} />
            <button
              ref={permBtnRef}
              className={s.pModelBtn}
              title={t('prompt_input.permission_mode')}
              onClick={() => {
                if (showPermMenu) { setShowPermMenu(false); return }
                const r = permBtnRef.current?.getBoundingClientRect()
                if (r) setPermMenuPos({ left: r.left, bottom: window.innerHeight - r.top + 4 })
                setShowPermMenu(true)
              }}
            >
              {PERMISSION_MODES.find(m => m.id === permissionMode)?.label ?? 'Bypass'}
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 3 }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
          <div className={s.pToolRight}>
            <div ref={settingsRef} style={{ position: 'relative' }}>
              <button
                className={s.pToolBtn}
                title={t('prompt_input.settings')}
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
                    {t('prompt_input.clear_history')}
                  </button>
                </div>
              )}
            </div>
            {isGenerating ? (
              <button className={s.pStopBtn} onClick={handleStop} title={t('prompt_input.stop')}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              </button>
            ) : (
              <button className={s.pSendBtn} onClick={handleSend} disabled={isEmpty} title={t('prompt_input.send')}>
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
              ? <span>{t('prompt_input.picking_hint_selected', { count: domCtxList.length })}</span>
              : <span>{t('prompt_input.picking_hint_empty')}</span>
            }
          </div>
        )}

        {isGenerating && !isPicking && (
          <div className={s.pThinking}>
            <span className={s.pThinkingDot} />
            <span>{t('prompt_input.generating')}</span>
          </div>
        )}

        {!isGenerating && !isPicking && lastStats && (
          <div className={s.pStatsBar}>
            <span title="耗时">⏱ {lastStats.duration_ms != null && lastStats.duration_ms > 0
              ? (lastStats.duration_ms >= 60000
                ? `${Math.floor(lastStats.duration_ms / 60000)}m${Math.floor((lastStats.duration_ms % 60000) / 1000)}s`
                : `${(lastStats.duration_ms / 1000).toFixed(1)}s`)
              : '—'}</span>
            <span className={s.pStatsSep} />
            <span title="输入/输出 token">
              ↓{_fmtTokens(lastStats.input_tokens ?? 0)} ↑{_fmtTokens(lastStats.output_tokens ?? 0)}
            </span>
            <span className={s.pStatsSep} />
            <span title="费用">${lastStats.cost_usd != null
              ? lastStats.cost_usd.toFixed(4)
              : '—'}</span>
          </div>
        )}
      </div>

      {isEmpty && !isGenerating && !isPicking && (
        <div className={s.pChips}>
          {quickChips.map(chip => (
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
