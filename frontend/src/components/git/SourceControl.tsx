import { useState, useEffect, useCallback } from "react";
import { api, type Project, type GitCommit as GitCommitType, type GitFileEntry } from "../../lib/api";
import ChangesPanel from "./ChangesPanel";
import LogPanel from "./LogPanel";
import DiffViewer from "../DiffViewer";

interface SourceControlProps {
  project: Project;
}

export default function SourceControl({ project }: SourceControlProps) {
  const [tab, setTab] = useState<"changes" | "log">("changes");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFileStaged, setSelectedFileStaged] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState("");
  const [diffFileName, setDiffFileName] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // Commit detail state (files changed in selected commit)
  const [commitFiles, setCommitFiles] = useState<GitFileEntry[]>([]);
  const [commitInfo, setCommitInfo] = useState<GitCommitType | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // When tab switches, clear the other tab's selection
  const switchTab = useCallback((newTab: "changes" | "log") => {
    setTab(newTab);
    if (newTab === "changes") {
      setSelectedCommit(null);
      setCommitFiles([]);
      setCommitInfo(null);
    } else {
      setSelectedFile(null);
      setSelectedFileStaged(false);
    }
    setDiffContent("");
    setDiffFileName("");
  }, []);

  // Fetch diff when a file is selected in Changes tab
  useEffect(() => {
    if (tab !== "changes" || !selectedFile) return;
    let cancelled = false;
    setLoadingDiff(true);
    api.git
      .diff(project.id, { file: selectedFile, staged: selectedFileStaged })
      .then((res) => {
        if (!cancelled) {
          setDiffContent(res.diff);
          setDiffFileName(selectedFile);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDiffContent("");
          setDiffFileName("");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDiff(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, selectedFile, selectedFileStaged, project.id, refreshKey]);

  // Fetch commit detail when a commit is selected in Log tab
  useEffect(() => {
    if (tab !== "log" || !selectedCommit) return;
    let cancelled = false;
    setCommitFiles([]);
    setCommitInfo(null);
    setDiffContent("");
    setDiffFileName("");
    api.git
      .commitDetail(project.id, selectedCommit)
      .then((res) => {
        if (!cancelled) {
          setCommitFiles(res.files);
          setCommitInfo(res.commit);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCommitFiles([]);
          setCommitInfo(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tab, selectedCommit, project.id]);

  // Fetch diff for a file within a commit
  const handleCommitFileClick = useCallback(
    (filePath: string) => {
      if (!selectedCommit) return;
      setLoadingDiff(true);
      setDiffFileName(filePath);
      api.git
        .diff(project.id, { file: filePath, commit: selectedCommit })
        .then((res) => {
          setDiffContent(res.diff);
        })
        .catch(() => {
          setDiffContent("");
        })
        .finally(() => {
          setLoadingDiff(false);
        });
    },
    [selectedCommit, project.id],
  );

  const handleSelectFile = useCallback((path: string, staged: boolean) => {
    setSelectedFile(path);
    setSelectedFileStaged(staged);
  }, []);

  const handleSelectCommit = useCallback((sha: string) => {
    setSelectedCommit(sha);
  }, []);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left Panel */}
      <div
        style={{
          width: 320,
          minWidth: 280,
          maxWidth: 400,
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "hidden",
        }}
      >
        {/* Tab buttons */}
        <div className="flex shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <button
            className={`flex-1 py-2 text-[12px] font-medium transition-colors ${
              tab === "changes"
                ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            }`}
            style={{ background: "none", border: "none", borderBottom: tab === "changes" ? "2px solid var(--accent)" : "2px solid transparent", cursor: "pointer" }}
            onClick={() => switchTab("changes")}
          >
            Changes
          </button>
          <button
            className={`flex-1 py-2 text-[12px] font-medium transition-colors ${
              tab === "log"
                ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            }`}
            style={{ background: "none", border: "none", borderBottom: tab === "log" ? "2px solid var(--accent)" : "2px solid transparent", cursor: "pointer" }}
            onClick={() => switchTab("log")}
          >
            Log
          </button>
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {tab === "changes" ? (
            <ChangesPanel
              projectId={project.id}
              onSelectFile={handleSelectFile}
              selectedFile={selectedFile}
              onRefresh={handleRefresh}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
              <div style={{ flex: selectedCommit ? "0 0 auto" : 1, overflow: "auto", maxHeight: selectedCommit ? "50%" : "100%" }}>
                <LogPanel
                  projectId={project.id}
                  selectedCommit={selectedCommit}
                  onSelectCommit={handleSelectCommit}
                  refreshKey={refreshKey}
                />
              </div>

              {/* Commit detail file list */}
              {selectedCommit && (
                <div
                  style={{
                    flex: 1,
                    overflow: "auto",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      padding: "6px 8px",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      position: "sticky",
                      top: 0,
                      background: "var(--background-primary)",
                      zIndex: 1,
                    }}
                  >
                    {commitInfo
                      ? `Changed files (${commitFiles.length})`
                      : "Loading..."}
                  </div>
                  {commitFiles.map((f) => (
                    <div
                      key={f.path}
                      onClick={() => handleCommitFileClick(f.path)}
                      className="hover:bg-white/[0.04] group"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "3px 8px 3px 16px",
                        cursor: "pointer",
                        fontSize: 12,
                        color: "var(--text-primary)",
                        background:
                          diffFileName === f.path
                            ? "rgba(255,255,255,0.06)"
                            : "transparent",
                      }}
                    >
                      <StatusBadge status={f.status} />
                      <span
                        style={{
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {f.path}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - DiffViewer */}
      <div style={{ flex: 1, minWidth: 0, height: "100%", overflow: "auto" }}>
        {loadingDiff ? (
          <div
            className="flex items-center justify-center h-full"
            style={{ color: "var(--text-tertiary)", fontSize: 13 }}
          >
            Loading diff...
          </div>
        ) : diffContent ? (
          <DiffViewer diff={diffContent} fileName={diffFileName} />
        ) : (
          <div
            className="flex items-center justify-center h-full"
            style={{ color: "var(--text-tertiary)", fontSize: 13 }}
          >
            Select a file to view changes
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Inline StatusBadge (same as ChangesPanel) ── */

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
