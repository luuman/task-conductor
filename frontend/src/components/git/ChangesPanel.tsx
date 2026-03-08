import { useState, useEffect, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  PlusCircle,
  MinusCircle,
  Undo2,
  GitCommit,
  Upload,
  Download,
  RefreshCw,
} from "lucide-react";
import { api, type GitStatus, type GitFileEntry } from "../../lib/api";

interface ChangesPanelProps {
  projectId: number;
  onSelectFile: (path: string, staged: boolean) => void;
  selectedFile: string | null;
  onRefresh: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  modified: "#e6b450",
  added: "#7fd962",
  deleted: "#d95757",
  untracked: "#636d77",
  renamed: "#59c2ff",
  changed: "#e6b450",
};

const STATUS_LABELS: Record<string, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  untracked: "U",
  renamed: "R",
  changed: "M",
};

function fileName(path: string): string {
  return path.split("/").pop() || path;
}

function fileDir(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") + "/" : "";
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || "#636d77";
  const label = STATUS_LABELS[status] || "?";
  return (
    <span
      style={{
        color,
        fontSize: 11,
        fontWeight: 600,
        width: 16,
        textAlign: "center",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

interface SectionProps {
  title: string;
  count: number;
  defaultOpen?: boolean;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}

function Section({ title, count, defaultOpen = true, headerAction, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <div style={{ marginBottom: 2 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "4px 8px",
          cursor: "pointer",
          userSelect: "none",
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          color: "var(--text-secondary)",
          letterSpacing: "0.5px",
        }}
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span style={{ marginLeft: 4, flex: 1 }}>
          {title} ({count})
        </span>
        {headerAction && (
          <span onClick={(e) => e.stopPropagation()}>{headerAction}</span>
        )}
      </div>
      {open && children}
    </div>
  );
}

interface FileRowProps {
  entry: GitFileEntry;
  selected: boolean;
  onClick: () => void;
  actions: React.ReactNode;
}

function FileRow({ entry, selected, onClick, actions }: FileRowProps) {
  const dir = fileDir(entry.path);
  const name = fileName(entry.path);
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px 2px 24px",
        cursor: "pointer",
        fontSize: 12.5,
        background: selected ? "rgba(255,255,255,0.06)" : "transparent",
        color: "var(--text-primary)",
      }}
      className="hover:bg-white/[0.04] group"
    >
      <StatusBadge status={entry.status} />
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>{dir}</span>
        {name}
      </span>
      <span
        style={{ display: "flex", gap: 2, opacity: 0 }}
        className="group-hover:!opacity-100"
      >
        {actions}
      </span>
    </div>
  );
}

function IconBtn({
  onClick,
  title,
  children,
}: {
  onClick: (e: React.MouseEvent) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      title={title}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 2,
        color: "var(--text-secondary)",
        display: "flex",
        alignItems: "center",
      }}
      className="hover:!text-[var(--text-primary)]"
    >
      {children}
    </button>
  );
}

function HeaderActionBtn({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        fontSize: 10,
        color: "var(--text-tertiary)",
        padding: "1px 4px",
        borderRadius: 3,
      }}
      className="hover:!text-[var(--text-secondary)] hover:bg-white/[0.06]"
    >
      {label}
    </button>
  );
}

export default function ChangesPanel({
  projectId,
  onSelectFile,
  selectedFile,
  onRefresh,
}: ChangesPanelProps) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commitMsg, setCommitMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await api.git.status(projectId);
      setStatus(s);
    } catch {
      // ignore
    }
  }, [projectId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const mutate = useCallback(
    async (fn: () => Promise<unknown>) => {
      setLoading(true);
      try {
        await fn();
        await fetchStatus();
        onRefresh();
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [fetchStatus, onRefresh],
  );

  const stageFile = (path: string) => mutate(() => api.git.stage(projectId, { files: [path] }));
  const unstageFile = (path: string) => mutate(() => api.git.unstage(projectId, { files: [path] }));
  const discardFile = (path: string) => {
    if (!confirm("确定丢弃此文件的更改？")) return;
    mutate(() => api.git.discard(projectId, { files: [path] }));
  };
  const stageAll = (files: GitFileEntry[]) =>
    mutate(() => api.git.stage(projectId, { files: files.map((f) => f.path) }));
  const unstageAll = () => mutate(() => api.git.unstage(projectId, { all: true }));

  const doCommit = () => {
    if (!commitMsg.trim() || !status?.staged.length) return;
    mutate(async () => {
      await api.git.commit(projectId, { message: commitMsg.trim() });
      setCommitMsg("");
    });
  };

  const doPush = () => mutate(() => api.git.push(projectId));
  const doPull = () => mutate(() => api.git.pull(projectId));
  const doFetch = () => mutate(() => api.git.fetch(projectId));

  if (!status) {
    return (
      <div style={{ padding: 16, color: "var(--text-tertiary)", fontSize: 12 }}>
        Loading...
      </div>
    );
  }

  const totalChanges =
    status.staged.length + status.unstaged.length + status.untracked.length;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontSize: 12,
        color: "var(--text-primary)",
      }}
    >
      {/* File sections */}
      <div style={{ flex: 1, overflowY: "auto", paddingTop: 4 }}>
        {totalChanges === 0 && (
          <div style={{ padding: 16, color: "var(--text-tertiary)", textAlign: "center" }}>
            No changes
          </div>
        )}

        {/* Staged */}
        <Section
          title="Staged Changes"
          count={status.staged.length}
          headerAction={
            <HeaderActionBtn onClick={unstageAll} label="Unstage All" />
          }
        >
          {status.staged.map((f) => (
            <FileRow
              key={f.path}
              entry={f}
              selected={selectedFile === f.path}
              onClick={() => onSelectFile(f.path, true)}
              actions={
                <IconBtn onClick={() => unstageFile(f.path)} title="Unstage">
                  <MinusCircle size={14} />
                </IconBtn>
              }
            />
          ))}
        </Section>

        {/* Unstaged */}
        <Section
          title="Changes"
          count={status.unstaged.length}
          headerAction={
            <HeaderActionBtn
              onClick={() => stageAll(status.unstaged)}
              label="Stage All"
            />
          }
        >
          {status.unstaged.map((f) => (
            <FileRow
              key={f.path}
              entry={f}
              selected={selectedFile === f.path}
              onClick={() => onSelectFile(f.path, false)}
              actions={
                <>
                  <IconBtn onClick={() => stageFile(f.path)} title="Stage">
                    <PlusCircle size={14} />
                  </IconBtn>
                  <IconBtn onClick={() => discardFile(f.path)} title="Discard">
                    <Undo2 size={14} />
                  </IconBtn>
                </>
              }
            />
          ))}
        </Section>

        {/* Untracked */}
        <Section
          title="Untracked"
          count={status.untracked.length}
          headerAction={
            <HeaderActionBtn
              onClick={() => stageAll(status.untracked)}
              label="Stage All"
            />
          }
        >
          {status.untracked.map((f) => (
            <FileRow
              key={f.path}
              entry={f}
              selected={selectedFile === f.path}
              onClick={() => onSelectFile(f.path, false)}
              actions={
                <IconBtn onClick={() => stageFile(f.path)} title="Stage">
                  <PlusCircle size={14} />
                </IconBtn>
              }
            />
          ))}
        </Section>
      </div>

      {/* Bottom commit area */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: 8,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {/* Branch */}
        {status.branch && (
          <div
            style={{
              fontSize: 11,
              color: "var(--text-tertiary)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <GitCommit size={12} />
            <span>{status.branch}</span>
          </div>
        )}

        {/* Commit message */}
        <textarea
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              doCommit();
            }
          }}
          placeholder="Commit message..."
          rows={3}
          style={{
            width: "100%",
            resize: "vertical",
            background: "var(--background-tertiary)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "6px 8px",
            fontSize: 12,
            color: "var(--text-primary)",
            outline: "none",
            fontFamily: "inherit",
          }}
        />

        {/* Commit button */}
        <button
          onClick={doCommit}
          disabled={loading || !commitMsg.trim() || !status.staged.length}
          style={{
            width: "100%",
            padding: "5px 0",
            fontSize: 12,
            fontWeight: 600,
            border: "none",
            borderRadius: 4,
            cursor:
              loading || !commitMsg.trim() || !status.staged.length
                ? "not-allowed"
                : "pointer",
            background:
              !commitMsg.trim() || !status.staged.length
                ? "var(--background-tertiary)"
                : "var(--accent)",
            color:
              !commitMsg.trim() || !status.staged.length
                ? "var(--text-tertiary)"
                : "#fff",
            opacity: loading ? 0.6 : 1,
          }}
        >
          Commit
        </button>

        {/* Action buttons: Push / Pull / Fetch */}
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={doPush}
            disabled={loading}
            title="Push"
            className="hover:bg-white/[0.08]"
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              padding: "4px 0",
              fontSize: 11,
              background: "var(--background-tertiary)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--text-secondary)",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            <Upload size={12} /> Push
          </button>
          <button
            onClick={doPull}
            disabled={loading}
            title="Pull"
            className="hover:bg-white/[0.08]"
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              padding: "4px 0",
              fontSize: 11,
              background: "var(--background-tertiary)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--text-secondary)",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            <Download size={12} /> Pull
          </button>
          <button
            onClick={doFetch}
            disabled={loading}
            title="Fetch"
            className="hover:bg-white/[0.08]"
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              padding: "4px 0",
              fontSize: 11,
              background: "var(--background-tertiary)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--text-secondary)",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            <RefreshCw size={12} /> Fetch
          </button>
        </div>
      </div>
    </div>
  );
}
