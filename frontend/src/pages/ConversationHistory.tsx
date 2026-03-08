// frontend/src/pages/ConversationHistory.tsx
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { List, Plus, Bot as BotIcon, Download, ArrowDown, X, FileText } from "lucide-react";
import hljs from "highlight.js/lib/core";
import "../styles/hljs-ayu-dark.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, type ClaudeSession, type TranscriptMessage, type Project } from "../lib/api";
import { ConvSessionList } from "../components/ConvSessionList";
import { ConvTranscript } from "../components/ConvTranscript";
import { ChatInput } from "../components/ChatInput";
import { useChatWs } from "../hooks/useChatWs";

interface Props {
  projects: Project[];
}

/** 简化版 Markdown 组件（用于流式回复气泡） */
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

/** 文件查看面板 */
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
      {/* 头部 */}
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
      {/* 代码内容 */}
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

export default function ConversationHistory({ projects }: Props) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const [selectedSession, setSelectedSession] = useState<ClaudeSession | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [fileFound, setFileFound] = useState(true);
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(-1);
  const [autoExpand, setAutoExpand] = useState(true);

  // 新对话模式
  const [isNewChat, setIsNewChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<TranscriptMessage[]>([]);

  // 文件查看面板
  const [viewingFile, setViewingFile] = useState<{ path: string; name: string; content: string } | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  const handleOpenFile = useCallback((filePath: string) => {
    setFileLoading(true);
    api.file.read(filePath)
      .then(r => {
        if (r.content != null) {
          setViewingFile({ path: r.path, name: r.name, content: r.content });
        } else {
          setViewingFile({ path: filePath, name: filePath.split("/").pop() || filePath, content: r.error || "无法读取文件" });
        }
        setFileLoading(false);
      })
      .catch(() => {
        setViewingFile({ path: filePath, name: filePath.split("/").pop() || filePath, content: "读取失败" });
        setFileLoading(false);
      });
  }, []);

  const transcriptRef = useRef<HTMLDivElement>(null);
  const transcriptCache = useRef<Map<string, { messages: TranscriptMessage[]; fileFound: boolean }>>(new Map());

  // Chat WebSocket
  const handleChatComplete = useCallback((fullText: string) => {
    setChatMessages(prev => [
      ...prev,
      {
        role: "assistant" as const,
        ts: new Date().toISOString(),
        blocks: [{ type: "text" as const, text: fullText }],
      },
    ]);
  }, []);

  const { send: chatSend, stop: chatStop, isGenerating, currentReply, error: chatError } = useChatWs(handleChatComplete);

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

  // 默认选中第一个会话
  const autoSelected = useRef(false);
  useEffect(() => {
    if (!autoSelected.current && sessions.length > 0 && !selectedSession && !isNewChat) {
      autoSelected.current = true;
      handleSelect(sessions[0]);
    }
  }, [sessions]);

  const handleSelect = (s: ClaudeSession) => {
    setIsNewChat(false);
    setSelectedSession(s);
    setChatMessages([]);
    setActiveQuestionIdx(-1);
    const cached = transcriptCache.current.get(s.session_id);
    if (cached) {
      setTranscript(cached.messages);
      setFileFound(cached.fileFound);
      setTranscriptLoading(false);
      return;
    }
    setTranscriptLoading(true);
    api.sessions.transcript(s.session_id)
      .then(r => {
        transcriptCache.current.set(s.session_id, { messages: r.messages, fileFound: r.file_found });
        setTranscript(r.messages);
        setFileFound(r.file_found);
        setTranscriptLoading(false);
      })
      .catch(() => { setTranscript([]); setFileFound(false); setTranscriptLoading(false); });
  };

  const handleNewChat = () => {
    setIsNewChat(true);
    setSelectedSession(null);
    setTranscript([]);
    setChatMessages([]);
    setTranscriptLoading(false);
    setFileFound(true);
  };

  // 导出对话为 Markdown
  const handleExport = useCallback(() => {
    const msgs = isNewChat ? chatMessages : [...transcript, ...chatMessages];
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
  }, [isNewChat, chatMessages, transcript]);

  const handleChatSend = (message: string, model: string, options?: import("../hooks/useChatWs").ChatOptions) => {
    // 追加用户消息
    setChatMessages(prev => [
      ...prev,
      {
        role: "user" as const,
        ts: new Date().toISOString(),
        blocks: [{ type: "text" as const, text: message }],
      },
    ]);
    chatSend(message, model, options);
  };

  // 滚动状态追踪
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const prevMsgCountRef = useRef(0);

  // 监听滚动位置
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
  }, [selectedSession, isNewChat]);

  // 新消息到达时：不滚动，仅标记有新消息
  const totalMsgCount = chatMessages.length + transcript.length;
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

  // 实时轮询：选中 active 会话时定时刷新 transcript
  // 更新前记录滚动锚点，更新后恢复，确保当前阅读位置不动
  const pendingScrollLock = useRef(false);
  const savedScrollTop = useRef(0);
  const savedScrollHeight = useRef(0);

  useEffect(() => {
    if (!selectedSession || selectedSession.status !== "active") return;
    const sid = selectedSession.session_id;
    const poll = () => {
      api.sessions.transcript(sid)
        .then(r => {
          const container = transcriptRef.current;
          if (container) {
            savedScrollTop.current = container.scrollTop;
            savedScrollHeight.current = container.scrollHeight;
            pendingScrollLock.current = true;
          }
          transcriptCache.current.set(sid, { messages: r.messages, fileFound: r.file_found });
          setTranscript(r.messages);
          setFileFound(r.file_found);
        })
        .catch(() => {});
    };
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [selectedSession]);

  // 渲染后恢复滚动位置：新内容追加在底部，scrollTop 不变即可保持当前位置
  useEffect(() => {
    if (!pendingScrollLock.current) return;
    pendingScrollLock.current = false;
    const container = transcriptRef.current;
    if (container) {
      container.scrollTop = savedScrollTop.current;
    }
  }, [transcript]);

  // 展示的消息：历史会话模式用 transcript，新对话模式用 chatMessages
  const displayMessages = isNewChat ? chatMessages : transcript;

  // 提取用户问题列表（带原始 index）
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

  // 跳转到对应问题
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

  const hasQuestions = questions.length > 0 && !transcriptLoading && fileFound && !isNewChat;

  return (
    <div className="flex-1 flex h-full overflow-hidden"
         style={{ background: "var(--background)" }}>

      {/* ── 左栏：会话列表 ── */}
      <div className="w-[260px] shrink-0 flex flex-col"
           style={{ borderRight: "1px solid var(--border)" }}>
        <div className="h-11 flex items-center px-3 shrink-0"
             style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-[11px] font-semibold flex-1"
                style={{ color: "var(--text-primary)" }}>{t('conversationHistory.header')}</span>
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors hover:brightness-125"
            style={{
              color: isNewChat ? "var(--accent)" : "var(--text-tertiary)",
              background: isNewChat ? "var(--accent-subtle)" : "transparent",
            }}
            title="新建对话"
          >
            <Plus size={12} />
            <span>新对话</span>
          </button>
        </div>
        <ConvSessionList
          sessions={sessions}
          loading={sessionsLoading}
          selectedId={isNewChat ? null : (selectedSession?.id ?? null)}
          onSelect={handleSelect}
        />
      </div>

      {/* ── 中栏：对话内容 + 聊天输入 + 文件查看 ── */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* 文件查看面板 */}
        {viewingFile && (
          <FileViewPanel file={viewingFile} onClose={() => setViewingFile(null)} />
        )}
        {fileLoading && (
          <div className="absolute inset-0 z-30 flex items-center justify-center"
               style={{ background: "rgba(0,0,0,0.5)" }}>
            <span className="text-[12px] font-mono" style={{ color: "var(--text-tertiary)" }}>加载中...</span>
          </div>
        )}
        {/* 对话内容 */}
        <div ref={transcriptRef} className="flex-1 overflow-y-auto">
          {/* 新对话欢迎页（无消息时） */}
          {isNewChat && chatMessages.length === 0 && !currentReply && (
            <div className="flex flex-col items-center justify-center h-full gap-3"
                 style={{ color: "var(--text-tertiary)" }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                   style={{ background: "var(--accent-subtle)", border: "1px solid rgba(68,119,255,0.15)" }}>
                <BotIcon size={20} style={{ color: "var(--accent)" }} />
              </div>
              <p className="text-[12px]">开始新对话</p>
              <p className="text-[10px] opacity-50">输入消息与 Claude 交流</p>
            </div>
          )}

          {/* 历史 transcript */}
          {!isNewChat && (
            <ConvTranscript messages={transcript} loading={transcriptLoading} fileFound={fileFound} scrollRef={transcriptRef} autoExpand={autoExpand} onOpenFile={handleOpenFile} />
          )}

          {/* 新对话已完成的消息 */}
          {isNewChat && chatMessages.length > 0 && (
            <ConvTranscript messages={chatMessages} loading={false} fileFound={true} scrollRef={transcriptRef} autoExpand={autoExpand} onOpenFile={handleOpenFile} />
          )}

          {/* 流式回复气泡（新对话 & 历史会话共用） */}
          {currentReply && (
            <div className="flex items-start gap-3 px-4 py-2 justify-start">
              <div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center mt-0.5"
                   style={{ background: "var(--accent-subtle)", border: "1px solid rgba(68,119,255,0.15)" }}>
                <BotIcon size={14} style={{ color: "var(--accent)" }} />
              </div>
              <div className="min-w-0 max-w-[85%] rounded-lg px-3.5 py-2.5"
                   style={{ background: "rgba(68,119,255,0.04)", border: "1px solid rgba(68,119,255,0.12)" }}>
                <div className="text-[12.5px] leading-relaxed" style={{ color: "var(--text-primary)" }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={streamMdComponents as any}>
                    {currentReply}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          )}

          {/* 生成中等待动画 */}
          {isGenerating && !currentReply && (
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
          {chatError && (
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
              {hasNewMessages && <span>新消息</span>}
            </button>
          </div>
        )}

        {/* 聊天输入框 */}
        <ChatInput
          onSend={handleChatSend}
          onStop={chatStop}
          isGenerating={isGenerating}
          onNewChat={handleNewChat}
          onExport={handleExport}
          onClear={() => { setChatMessages([]); }}
        />
      </div>

      {/* ── 右栏：问题导航 ── */}
      {hasQuestions && (
        <div className="w-[220px] shrink-0 flex flex-col overflow-hidden"
             style={{ borderLeft: "1px solid var(--border)" }}>
          <div className="h-11 flex items-center gap-1.5 px-3 shrink-0 text-[11px] font-medium"
               style={{ borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)" }}>
            <List size={12} />
            <span>问题导航</span>
            <span className="ml-auto flex items-center gap-1.5">
              <span className="text-[9px]">{autoExpand ? "展开" : "折叠"}</span>
              <button
                onClick={() => setAutoExpand(v => !v)}
                className="relative w-7 h-[16px] rounded-full transition-colors shrink-0"
                style={{ background: autoExpand ? "var(--accent)" : "var(--background-tertiary)", border: "1px solid var(--border)" }}
                title={autoExpand ? "切换为折叠模式" : "切换为展开模式"}
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
          {/* 底部导出按钮 */}
          <div className="shrink-0 px-2 py-2" style={{ borderTop: "1px solid var(--border)" }}>
            <button
              onClick={handleExport}
              className="w-full flex items-center justify-center gap-1.5 text-[10px] py-1.5 rounded-md transition-colors hover:brightness-125"
              style={{ color: "var(--text-tertiary)", background: "var(--background-tertiary)" }}
              title="导出为 Markdown"
            >
              <Download size={11} />
              <span>导出对话</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
