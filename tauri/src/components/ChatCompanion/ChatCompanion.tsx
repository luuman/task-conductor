import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { IconSearch, IconX, IconChevronLeft, IconMessage, IconPlus } from '../../ui/icon'
import styles from './chat-companion.module.css'

// ── Demo Data ──

interface ChatShortcut {
  id: string
  label: string
  color: string
  icon: string
}

interface ChatHistoryItem {
  id: string
  title: string
  preview: string
  time: string
  icon: string
  unread?: boolean
}

interface ChatMessage {
  id: string
  role: 'user' | 'bot'
  text: string
  time: string
}

interface DemoChat {
  id: string
  title: string
  messages: ChatMessage[]
}

const SHORTCUTS: ChatShortcut[] = [
  { id: 'chat-ai',   label: 'ChatAI',        color: '#4a9eff', icon: '💬' },
  { id: 'image',     label: 'Image of sun',   color: '#f59e0b', icon: '🌅' },
  { id: 'analyst',   label: 'Data Analyst',   color: '#10b981', icon: '📊' },
]

const HISTORY: ChatHistoryItem[] = [
  { id: 'c1', title: 'How can I improve my time management...',             preview: 'Try the Pomodoro technique',  time: '2m',  icon: '⏰' },
  { id: 'c2', title: "What's the best way to learn a new skill...",         preview: 'Deliberate practice is key',  time: '15m', icon: '📚' },
  { id: 'c3', title: 'How do I start investing in stocks as a b...',        preview: 'Start with index funds',      time: '1h',  icon: '📈' },
  { id: 'c4', title: 'What are the benefits of daily exercise fo...',       preview: 'Boosts mood and energy',      time: '2h',  icon: '🏃' },
  { id: 'c5', title: "What's the difference between a UI desi...",          preview: 'UI focuses on visuals',       time: '5h',  icon: '🎨' },
]

const DEMO_CHATS: Record<string, DemoChat> = {
  c1: {
    id: 'c1',
    title: 'How can I improve my time management',
    messages: [
      { id: 'm1', role: 'user',  text: 'How can I improve my time management?',                                                     time: '10:30' },
      { id: 'm2', role: 'bot',   text: "Great question! Here are some proven techniques:\n\n1. **Pomodoro Technique** — Work in 25-min focused sprints\n2. **Time blocking** — Assign tasks to specific hours\n3. **Eat the frog** — Do the hardest task first\n4. **2-minute rule** — If it takes <2 min, do it now", time: '10:30' },
      { id: 'm3', role: 'user',  text: "What's the best way to learn a new skill?",                                                 time: '10:32' },
      { id: 'm4', role: 'bot',   text: "The key is **deliberate practice**:\n\n• Break the skill into sub-skills\n• Focus on your weak areas\n• Get immediate feedback\n• Practice consistently (even 20 min/day)\n\nWould you like me to create a learning plan?", time: '10:32' },
    ],
  },
  c2: {
    id: 'c2',
    title: "What's the best way to learn a new skill",
    messages: [
      { id: 'm1', role: 'user',  text: "What's the best way to learn a new skill?",  time: '10:15' },
      { id: 'm2', role: 'bot',   text: "I recommend the **3-phase approach**:\n\n**Phase 1: Deconstruct**\nBreak the skill into the smallest learnable units.\n\n**Phase 2: Learn enough to self-correct**\nStudy just enough theory to notice when you're making mistakes.\n\n**Phase 3: Remove barriers to practice**\nEliminate distractions and commit to daily practice sessions.", time: '10:15' },
    ],
  },
  c3: {
    id: 'c3',
    title: 'How do I start investing in stocks',
    messages: [
      { id: 'm1', role: 'user',  text: 'How do I start investing in stocks as a beginner?', time: '09:30' },
      { id: 'm2', role: 'bot',   text: "Here's a beginner-friendly roadmap:\n\n1. **Emergency fund first** — Save 3-6 months expenses\n2. **Start with index funds** — Low fees, diversified\n3. **Dollar-cost averaging** — Invest same amount monthly\n4. **Learn the basics** — P/E ratio, market cap, dividends\n\nAvoid: individual stock picking, timing the market, and FOMO investing.", time: '09:31' },
    ],
  },
}

// ── User Info ──
const USER = {
  name: 'Sara Lee',
  role: 'Sales Assistant',
  initials: 'SL',
}

const SUGGESTIONS = [
  'Create a task plan',
  'Analyze requirements',
  'Review code changes',
  'Generate a report',
]

// ── Component ──

interface ChatCompanionProps {
  open: boolean
  onClose: () => void
}

export function ChatCompanion({ open, onClose }: ChatCompanionProps) {
  const [view, setView] = useState<'list' | 'chat'>('list')
  const [activeChat, setActiveChat] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [input, setInput] = useState('')
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 重置状态
  useEffect(() => {
    if (!open) {
      // Delay reset to after close animation
      const timer = setTimeout(() => {
        setView('list')
        setActiveChat(null)
        setSearchOpen(false)
        setSearchQuery('')
      }, 350)
      return () => clearTimeout(timer)
    }
  }, [open])

  // 自动聚焦搜索
  useEffect(() => {
    if (searchOpen) {
      requestAnimationFrame(() => searchInputRef.current?.focus())
    }
  }, [searchOpen])

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [localMessages, isTyping])

  // 打开聊天
  const openChat = useCallback((chatId: string) => {
    const demo = DEMO_CHATS[chatId]
    setActiveChat(chatId)
    setLocalMessages(demo?.messages || [])
    setView('chat')
  }, [])

  // 返回列表
  const backToList = useCallback(() => {
    setView('list')
    setActiveChat(null)
  }, [])

  // 新建聊天
  const newChat = useCallback(() => {
    setActiveChat('new')
    setLocalMessages([])
    setView('chat')
  }, [])

  // 模拟发送
  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text) return
    setInput('')

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    setLocalMessages(prev => [...prev, userMsg])
    setIsTyping(true)

    // 模拟 bot 回复
    setTimeout(() => {
      setIsTyping(false)
      const botMsg: ChatMessage = {
        id: `b-${Date.now()}`,
        role: 'bot',
        text: `Thanks for your question! I'd be happy to help with "${text.slice(0, 50)}". Let me analyze this and provide some insights...`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      setLocalMessages(prev => [...prev, botMsg])
    }, 1200 + Math.random() * 800)
  }, [input])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // 搜索过滤
  const filteredHistory = searchQuery
    ? HISTORY.filter(h => h.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : HISTORY

  const chatTitle = activeChat === 'new'
    ? 'New Chat'
    : HISTORY.find(h => h.id === activeChat)?.title || 'Chat'

  return (
    <>
      {/* Overlay */}
      <div
        className={`${styles.overlay} ${open ? styles.overlayVisible : ''}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`${styles.companion} ${open ? styles.companionOpen : ''}`}>
        {/* ── Header ── */}
        <div className={styles.header}>
          <span className={styles.headerTitle}>Chat</span>
          <button
            className={styles.headerSearch}
            onClick={() => setSearchOpen(v => !v)}
            aria-label="Search"
          >
            <IconSearch size={16} />
          </button>
          <div className={styles.headerBrand}>
            <span>Orbita GPT</span>
            <span className={styles.headerBrandDot} />
            <span className={styles.proBadge}>Pro</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <IconX size={16} />
          </button>
        </div>

        {/* ── Search Bar ── */}
        {searchOpen && (
          <div className={styles.searchOverlay}>
            <div className={styles.searchWrap}>
              <span className={styles.searchWrapIcon}>
                <IconSearch size={14} />
              </span>
              <input
                ref={searchInputRef}
                className={styles.searchInput}
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery('') } }}
              />
            </div>
          </div>
        )}

        {/* ── List View ── */}
        {view === 'list' && (
          <div className={styles.body}>
            {/* New Chat Button */}
            <button className={styles.newChatBtn} onClick={newChat}>
              <span className={styles.newChatBtnIcon}>
                <IconPlus size={13} />
              </span>
              New Chat
            </button>

            {/* Shortcuts */}
            <div className={styles.section}>
              <div className={styles.sectionLabel}>
                <svg className={styles.sectionLabelIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
                Shorts
              </div>
              <div className={styles.shortcutsGrid}>
                {SHORTCUTS.map(s => (
                  <div key={s.id} className={styles.shortcutChip} onClick={newChat}>
                    <span className={styles.shortcutDot} style={{ background: s.color }} />
                    <span className={styles.shortcutLabel}>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Today */}
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Today</div>
              <div className={styles.historyList}>
                {filteredHistory.map(item => (
                  <div
                    key={item.id}
                    className={`${styles.historyItem} ${styles.animateIn} ${activeChat === item.id ? styles.historyItemActive : ''}`}
                    onClick={() => openChat(item.id)}
                  >
                    <div className={styles.historyItemIcon}>{item.icon}</div>
                    <div className={styles.historyItemContent}>
                      <div className={styles.historyItemTitle}>{item.title}</div>
                      <div className={styles.historyItemMeta}>{item.preview}</div>
                    </div>
                    <span className={styles.historyItemTime}>{item.time}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.divider} />

            {/* User Card */}
            <div className={styles.userCard}>
              <div className={styles.userCardAvatar}>{USER.initials}</div>
              <div className={styles.userCardInfo}>
                <div className={styles.userCardName}>{USER.name}</div>
                <div className={styles.userCardRole}>{USER.role}</div>
              </div>
              <button className={styles.userCardAction}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
                Connect Calendar
              </button>
            </div>
          </div>
        )}

        {/* ── Chat View ── */}
        {view === 'chat' && (
          <div className={styles.chatView}>
            {/* Chat Sub-header */}
            <div className={styles.chatHeader}>
              <button className={styles.chatBackBtn} onClick={backToList}>
                <IconChevronLeft size={16} />
              </button>
              <span className={styles.chatTitle}>{chatTitle}</span>
            </div>

            {/* Messages */}
            <div className={styles.chatMessages}>
              {localMessages.length === 0 && !isTyping && (
                <div className={styles.emptyChat}>
                  <div className={styles.emptyChatIcon}>
                    <IconMessage size={22} />
                  </div>
                  <div className={styles.emptyChatTitle}>Start a conversation</div>
                  <div className={styles.emptyChatSub}>
                    Ask anything — I can help with tasks, code review, requirements analysis, and more.
                  </div>
                </div>
              )}

              {localMessages.map(msg => (
                <div key={msg.id}>
                  <div className={`${styles.msgRow} ${msg.role === 'user' ? styles.msgRowUser : ''}`}>
                    <div className={`${styles.msgAvatar} ${msg.role === 'bot' ? styles.msgAvatarBot : styles.msgAvatarUser}`}>
                      {msg.role === 'bot' ? '✦' : USER.initials.charAt(0)}
                    </div>
                    <div className={`${styles.msgBubble} ${msg.role === 'bot' ? styles.msgBubbleBot : styles.msgBubbleUser}`}>
                      {msg.text.split('\n').map((line, i) => (
                        <span key={i}>
                          {line.split(/(\*\*.*?\*\*)/).map((part, j) =>
                            part.startsWith('**') && part.endsWith('**')
                              ? <strong key={j}>{part.slice(2, -2)}</strong>
                              : part
                          )}
                          {i < msg.text.split('\n').length - 1 && <br />}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className={`${styles.msgTime} ${msg.role === 'user' ? styles.msgTimeRight : ''}`}>
                    {msg.time}
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className={styles.msgRow}>
                  <div className={`${styles.msgAvatar} ${styles.msgAvatarBot}`}>✦</div>
                  <div className={`${styles.msgBubble} ${styles.msgBubbleBot}`}>
                    <div className={styles.typingDots}>
                      <span className={styles.typingDot} />
                      <span className={styles.typingDot} />
                      <span className={styles.typingDot} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Suggestions (only for empty/new chats) */}
            {localMessages.length === 0 && (
              <div className={styles.suggestions}>
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    className={styles.suggestionChip}
                    onClick={() => { setInput(s); }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className={styles.inputArea}>
              <div className={styles.inputRow}>
                <textarea
                  className={styles.inputField}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask me anything..."
                  rows={1}
                />
                <button
                  className={styles.sendBtn}
                  onClick={handleSend}
                  disabled={!input.trim() || isTyping}
                  aria-label="Send"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
                  </svg>
                </button>
              </div>
              <div className={styles.sourceRow}>
                <button className={styles.sourceSelect}>
                  <span className={styles.sourceSelectDot} />
                  Select Source
                  <span className={styles.sourceChevron}>▾</span>
                </button>
                <button className={styles.upgradeLink}>
                  <span className={styles.upgradeDollar}>$</span>
                  Upgrade to Pro
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
