// frontend/src/pages/ConversationHistory.tsx
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  List, Plus, Bot as BotIcon, Download, ArrowDown, X, FileText,
  History, MessageSquare,
} from "lucide-react";
import hljs from "highlight.js/lib/core";
import "../styles/hljs-ayu-dark.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, type ClaudeSession, type TranscriptMessage, type Project } from "../lib/api";
import { ConvTranscript } from "../components/ConvTranscript";
import { ChatInput } from "../components/ChatInput";
import { useChatWs } from "../hooks/useChatWs";

// ── 类型 ────────────────────────────────────────────────────────

interface Props {
  projects: Project[];
}

interface ChatTab {
  id: string;
  type: "new" | "history";
  title: string;
  session?: ClaudeSession;
  chatMessages: TranscriptMessage[];
  transcript: TranscriptMessage[];
  transcriptLoaded: boolean;
  fileFound: boolean;
}

// ── 工具函数 ────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function createNewTab(): ChatTab {
  return {
    id: uid(),
    type: "new",
    title: "新对话",
    chatMessages: [],
    transcript: [],
    transcriptLoaded: true,
    fileFound: true,
  };
}

// ── Markdown 组件（流式回复） ────────────────────────────────────

const streamMdComponents = {
  p:      ({ children }: { children?: React.ReactNode }) => <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
  code:   ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    if (className?.includes("language-")) {
      return (
        <code className="block text-[11px] font-mono px-3 py-2 rounded-md my-1.5 overflow-x-auto whitespace-pre"
              style={{ background: "var(--background)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
          {children}
        </code>
      );
    }
    return (
      <code className="text-[11px] font-mono px-1 py-0.5 rounded"
            style={{ background: "var(--background-tertiary)", color: "var(--accent)" }}>
        {children}
      </code>
    );
  },
  pre: ({ children }: { children?: React.ReactNode }) => <pre className="my-1 overflow-x-auto">{children}</pre>,
};

function guessLang(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rs: "rust", go: "go", java: "java",
    sh: "bash", zsh: "bash", bash: "bash",
    css: "css", html: "xml", xml: "xml", svg: "xml",
    json: "json", yaml: "yaml", yml: "yaml", md: "markdown",
    sql: "sql", c: "c", cpp: "cpp", h: "c", hpp: "cpp",
  };
  return map[ext] || "";
}

// ── 文件查看面板 ────────────────────────────────────────────────

function FileViewPanel({ file, onClose }: { file: { path: string; name: string; content: string }; onClose: () => void }) {
  const lang = guessLang(file.path);
  const highlighted = useMemo(() => {
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(file.content, { language: lang }).value;
      }
      return hljs.highlightAuto(file.content).value;
    } catch {
      return null;
    }
  }, [file.content, lang]);

  return (
    <div className="absolute inset-0 z-20 flex flex-col"
         style={{ background: "var(--background)" }}>
      <div className="flex items-center gap-2 px-4 py-2.5 shrink-0"
           style={{ borderBottom: "1px solid var(--border)", background: "var(--background-secondary)" }}>
        <FileText size={14} style={{ color: "var(--accent)" }} />
        <span className="text-[12px] font-mono flex-1 truncate"
              style={{ color: "var(--text-primary)" }} title={file.path}>
          {file.path}
        </span>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-md transition-colors hover:bg-white/[0.06]"
          style={{ color: "var(--text-tertiary)" }}
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {highlighted ? (
          <pre className="hljs px-4 py-3 text-[11px] font-mono leading-[1.7]"
               style={{ margin: 0, background: "var(--background)" }}
               dangerouslySetInnerHTML={{ __html: highlighted }} />
        ) : (
          <pre className="px-4 py-3 text-[11px] font-mono whitespace-pre-wrap break-words leading-[1.7]"
               style={{ color: "var(--text-secondary)", margin: 0, background: "var(--background)" }}>
            {file.content}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── Tab 标签项 ──────────────────────────────────────────────────

function TabItem({ tab, active, generating, onSelect, onClose, closable }: {
  tab: ChatTab;
  active: boolean;
  generating: boolean;
  onSelect: () => void;
  onClose: () => void;
  closable: boolean;
}) {
  return (
    <div
      onClick={onSelect}
      className="group relative flex items-center gap-1.5 px-3 h-8 cursor-pointer shrink-0 select-none transition-colors"
      style={{
        background: active ? "var(--background)" : "transparent",
        borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
        color: active ? "var(--text-primary)" : "var(--text-tertiary)",
      }}
    >
      {generating && (
        <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: "var(--accent)" }} />
      )}
      {tab.type === "history" && !generating && (
        <MessageSquare size={11} className="shrink-0 opacity-50" />
      )}
      <span className="text-[11px] font-medium truncate max-w-[120px]">
        {tab.title}
      </span>
      {closable && (
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0"
          style={{ color: "var(--text-tertiary)" }}
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}

// ── 历史会话下拉 ────────────────────────────────────────────────

function HistoryDropdown({ sessions, loading, onSelect }: {
  sessions: ClaudeSession[];
  loading: boolean;
  onSelect: (s: ClaudeSession) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.toLowerCase();
    return sessions.filter(s =>
      (s.note?.alias ?? "").toLowerCase().includes(q) ||
      (s.summary ?? "").toLowerCase().includes(q) ||
      s.cwd.toLowerCase().includes(q)
    );
  }, [sessions, search]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(!open); setSearch(""); }}
        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md transition-colors hover:brightness-125"
        style={{
          color: open ? "var(--accent)" : "var(--text-tertiary)",
          background: open ? "var(--accent-subtle)" : "transparent",
        }}
        title="历史会话"
      >
        <History size={13} />
        <span>历史</span>
      </button>

      {open && (
        <div
          className="absolute top-full right-0 mt-1 w-[320px] max-h-[420px] rounded-lg shadow-xl overflow-hidden z-50 flex flex-col"
          style={{ background: "var(--background)", border: "1px solid var(--border)" }}
        >
          {/* 搜索 */}
          <div className="px-3 py-2 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索会话..."
              autoFocus
              className="w-full text-[11px] font-mono rounded px-2.5 py-1.5 outline-none"
              style={{
                background: "var(--background-tertiary)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          {/* 会话列表 */}
          <div className="flex-1 overflow-y-auto py-1">
            {loading ? (
              <div className="flex items-center justify-center h-20 text-[11px]"
                   style={{ color: "var(--text-tertiary)" }}>加载中...</div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-[11px]"
                   style={{ color: "var(--text-tertiary)" }}>
                {search ? "无匹配结果" : "暂无历史会话"}
              </div>
            ) : (
              filtered.map(s => (
                <button
                  key={s.id}
                  onClick={() => { onSelect(s); setOpen(false); }}
                  className="w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.04]"
                >
                  <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${
                    s.status === "active" ? "bg-green-400" :
                    s.status === "idle" ? "bg-yellow-400" : "bg-gray-500"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium truncate"
                         style={{ color: "var(--text-primary)" }}>
                      {s.note?.alias || s.summary || s.session_id.slice(0, 8)}
                    </div>
                    <div className="text-[9px] truncate"
                         style={{ color: "var(--text-tertiary)" }}>
                      {s.cwd.split("/").pop()} · {s.event_count} 事件
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 主组件 ──────────────────────────────────────────────────────

export default function ConversationHistory({ projects: _projects }: Props) {
  const { t } = useTranslation();

  // ── Tab 状态 ──
  const [tabs, setTabs] = useState<ChatTab[]>(() => [createNewTab()]);
  const [activeTabId, setActiveTabId] = useState(() => tabs[0].id);

  // ── 历史会话列表（供下拉选择） ──
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  // ── 文件查看 ──
  const [viewingFile, setViewingFile] = useState<{ path: string; name: string; content: string } | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  // ── 右栏展开/折叠 ──
  const [autoExpand, setAutoExpand] = useState(true);

  // ── 滚动状态 ──
  const transcriptRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const prevMsgCountRef = useRef(0);

  // ── 活跃 Tab ──
  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId)!, [tabs, activeTabId]);
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

  // ── 生成状态追踪（跨 Tab） ──
  const [generatingTabId, setGeneratingTabId] = useState<string | null>(null);
  const generatingTabIdRef = useRef<string | null>(null);

  // ── Chat WebSocket ──
  const handleChatComplete = useCallback((fullText: string) => {
    const tabId = generatingTabIdRef.current || activeTabIdRef.current;
    generatingTabIdRef.current = null;
    setGeneratingTabId(null);
    setTabs(prev => prev.map(t => t.id === tabId ? {
      ...t,
      chatMessages: [...t.chatMessages, {
        role: "assistant" as const,
        ts: new Date().toISOString(),
        blocks: [{ type: "text" as const, text: fullText }],
      }],
    } : t));
  }, []);

  const { send: chatSend, stop: chatStop, isGenerating, currentReply, error: chatError } = useChatWs(handleChatComplete);

  // ── 会话列表轮询 ──
  const loadSessions = useCallback(() => {
    api.sessions.list()
      .then(s => { setSessions(s); setSessionsLoading(false); })
      .catch(() => setSessionsLoading(false));
  }, []);

  useEffect(() => {
    loadSessions();
    const id = setInterval(loadSessions, 5000);
    return () => clearInterval(id);
  }, [loadSessions]);

  // ── 文件打开 ──
  const handleOpenFile = useCallback((filePath: string) => {
    setFileLoading(true);
    api.file.read(filePath)
      .then(r => {
        if (r.content != null) {
          setViewingFile({ path: r.path, name: r.name, content: r.content });
        } else {
          setViewingFile({ path: filePath, name: filePath.split("/").pop() || filePath, content: r.error || t('conversationHistory.fileReadFail') });
        }
        setFileLoading(false);
      })
      .catch(() => {
        setViewingFile({ path: filePath, name: filePath.split("/").pop() || filePath, content: t('conversationHistory.fileReadError') });
        setFileLoading(false);
      });
  }, [t]);

  // ── Tab 操作 ──
  const handleNewTab = useCallback(() => {
    const tab = createNewTab();
    setTabs(prev => [...prev, tab]);
    setActiveTabId(tab.id);
  }, []);

  const handleOpenHistory = useCallback((session: ClaudeSession) => {
    // 如果已打开则直接切换
    const existing = tabs.find(t => t.session?.session_id === session.session_id);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }

    const tab: ChatTab = {
      id: uid(),
      type: "history",
      title: session.note?.alias || session.summary || session.session_id.slice(0, 8),
      session,
      chatMessages: [],
      transcript: [],
      transcriptLoaded: false,
      fileFound: true,
    };
    setTabs(prev => [...prev, tab]);
    setActiveTabId(tab.id);

    // 加载 transcript
    api.sessions.transcript(session.session_id)
      .then(r => {
        setTabs(prev => prev.map(t => t.id === tab.id ? {
          ...t,
          transcript: r.messages,
          fileFound: r.file_found,
          transcriptLoaded: true,
        } : t));
      })
      .catch(() => {
        setTabs(prev => prev.map(t => t.id === tab.id ? {
          ...t,
          transcript: [],
          fileFound: false,
          transcriptLoaded: true,
        } : t));
      });
  }, [tabs]);

  const handleCloseTab = useCallback((tabId: string) => {
    setTabs(prev => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex(t => t.id === tabId);
      const filtered = prev.filter(t => t.id !== tabId);
      if (tabId === activeTabId) {
        const newActive = filtered[Math.min(idx, filtered.length - 1)] || filtered[0];
        setActiveTabId(newActive.id);
      }
      return filtered;
    });
  }, [activeTabId]);

  // ── 发送消息 ──
  const handleChatSend = (message: string, model: string, options?: import("../hooks/useChatWs").ChatOptions) => {
    generatingTabIdRef.current = activeTabId;
    setGeneratingTabId(activeTabId);

    setTabs(prev => prev.map(t => t.id === activeTabId ? {
      ...t,
      chatMessages: [...t.chatMessages, {
        role: "user" as const,
        ts: new Date().toISOString(),
        blocks: [{ type: "text" as const, text: message }],
      }],
      // 首条消息时更新 Tab 标题
      title: t.chatMessages.length === 0 && t.type === "new"
        ? message.slice(0, 30) + (message.length > 30 ? "..." : "")
        : t.title,
    } : t));

    chatSend(message, model, options);
  };

  // ── 导出 ──
  const handleExport = useCallback(() => {
    const msgs = activeTab.type === "new"
      ? activeTab.chatMessages
      : [...activeTab.transcript, ...activeTab.chatMessages];
    if (msgs.length === 0) return;
    const lines: string[] = [];
    msgs.forEach(msg => {
      const role = msg.role === "user" ? "User" : "Assistant";
      lines.push(`## ${role}\n`);
      msg.blocks.forEach(b => {
        if (b.type === "text" && b.text) lines.push(b.text);
        if (b.type === "tool_use" && b.tool_name) lines.push(`> Tool: ${b.tool_name}`);
      });
      lines.push("");
    });
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeTab]);

  // ── 清空当前 Tab ──
  const handleClear = useCallback(() => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, chatMessages: [] } : t));
  }, [activeTabId]);

  // ── 滚动监听 ──
  useEffect(() => {
    const container = transcriptRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const atBottom = scrollHeight - scrollTop - clientHeight < 60;
      setIsAtBottom(atBottom);
      if (atBottom) setHasNewMessages(false);
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [activeTabId]);

  // 新消息提示
  const displayMessages = activeTab.type === "new"
    ? activeTab.chatMessages
    : [...activeTab.transcript, ...activeTab.chatMessages];
  const totalMsgCount = displayMessages.length;

  useEffect(() => {
    if (totalMsgCount <= prevMsgCountRef.current) {
      prevMsgCountRef.current = totalMsgCount;
      return;
    }
    prevMsgCountRef.current = totalMsgCount;
    if (!isAtBottom) {
      setHasNewMessages(true);
    }
  }, [totalMsgCount, isAtBottom]);

  const scrollToBottom = useCallback(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setHasNewMessages(false);
  }, []);

  // ── 实时轮询：活跃历史会话 ──
  const pendingScrollLock = useRef(false);
  const savedScrollTop = useRef(0);

  useEffect(() => {
    if (activeTab.type !== "history" || !activeTab.session || activeTab.session.status !== "active") return;
    const sid = activeTab.session.session_id;
    const tabId = activeTab.id;
    const poll = () => {
      api.sessions.transcript(sid)
        .then(r => {
          const container = transcriptRef.current;
          if (container) {
            savedScrollTop.current = container.scrollTop;
            pendingScrollLock.current = true;
          }
          setTabs(prev => prev.map(t => t.id === tabId ? {
            ...t,
            transcript: r.messages,
            fileFound: r.file_found,
          } : t));
        })
        .catch(() => {});
    };
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [activeTab.id, activeTab.type, activeTab.session?.session_id, activeTab.session?.status]);

  // 恢复滚动位置
  useEffect(() => {
    if (!pendingScrollLock.current) return;
    pendingScrollLock.current = false;
    const container = transcriptRef.current;
    if (container) {
      container.scrollTop = savedScrollTop.current;
    }
  }, [activeTab.transcript]);

  // 是否在当前 Tab 显示流式内容
  const showStreamingHere = generatingTabId === activeTabId;

  // ── 问题导航 ──
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(-1);

  const questions = useMemo(() => {
    const qs: { text: string; msgIndex: number }[] = [];
    displayMessages.forEach((msg, i) => {
      if (msg.role !== "user") return;
      const text = msg.blocks
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join(" ")
        .trim();
      if (text) qs.push({ text: text.slice(0, 200), msgIndex: i });
    });
    return qs;
  }, [displayMessages]);

  const jumpToQuestion = useCallback((qIdx: number, msgIndex: number) => {
    setActiveQuestionIdx(qIdx);
    const container = transcriptRef.current;
    if (!container) return;
    const cards = container.querySelectorAll("[data-msg-index]");
    for (const card of cards) {
      if ((card as HTMLElement).dataset.msgIndex === String(msgIndex)) {
        card.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
  }, []);

  const hasQuestions = questions.length > 0 && activeTab.type === "history" && activeTab.transcriptLoaded && activeTab.fileFound;

  // ── 渲染 ──
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden"
         style={{ background: "var(--background)" }}>

      {/* ── 顶部 Tab 栏 ── */}
      <div
        className="flex items-center h-10 px-2 shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--background-secondary)" }}
      >
        {/* 可滚动的 Tab 列表 */}
        <div className="flex-1 flex items-center gap-0.5 overflow-x-auto no-scrollbar">
          {tabs.map(tab => (
            <TabItem
              key={tab.id}
              tab={tab}
              active={tab.id === activeTabId}
              generating={generatingTabId === tab.id && isGenerating}
              onSelect={() => setActiveTabId(tab.id)}
              onClose={() => handleCloseTab(tab.id)}
              closable={tabs.length > 1}
            />
          ))}
        </div>

        {/* 右侧按钮 */}
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            onClick={handleNewTab}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md transition-colors hover:brightness-125"
            style={{ color: "var(--text-tertiary)", background: "transparent" }}
            title="新建会话"
          >
            <Plus size={13} />
            <span>新建</span>
          </button>
          <HistoryDropdown
            sessions={sessions}
            loading={sessionsLoading}
            onSelect={handleOpenHistory}
          />
        </div>
      </div>

      {/* ── 内容区 ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* 中栏：对话内容 + 输入框 */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* 文件查看 */}
          {viewingFile && (
            <FileViewPanel file={viewingFile} onClose={() => setViewingFile(null)} />
          )}
          {fileLoading && (
            <div className="absolute inset-0 z-30 flex items-center justify-center"
                 style={{ background: "rgba(0,0,0,0.5)" }}>
              <span className="text-[12px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                {t('conversationHistory.loading')}
              </span>
            </div>
          )}

          {/* 对话区域 */}
          <div ref={transcriptRef} className="flex-1 overflow-y-auto">

            {/* 新对话欢迎页 */}
            {activeTab.type === "new" && activeTab.chatMessages.length === 0 && !currentReply && (
              <div className="flex flex-col items-center justify-center h-full gap-3"
                   style={{ color: "var(--text-tertiary)" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                     style={{ background: "var(--accent-subtle)", border: "1px solid rgba(68,119,255,0.15)" }}>
                  <BotIcon size={20} style={{ color: "var(--accent)" }} />
                </div>
                <p className="text-[12px]">{t('conversationHistory.startNewChat')}</p>
                <p className="text-[10px] opacity-50">{t('conversationHistory.startNewChatHint')}</p>
              </div>
            )}

            {/* 历史 transcript（未加载时显示骨架屏） */}
            {activeTab.type === "history" && !activeTab.transcriptLoaded && (
              <div className="flex items-center justify-center h-32 text-[11px]"
                   style={{ color: "var(--text-tertiary)" }}>
                {t('conversationHistory.loading')}
              </div>
            )}

            {/* 历史 transcript */}
            {activeTab.type === "history" && activeTab.transcriptLoaded && (
              <ConvTranscript
                messages={activeTab.transcript}
                loading={false}
                fileFound={activeTab.fileFound}
                scrollRef={transcriptRef}
                autoExpand={autoExpand}
                onOpenFile={handleOpenFile}
              />
            )}

            {/* 新对话 / 历史会话的追加消息 */}
            {activeTab.chatMessages.length > 0 && (
              <ConvTranscript
                messages={activeTab.chatMessages}
                loading={false}
                fileFound={true}
                scrollRef={transcriptRef}
                autoExpand={autoExpand}
                onOpenFile={handleOpenFile}
              />
            )}

            {/* 流式回复气泡 */}
            {showStreamingHere && currentReply && (
              <div className="flex items-start gap-3 px-4 py-2 justify-start">
                <div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center mt-0.5"
                     style={{ background: "var(--accent-subtle)", border: "1px solid rgba(68,119,255,0.15)" }}>
                  <BotIcon size={14} style={{ color: "var(--accent)" }} />
                </div>
                <div className="min-w-0 max-w-[85%] rounded-lg px-3.5 py-2.5 overflow-hidden"
                     style={{ background: "rgba(68,119,255,0.04)", border: "1px solid rgba(68,119,255,0.12)" }}>
                  <div className="text-[12.5px] leading-relaxed" style={{ color: "var(--text-primary)", overflowWrap: "break-word", wordBreak: "break-word" }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={streamMdComponents as any}>
                      {currentReply}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            )}

            {/* 生成等待动画 */}
            {showStreamingHere && isGenerating && !currentReply && (
              <div className="flex items-start gap-3 px-4 py-2 justify-start">
                <div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center mt-0.5"
                     style={{ background: "var(--accent-subtle)", border: "1px solid rgba(68,119,255,0.15)" }}>
                  <BotIcon size={14} style={{ color: "var(--accent)" }} />
                </div>
                <div className="min-w-0 rounded-lg px-3.5 py-2.5"
                     style={{ background: "rgba(68,119,255,0.04)", border: "1px solid rgba(68,119,255,0.12)" }}>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--accent)" }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--accent)", animationDelay: "0.2s" }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--accent)", animationDelay: "0.4s" }} />
                  </div>
                </div>
              </div>
            )}

            {/* 错误提示 */}
            {chatError && showStreamingHere && (
              <div className="px-4 py-2">
                <div className="text-[11px] px-3 py-2 rounded-lg"
                     style={{ color: "var(--danger)", background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)" }}>
                  {chatError}
                </div>
              </div>
            )}

            <div ref={chatBottomRef} />
          </div>

          {/* 回到最新按钮 */}
          {!isAtBottom && (
            <div className="absolute bottom-16 right-6 z-10">
              <button
                onClick={scrollToBottom}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono shadow-lg transition-all hover:scale-105"
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                }}
              >
                <ArrowDown size={13} />
                {hasNewMessages && <span>{t('conversationHistory.newMessages')}</span>}
              </button>
            </div>
          )}

          {/* 聊天输入框 */}
          <ChatInput
            onSend={handleChatSend}
            onStop={chatStop}
            isGenerating={showStreamingHere && isGenerating}
            onNewChat={handleNewTab}
            onExport={handleExport}
            onClear={handleClear}
          />
        </div>

        {/* ── 右栏：问题导航 ── */}
        {hasQuestions && (
          <div className="w-[220px] shrink-0 flex flex-col overflow-hidden"
               style={{ borderLeft: "1px solid var(--border)" }}>
            <div className="h-11 flex items-center gap-1.5 px-3 shrink-0 text-[11px] font-medium"
                 style={{ borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)" }}>
              <List size={12} />
              <span>{t('conversationHistory.questionNav')}</span>
              <span className="ml-auto flex items-center gap-1.5">
                <span className="text-[9px]">{autoExpand ? t('conversationHistory.expandMode') : t('conversationHistory.collapseMode')}</span>
                <button
                  onClick={() => setAutoExpand(v => !v)}
                  className="relative w-7 h-[16px] rounded-full transition-colors shrink-0"
                  style={{ background: autoExpand ? "var(--accent)" : "var(--background-tertiary)", border: "1px solid var(--border)" }}
                  title={autoExpand ? t('conversationHistory.switchToCollapse') : t('conversationHistory.switchToExpand')}
                >
                  <span className="absolute top-[2px] w-2.5 h-2.5 rounded-full transition-all"
                        style={{
                          left: autoExpand ? "calc(100% - 12px)" : "2px",
                          background: autoExpand ? "#fff" : "var(--text-tertiary)",
                        }} />
                </button>
              </span>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {questions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => jumpToQuestion(i, q.msgIndex)}
                  className="w-full text-left px-3 py-1.5 text-[11px] leading-snug rounded-sm transition-colors group"
                  style={{
                    color: activeQuestionIdx === i ? "var(--accent)" : "var(--text-secondary)",
                    background: activeQuestionIdx === i ? "var(--accent-subtle)" : "transparent",
                  }}
                >
                  <div className="flex items-start gap-1.5">
                    <span className="shrink-0 text-[9px] font-mono tabular-nums mt-[2px] w-4 text-right"
                          style={{ color: activeQuestionIdx === i ? "var(--accent)" : "var(--text-tertiary)" }}>
                      {i + 1}
                    </span>
                    <span className="line-clamp-2 group-hover:text-[var(--text-primary)] transition-colors">
                      {q.text}
                    </span>
                  </div>
                </button>
              ))}
            </div>
            <div className="shrink-0 px-2 py-2" style={{ borderTop: "1px solid var(--border)" }}>
              <button
                onClick={handleExport}
                className="w-full flex items-center justify-center gap-1.5 text-[10px] py-1.5 rounded-md transition-colors hover:brightness-125"
                style={{ color: "var(--text-tertiary)", background: "var(--background-tertiary)" }}
                title={t('conversationHistory.exportAsMarkdown')}
              >
                <Download size={11} />
                <span>{t('conversationHistory.exportChat')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
