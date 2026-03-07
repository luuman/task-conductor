// frontend/src/components/ConvEditPanel.tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type ClaudeSession, type ConversationNote, type Project } from "../lib/api";

interface Props {
  session: ClaudeSession;
  projects: Project[];
  onSaved: (updated: ConversationNote) => void;
}

export function ConvEditPanel({ session, projects: _projects, onSaved }: Props) {
  const { t } = useTranslation();
  const [alias, setAlias]         = useState(session.note?.alias  ?? "");
  const [notes, setNotes]         = useState(session.note?.notes  ?? "");
  const [tagInput, setTagInput]   = useState("");
  const [tags, setTags]           = useState<string[]>(session.note?.tags ?? []);
  const [linkedTaskId, setLinkedTaskId] = useState<number | null>(session.note?.linked_task_id ?? null);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);

  useEffect(() => {
    setAlias(session.note?.alias  ?? "");
    setNotes(session.note?.notes  ?? "");
    setTags(session.note?.tags    ?? []);
    setLinkedTaskId(session.note?.linked_task_id ?? null);
    setTagInput("");
    setSaved(false);
  }, [session.id]);

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput("");
  };

  const removeTag = (t: string) => setTags(prev => prev.filter(x => x !== t));

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await api.sessions.upsertNote(session.session_id, {
        alias: alias || null,
        notes: notes || null,
        tags,
        linked_task_id: linkedTaskId,
      });
      onSaved(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-4 py-3 space-y-3 text-[12px]"
         style={{ borderTop: "1px solid var(--border)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-widest"
         style={{ color: "var(--text-tertiary)" }}>{t('convEdit.sessionInfo')}</p>

      {/* 别名 */}
      <div className="space-y-1">
        <label className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{t('convEdit.alias')}</label>
        <input
          value={alias}
          onChange={e => setAlias(e.target.value)}
          placeholder={session.cwd.split("/").slice(-1)[0] || t('convEdit.aliasPlaceholder')}
          className="w-full rounded px-2.5 py-1.5 text-[11px] outline-none"
          style={{
            background: "var(--background-tertiary)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {/* 标签 */}
      <div className="space-y-1">
        <label className="text-[11px]" style={{ color: "var(--text-secondary)" }}>标签</label>
        <div className="flex flex-wrap gap-1 mb-1">
          {tags.map(t => (
            <span key={t}
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full cursor-pointer"
                  style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
                  onClick={() => removeTag(t)}>
              {t} <span className="opacity-60">×</span>
            </span>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addTag()}
            placeholder="输入标签后按 Enter"
            className="flex-1 rounded px-2.5 py-1.5 text-[11px] outline-none"
            style={{
              background: "var(--background-tertiary)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          />
          <button onClick={addTag}
                  className="px-2 py-1 rounded text-[11px]"
                  style={{ background: "var(--background-tertiary)", color: "var(--text-secondary)" }}>
            +
          </button>
        </div>
      </div>

      {/* 关联任务 */}
      <div className="space-y-1">
        <label className="text-[11px]" style={{ color: "var(--text-secondary)" }}>关联任务 ID</label>
        <input
          type="number"
          value={linkedTaskId ?? ""}
          onChange={e => setLinkedTaskId(e.target.value ? Number(e.target.value) : null)}
          placeholder="输入 Task ID（可选）"
          className="w-full rounded px-2.5 py-1.5 text-[11px] outline-none"
          style={{
            background: "var(--background-tertiary)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {/* 备注 */}
      <div className="space-y-1">
        <label className="text-[11px]" style={{ color: "var(--text-secondary)" }}>备注</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="自由文本备注..."
          rows={3}
          className="w-full rounded px-2.5 py-1.5 text-[11px] outline-none resize-none"
          style={{
            background: "var(--background-tertiary)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {/* 保存按钮 */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-1.5 rounded text-[12px] font-medium transition-colors disabled:opacity-50"
        style={{
          background: saved ? "rgba(34,197,94,0.2)" : "var(--accent)",
          color: saved ? "#22c55e" : "white",
        }}
      >
        {saving ? "保存中..." : saved ? "✓ 已保存" : "保存"}
      </button>
    </div>
  );
}
