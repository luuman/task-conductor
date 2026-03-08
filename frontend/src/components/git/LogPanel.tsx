import { useState, useEffect, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  Package,
  Plus,
  Trash2,
  Play,
} from "lucide-react";
import {
  api,
  type GitCommit,
  type GitBranch as GitBranchType,
  type GitStashEntry,
} from "../../lib/api";
import GitGraph from "./GitGraph";

interface LogPanelProps {
  projectId: number;
  onSelectCommit: (sha: string) => void;
  selectedCommit: string | null;
  onRefresh: () => void;
}

function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  badge?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  icon,
  badge,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "6px 8px",
          cursor: "pointer",
          userSelect: "none",
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          color: "var(--text-secondary)",
          letterSpacing: "0.05em",
          gap: 4,
        }}
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {icon}
        <span style={{ flex: 1 }}>{title}</span>
        {badge !== undefined && badge > 0 && (
          <span
            className="text-[10px] px-1.5 rounded-full bg-white/[0.06]"
            style={{ color: "var(--text-tertiary)" }}
          >
            {badge}
          </span>
        )}
      </div>
      {open && children}
    </div>
  );
}

export default function LogPanel({
  projectId,
  onSelectCommit,
  selectedCommit,
  onRefresh,
}: LogPanelProps) {
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [branches, setBranches] = useState<GitBranchType[]>([]);
  const [stashes, setStashes] = useState<GitStashEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [logRes, branchRes, stashRes] = await Promise.all([
        api.git.log(projectId),
        api.git.branches(projectId),
        api.git.stashList(projectId),
      ]);
      setCommits(logRes.commits);
      setBranches(branchRes.branches);
      setStashes(stashRes.stashes);
    } catch {
      // ignore
    }
  }, [projectId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll, onRefresh]);

  const mutate = useCallback(
    async (fn: () => Promise<unknown>) => {
      setLoading(true);
      try {
        await fn();
        await fetchAll();
        onRefresh();
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [fetchAll, onRefresh],
  );

  // Branch actions
  const doCheckout = (name: string) => {
    if (!confirm(`Switch to branch "${name}"?`)) return;
    mutate(() => api.git.checkout(projectId, { branch: name }));
  };

  const doNewBranch = () => {
    const name = prompt("New branch name:");
    if (!name?.trim()) return;
    mutate(() =>
      api.git.checkout(projectId, { branch: name.trim(), create: true }),
    );
  };

  // Stash actions
  const doStashSave = () => {
    const message = prompt("Stash message (optional):");
    if (message === null) return; // cancelled
    mutate(() => api.git.stashSave(projectId, { message: message || undefined }));
  };

  const doStashApply = (index: number) => {
    mutate(() => api.git.stashApply(projectId, index));
  };

  const doStashDrop = (index: number) => {
    if (!confirm(`Drop stash@{${index}}?`)) return;
    mutate(() => api.git.stashDrop(projectId, index));
  };

  // Split branches into local and remote
  const localBranches = branches.filter((b) => !b.remote);
  const remoteBranches = branches.filter((b) => b.remote);

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
      {/* Git Graph area (main) */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {commits.length === 0 ? (
          <div
            style={{
              padding: 16,
              color: "var(--text-tertiary)",
              textAlign: "center",
            }}
          >
            No commits
          </div>
        ) : (
          <GitGraph
            commits={commits}
            selectedCommit={selectedCommit}
            onSelectCommit={onSelectCommit}
          />
        )}
      </div>

      {/* Branches section */}
      <CollapsibleSection
        title="Branches"
        icon={<GitBranch size={12} />}
        badge={branches.length}
      >
        <div style={{ paddingBottom: 4 }}>
          {/* Local branches */}
          {localBranches.length > 0 && (
            <div style={{ marginBottom: 2 }}>
              <div
                style={{
                  padding: "2px 8px 2px 28px",
                  fontSize: 10,
                  color: "var(--text-tertiary)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Local
              </div>
              {localBranches.map((b) => (
                <div
                  key={b.name}
                  onClick={() => !b.current && doCheckout(b.name)}
                  className={
                    b.current ? "" : "hover:bg-white/[0.04] cursor-pointer"
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 8px 3px 28px",
                    fontSize: 12,
                    color: b.current
                      ? "var(--accent, #7aa2f7)"
                      : "var(--text-primary)",
                    fontWeight: b.current ? 600 : 400,
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  {b.current && (
                    <span style={{ fontSize: 11, marginRight: 2 }}>*</span>
                  )}
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {b.name}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Remote branches */}
          {remoteBranches.length > 0 && (
            <div style={{ marginBottom: 2 }}>
              <div
                style={{
                  padding: "2px 8px 2px 28px",
                  fontSize: 10,
                  color: "var(--text-tertiary)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Remote
              </div>
              {remoteBranches.map((b) => (
                <div
                  key={b.name}
                  onClick={() => doCheckout(b.name)}
                  className="hover:bg-white/[0.04] cursor-pointer"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 8px 3px 28px",
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {b.name}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* New Branch button */}
          <div style={{ padding: "4px 8px 4px 24px" }}>
            <button
              onClick={doNewBranch}
              disabled={loading}
              className="hover:bg-white/[0.06]"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: "none",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: 11,
                color: "var(--text-tertiary)",
                padding: "3px 6px",
                borderRadius: 4,
              }}
            >
              <Plus size={12} />
              New Branch
            </button>
          </div>
        </div>
      </CollapsibleSection>

      {/* Stash section */}
      <CollapsibleSection
        title="Stash"
        icon={<Package size={12} />}
        badge={stashes.length}
      >
        <div style={{ paddingBottom: 4 }}>
          {/* Stash Changes button */}
          <div style={{ padding: "2px 8px 2px 24px" }}>
            <button
              onClick={doStashSave}
              disabled={loading}
              className="hover:bg-white/[0.06]"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: "none",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: 11,
                color: "var(--text-tertiary)",
                padding: "3px 6px",
                borderRadius: 4,
              }}
            >
              <Plus size={12} />
              Stash Changes
            </button>
          </div>

          {/* Stash entries */}
          {stashes.length === 0 ? (
            <div
              style={{
                padding: "6px 28px",
                fontSize: 11,
                color: "var(--text-tertiary)",
              }}
            >
              No stashes
            </div>
          ) : (
            stashes.map((s) => {
              const idx = parseInt(s.index.replace(/[^0-9]/g, ""), 10) || 0;
              return (
                <div
                  key={s.index}
                  className="hover:bg-white/[0.04] group"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 8px 3px 28px",
                    fontSize: 12,
                    color: "var(--text-primary)",
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "monospace",
                      color: "var(--text-tertiary)",
                      flexShrink: 0,
                    }}
                  >
                    {s.index}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.message || "(no message)"}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--text-tertiary)",
                      flexShrink: 0,
                    }}
                  >
                    {relativeTime(s.date)}
                  </span>
                  <span
                    style={{ display: "flex", gap: 2, opacity: 0 }}
                    className="group-hover:!opacity-100"
                  >
                    <button
                      onClick={() => doStashApply(idx)}
                      disabled={loading}
                      title="Apply"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: loading ? "not-allowed" : "pointer",
                        padding: 2,
                        color: "var(--text-secondary)",
                        display: "flex",
                        alignItems: "center",
                      }}
                      className="hover:!text-[var(--text-primary)]"
                    >
                      <Play size={12} />
                    </button>
                    <button
                      onClick={() => doStashDrop(idx)}
                      disabled={loading}
                      title="Drop"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: loading ? "not-allowed" : "pointer",
                        padding: 2,
                        color: "var(--text-secondary)",
                        display: "flex",
                        alignItems: "center",
                      }}
                      className="hover:!text-[var(--text-primary)]"
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                </div>
              );
            })
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}
