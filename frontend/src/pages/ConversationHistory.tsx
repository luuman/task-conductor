// frontend/src/pages/ConversationHistory.tsx
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { List, Plus, Bot as BotIcon, Download, ArrowDown } from "lucide-react";
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

  // 自动滚动到底部（新消息或流式输出时）
  const chatBottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chatMessages.length > 0 || currentReply || isGenerating) {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, currentReply, isGenerating]);

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

      {/* ── 中栏：对话内容 + 聊天输入 ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
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
            <ConvTranscript messages={transcript} loading={transcriptLoading} fileFound={fileFound} scrollRef={transcriptRef} autoExpand={autoExpand} />
          )}

          {/* 新对话已完成的消息 */}
          {isNewChat && chatMessages.length > 0 && (
            <ConvTranscript messages={chatMessages} loading={false} fileFound={true} scrollRef={transcriptRef} autoExpand={autoExpand} />
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
