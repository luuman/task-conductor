// frontend/src/pages/ConversationHistory.tsx
import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { api, type ClaudeSession, type TranscriptMessage, type ConversationNote, type Project } from "../lib/api";
import { ConvSessionList } from "../components/ConvSessionList";
import { ConvTranscript } from "../components/ConvTranscript";
import { ConvEditPanel } from "../components/ConvEditPanel";

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

  // 缓存已加载的 transcript，避免重复请求
  const transcriptCache = useRef<Map<string, { messages: TranscriptMessage[]; fileFound: boolean }>>(new Map());

  // 加载会话列表（5s 轮询刷新状态）
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

  // 选中会话时加载 transcript（命中缓存则直接渲染，无需等待）
  const handleSelect = (s: ClaudeSession) => {
    setSelectedSession(s);
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

  // note 保存后更新会话列表中的 note 字段
  const handleNoteSaved = (updated: ConversationNote) => {
    if (!selectedSession) return;
    setSessions(prev => prev.map(s =>
      s.id === selectedSession.id ? { ...s, note: updated } : s
    ));
    setSelectedSession(prev => prev ? { ...prev, note: updated } : prev);
  };

  return (
    <div className="flex-1 flex h-full overflow-hidden"
         style={{ background: "var(--background)" }}>

      {/* ── 左栏：会话列表 ── */}
      <div className="w-[260px] shrink-0 flex flex-col"
           style={{ borderRight: "1px solid var(--border)" }}>
        {/* 标题 */}
        <div className="px-3 py-2.5 shrink-0"
             style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-[11px] font-semibold"
                style={{ color: "var(--text-primary)" }}>对话历史</span>
        </div>
        <ConvSessionList
          sessions={sessions}
          loading={sessionsLoading}
          selectedId={selectedSession?.id ?? null}
          onSelect={handleSelect}
        />
      </div>

      {/* ── 右栏：气泡 + 编辑面板 ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 头部：会话信息 */}
        {selectedSession && (
          <div className="px-4 py-2 shrink-0 flex items-center gap-3"
               style={{ borderBottom: "1px solid var(--border)", background: "var(--background-secondary)" }}>
            <span className="text-[12px] font-semibold"
                  style={{ color: "var(--text-primary)" }}>
              {selectedSession.note?.alias || selectedSession.cwd.split("/").slice(-1)[0] || selectedSession.session_id.slice(0, 8)}
            </span>
            <span className="text-[10px] font-mono"
                  style={{ color: "var(--text-tertiary)" }}>
              {selectedSession.session_id.slice(0, 16)}
            </span>
            <span className="text-[10px] ml-auto"
                  style={{ color: "var(--text-tertiary)" }}>
              {selectedSession.event_count} 条事件
            </span>
          </div>
        )}

        {/* 气泡区（可滚动） */}
        <div className="flex-1 overflow-y-auto">
          <ConvTranscript messages={transcript} loading={transcriptLoading} fileFound={fileFound} />
        </div>

        {/* 编辑面板（固定底部） */}
        {selectedSession && (
          <div className="shrink-0" style={{ maxHeight: "280px", overflowY: "auto" }}>
            <ConvEditPanel
              session={selectedSession}
              projects={projects}
              onSaved={handleNoteSaved}
            />
          </div>
        )}
      </div>
    </div>
  );
}
