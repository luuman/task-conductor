import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { TranscriptMessage } from '../../lib/api/types'
import { useChatStore } from '../../lib/store/chat'
import { useChatStream } from '../../hooks/useChatStream'
import { IconX, IconPlus, IconLink, IconSettings, IconMaximize, IconFileText } from '../../ui/icon'
import s from './chat-report.module.css'

const QUICK_CHIPS = [
  { label: '澄清用户问题', color: '#60a5fa' },
  { label: '定义用户上下文', color: '#a78bfa' },
  { label: '选择可交付成果', color: '#34d399' },
  { label: '精化需求', color: '#fb923c' },
]

type Attachment = { id: string; name: string; kind: 'image' | 'file'; dataUrl?: string }

function makeAiMsg(role: 'user' | 'assistant', text: string): TranscriptMessage {
  return { role, ts: new Date().toISOString(), blocks: [{ type: 'text', text }] }
}

export function PromptInput() {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [expanded, setExpanded] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const { isGenerating, addMessage, setMessages, setCurrentReply } = useChatStore()
  const { send, stop } = useChatStream()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)
  const isEmpty = value.trim() === '' && attachments.length === 0

  useEffect(() => {
    if (!showSettings) return
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setShowSettings(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSettings])

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [])

  const handleSend = useCallback(() => {
    const text = value.trim()
    if (!text || isGenerating) return
    addMessage(makeAiMsg('user', text))
    send(text)
    setValue('')
    setAttachments([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [value, isGenerating, addMessage, send])

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
      <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileChange} />
      <input ref={imageInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileChange} />

      <div className={s.promptCard}>
        {attachments.length > 0 && (
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
          </div>
        )}

        <div className={s.pInputRow}>
          <textarea
            ref={textareaRef}
            className={s.pTextarea}
            style={{ maxHeight: expanded ? 400 : 160 }}
            placeholder={isGenerating ? '正在处理...' : '向 AI 提问... (⌘↵ 发送)'}
            value={value}
            onChange={e => { setValue(e.target.value); autoResize() }}
            onKeyDown={handleKeyDown}
            disabled={isGenerating}
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

        {isGenerating && (
          <div className={s.pThinking}>
            <span className={s.pThinkingDot} />
            <span>正在生成回复...</span>
          </div>
        )}
      </div>

      {isEmpty && !isGenerating && (
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
