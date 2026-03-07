// frontend/src/components/ConvSessionList.tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import type { ClaudeSession } from "../lib/api";

interface Props {
  sessions: ClaudeSession[];
  loading: boolean;
  selectedId: number | null;
  onSelect: (session: ClaudeSession) => void;
}

function cwdShort(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts.slice(-2).join("/") || path;
}

function StatusDot({ status }: { status: ClaudeSession["status"] }) {
  return (
    <span className={cn(
      "inline-block w-1.5 h-1.5 rounded-full shrink-0",
      status === "active"  ? "bg-green-400" :
      status === "idle"    ? "bg-yellow-400" : "bg-gray-500"
    )} />
  );
}

export function ConvSessionList({ sessions, loading, selectedId, onSelect }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? sessions.filter(s =>
        (s.note?.alias ?? "").toLowerCase().includes(search.toLowerCase()) ||
        s.cwd.toLowerCase().includes(search.toLowerCase()) ||
        (s.note?.tags ?? []).some(t => t.toLowerCase().includes(search.toLowerCase()))
      )
    : sessions;

  return (
    <div className="flex flex-col h-full">
      {/* 搜索框 */}
      <div className="px-3 py-2 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('convSession.search')}
          className="w-full text-[11px] font-mono rounded px-2.5 py-1.5 outline-none"
          style={{
            background: "var(--background-tertiary)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading ? (
          <div className="flex items-center justify-center h-20 text-[11px]"
               style={{ color: "var(--text-tertiary)" }}>{t('convSession.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 px-3 text-center"
               style={{ color: "var(--text-tertiary)" }}>
            <span className="text-2xl">💬</span>
            <p className="text-[11px]">{search ? t('convSession.noMatch') : t('convSession.noSessions')}</p>
          </div>
        ) : (
          filtered.map(s => {
            const active = selectedId === s.id;
            const displayName = s.note?.alias || cwdShort(s.cwd) || s.session_id.slice(0, 8);
            const tags = s.note?.tags ?? [];
            return (
              <button
                key={s.id}
                onClick={() => onSelect(s)}
                className="w-full px-3 py-2 text-left transition-colors border-l-2 hover:bg-white/[0.03]"
                style={{
                  borderLeftColor: active ? "var(--accent)" : "transparent",
                  background: active ? "var(--background-tertiary)" : undefined,
                }}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <StatusDot status={s.status} />
                  <span className="text-[12px] font-medium truncate flex-1"
                        style={{ color: "var(--text-primary)" }}>
                    {displayName}
                  </span>
                </div>

                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {tags.slice(0, 3).map(tag => (
                      <span key={tag}
                            className="text-[9px] px-1.5 py-0.5 rounded-full"
                            style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono truncate"
                        style={{ color: "var(--text-tertiary)" }}>
                    {s.session_id.slice(0, 8)}
                  </span>
                  <span className="text-[10px] shrink-0"
                        style={{ color: "var(--text-tertiary)" }}>
                    {s.event_count} 条
                  </span>
                </div>

                {s.note?.linked_task_id && (
                  <span className="text-[9px] mt-0.5 block"
                        style={{ color: "var(--accent)" }}>
                    → Task #{s.note.linked_task_id}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
