// frontend/src/pages/ConversationHistory.tsx
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { List } from "lucide-react";
import { api, type ClaudeSession, type TranscriptMessage, type Project } from "../lib/api";
import { ConvSessionList } from "../components/ConvSessionList";
import { ConvTranscript } from "../components/ConvTranscript";

interface Props {
  projects: Project[];
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

  const transcriptRef = useRef<HTMLDivElement>(null);
  const transcriptCache = useRef<Map<string, { messages: TranscriptMessage[]; fileFound: boolean }>>(new Map());

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

  const handleSelect = (s: ClaudeSession) => {
    setSelectedSession(s);
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

  // 提取用户问题列表（带原始 index）
  const questions = useMemo(() => {
    const qs: { text: string; msgIndex: number }[] = [];
    transcript.forEach((msg, i) => {
      if (msg.role !== "user") return;
      const text = msg.blocks
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join(" ")
        .trim();
      if (text) qs.push({ text: text.slice(0, 200), msgIndex: i });
    });
    return qs;
  }, [transcript]);

  // 跳转到对应问题
  const jumpToQuestion = useCallback((qIdx: number, msgIndex: number) => {
    setActiveQuestionIdx(qIdx);
    const container = transcriptRef.current;
    if (!container) return;
    // 找到第 msgIndex 个消息 DOM
    const cards = container.querySelectorAll("[data-msg-index]");
    for (const card of cards) {
      if ((card as HTMLElement).dataset.msgIndex === String(msgIndex)) {
        card.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
  }, []);

  const hasQuestions = questions.length > 0 && !transcriptLoading && fileFound;

  return (
    <div className="flex-1 flex h-full overflow-hidden"
         style={{ background: "var(--background)" }}>

      {/* ── 左栏：会话列表 ── */}
      <div className="w-[260px] shrink-0 flex flex-col"
           style={{ borderRight: "1px solid var(--border)" }}>
        <div className="h-11 flex items-center px-3 shrink-0"
             style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-[11px] font-semibold"
                style={{ color: "var(--text-primary)" }}>{t('conversationHistory.header')}</span>
        </div>
        <ConvSessionList
          sessions={sessions}
          loading={sessionsLoading}
          selectedId={selectedSession?.id ?? null}
          onSelect={handleSelect}
        />
      </div>

      {/* ── 中栏：对话内容 ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div ref={transcriptRef} className="flex-1 overflow-y-auto">
          <ConvTranscript messages={transcript} loading={transcriptLoading} fileFound={fileFound} scrollRef={transcriptRef} autoExpand={autoExpand} />
        </div>
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
        </div>
      )}
    </div>
  );
}
