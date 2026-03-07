import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronRight,
  ChevronDown,
  File,
  FileCode,
  FileText,
  FileJson,
  Image,
  Folder,
  FolderOpen,
  ArrowLeft,
  RefreshCw,
  Copy,
  Check,
  X,
  Search,
  Pencil,
  Save,
  GitBranch,
  Circle,
} from "lucide-react";
import hljs from "highlight.js";
import "../styles/hljs-ayu-dark.css";
import { api, type FileItem, type Project, type GitStatusResponse } from "../lib/api";
import { cn } from "../lib/utils";

/* ── 文件图标映射 ─────────────────────────────── */
const CODE_EXTS = new Set([
  "js", "jsx", "ts", "tsx", "py", "java", "c", "cpp", "h", "hpp",
  "go", "rs", "rb", "php", "swift", "kt", "scala", "sh", "bash", "zsh",
]);
const TEXT_EXTS = new Set(["md", "txt", "rst", "csv", "log"]);
const JSON_EXTS = new Set(["json", "yaml", "yml", "toml", "xml", "graphql"]);
const IMG_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"]);

function getExt(name: string) {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

function FileIcon({ name, isDir, open }: { name: string; isDir: boolean; open?: boolean }) {
  if (isDir) {
    const Ic = open ? FolderOpen : Folder;
    return <Ic size={15} className="shrink-0" style={{ color: "var(--accent)" }} />;
  }
  const ext = getExt(name);
  if (CODE_EXTS.has(ext)) return <FileCode size={15} className="shrink-0 text-emerald-400" />;
  if (TEXT_EXTS.has(ext)) return <FileText size={15} className="shrink-0 text-blue-400" />;
  if (JSON_EXTS.has(ext)) return <FileJson size={15} className="shrink-0 text-yellow-400" />;
  if (IMG_EXTS.has(ext)) return <Image size={15} className="shrink-0 text-pink-400" />;
  return <File size={15} className="shrink-0" style={{ color: "var(--text-tertiary)" }} />;
}

/* ── 语言检测 ─────────────────────────────────── */
function detectLang(name: string): string {
  const ext = getExt(name);
  const map: Record<string, string> = {
    js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
    py: "python", java: "java", c: "c", cpp: "cpp", h: "c", hpp: "cpp",
    go: "go", rs: "rust", rb: "ruby", php: "php", sh: "bash", bash: "bash",
    zsh: "bash", json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
    xml: "xml", html: "html", htm: "html", css: "css", scss: "scss",
    md: "markdown", sql: "sql", graphql: "graphql",
  };
  return map[ext] || "plaintext";
}

/* ── 格式化文件大小 ──────────────────────────── */
function formatSize(bytes: number | null) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* ── Git 状态颜色/标签 ───────────────────────── */
const GIT_STATUS_STYLES: Record<string, { color: string; label: string }> = {
  modified:  { color: "#e6b450", label: "M" },
  added:     { color: "#7fd962", label: "A" },
  deleted:   { color: "#d95757", label: "D" },
  untracked: { color: "#636d77", label: "U" },
  renamed:   { color: "#59c2ff", label: "R" },
  changed:   { color: "#e6b450", label: "C" },
};

function GitIndicator({ status }: { status: string | undefined }) {
  if (!status) return null;
  const s = GIT_STATUS_STYLES[status];
  if (!s) return null;
  return (
    <span
      className="text-[9px] font-mono font-bold shrink-0 w-3.5 text-center"
      style={{ color: s.color }}
    >
      {s.label}
    </span>
  );
}

/** 检查目录下是否有 git 变更的文件（用于目录级指示） */
function getDirGitStatus(dirPath: string, gitFiles: Record<string, string>): string | undefined {
  const prefix = dirPath + "/";
  for (const [filePath, status] of Object.entries(gitFiles)) {
    if (filePath.startsWith(prefix) || filePath === dirPath) {
      // 优先级: modified > added > untracked > others
      if (status === "modified") return "modified";
      if (status === "added") return "added";
      return status;
    }
  }
  return undefined;
}

/* ── 面包屑 ──────────────────────────────────── */
function Breadcrumb({
  path,
  onNavigate,
}: {
  path: string;
  onNavigate: (p: string) => void;
}) {
  const parts = path === "." ? [] : path.split("/").filter(Boolean);
  return (
    <div className="flex items-center gap-1 text-[12px] min-w-0 overflow-x-auto" style={{ color: "var(--text-tertiary)" }}>
      <button
        onClick={() => onNavigate("")}
        className="hover:underline shrink-0 font-medium"
        style={{ color: "var(--text-secondary)" }}
      >
        /
      </button>
      {parts.map((part, i) => {
        const sub = parts.slice(0, i + 1).join("/");
        return (
          <span key={sub} className="flex items-center gap-1 shrink-0">
            <ChevronRight size={10} />
            <button
              onClick={() => onNavigate(sub)}
              className="hover:underline"
              style={{ color: i === parts.length - 1 ? "var(--text-primary)" : "var(--text-secondary)" }}
            >
              {part}
            </button>
          </span>
        );
      })}
    </div>
  );
}

/* ── FileTree（左栏） ────────────────────────── */
function FileTree({
  projectId,
  currentPath,
  selectedFile,
  gitFiles,
  onNavigate,
  onSelectFile,
}: {
  projectId: number;
  currentPath: string;
  selectedFile: string | null;
  gitFiles: Record<string, string>;
  onNavigate: (path: string) => void;
  onSelectFile: (path: string) => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Record<string, FileItem[]>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FileItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const loadDir = useCallback(
    async (path: string) => {
      setLoading(true);
      try {
        const res = await api.projects.files(projectId, path);
        setItems(res.items);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  useEffect(() => {
    loadDir(currentPath);
  }, [currentPath, loadDir]);

  // debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await api.projects.searchFiles(projectId, searchQuery.trim());
        setSearchResults(res.items);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery, projectId]);

  const toggleSubDir = useCallback(
    async (dirPath: string) => {
      if (expandedDirs[dirPath]) {
        setExpandedDirs((prev) => {
          const next = { ...prev };
          delete next[dirPath];
          return next;
        });
      } else {
        try {
          const res = await api.projects.files(projectId, dirPath);
          setExpandedDirs((prev) => ({ ...prev, [dirPath]: res.items }));
        } catch {
          // ignore
        }
      }
    },
    [projectId, expandedDirs]
  );

  const renderItem = (item: FileItem, depth: number) => {
    const isExpanded = !!expandedDirs[item.path];
    const isSelected = !item.is_dir && item.path === selectedFile;
    const fileGitStatus = item.is_dir
      ? getDirGitStatus(item.path, gitFiles)
      : gitFiles[item.path];
    const gitColor = fileGitStatus ? GIT_STATUS_STYLES[fileGitStatus]?.color : undefined;

    return (
      <div key={item.path}>
        <button
          onClick={() => {
            if (item.is_dir) {
              toggleSubDir(item.path);
            } else {
              onSelectFile(item.path);
            }
          }}
          className={cn(
            "w-full flex items-center gap-1.5 py-1 pr-2 text-[12.5px] rounded-md transition-colors text-left group",
            isSelected ? "font-medium" : "hover:bg-white/[0.04]"
          )}
          style={{
            paddingLeft: `${depth * 16 + 8}px`,
            background: isSelected ? "var(--accent-subtle)" : undefined,
            color: isSelected ? "var(--accent)" : gitColor || "var(--text-secondary)",
          }}
        >
          {item.is_dir && (
            isExpanded
              ? <ChevronDown size={12} className="shrink-0" style={{ color: "var(--text-tertiary)" }} />
              : <ChevronRight size={12} className="shrink-0" style={{ color: "var(--text-tertiary)" }} />
          )}
          {!item.is_dir && <span className="w-3 shrink-0" />}
          <FileIcon name={item.name} isDir={item.is_dir} open={isExpanded} />
          <span className="truncate flex-1">{item.name}</span>
          <GitIndicator status={fileGitStatus} />
          {!item.is_dir && item.size != null && (
            <span className="text-[10px] opacity-0 group-hover:opacity-60 shrink-0 tabular-nums">
              {formatSize(item.size)}
            </span>
          )}
        </button>
        {item.is_dir && isExpanded && expandedDirs[item.path]?.map((sub) => renderItem(sub, depth + 1))}
      </div>
    );
  };

  const renderSearchResult = (item: FileItem) => {
    const isSelected = item.path === selectedFile;
    const dirPart = item.path.includes("/") ? item.path.slice(0, item.path.lastIndexOf("/") + 1) : "";
    const fileGitStatus = gitFiles[item.path];
    return (
      <button
        key={item.path}
        onClick={() => onSelectFile(item.path)}
        className={cn(
          "w-full flex items-center gap-1.5 py-1.5 px-2 text-[12.5px] rounded-md transition-colors text-left group",
          isSelected ? "font-medium" : "hover:bg-white/[0.04]"
        )}
        style={{
          background: isSelected ? "var(--accent-subtle)" : undefined,
          color: isSelected ? "var(--accent)" : "var(--text-secondary)",
        }}
      >
        <FileIcon name={item.name} isDir={false} />
        <span className="truncate flex-1">
          {dirPart && <span style={{ color: "var(--text-tertiary)" }}>{dirPart}</span>}
          <span>{item.name}</span>
        </span>
        <GitIndicator status={fileGitStatus} />
        {item.size != null && (
          <span className="text-[10px] opacity-0 group-hover:opacity-60 shrink-0 tabular-nums">
            {formatSize(item.size)}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* 搜索栏 */}
      <div className="px-2 pt-2 pb-1 shrink-0">
        <div
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[12px]"
          style={{ background: "var(--background-tertiary)", border: "1px solid var(--border)" }}
        >
          <Search size={12} style={{ color: "var(--text-tertiary)" }} className="shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("files.search")}
            className="flex-1 bg-transparent outline-none text-[12px]"
            style={{ color: "var(--text-primary)" }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="shrink-0" style={{ color: "var(--text-tertiary)" }}>
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* 面包屑 + 刷新 */}
      {!searchQuery && (
        <div
          className="h-9 flex items-center gap-2 px-3 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          {currentPath && (
            <button
              onClick={() => {
                const parent = currentPath.includes("/")
                  ? currentPath.split("/").slice(0, -1).join("/")
                  : "";
                onNavigate(parent);
              }}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/[0.06]"
              style={{ color: "var(--text-tertiary)" }}
            >
              <ArrowLeft size={13} />
            </button>
          )}
          <Breadcrumb path={currentPath || "."} onNavigate={onNavigate} />
          <button
            onClick={() => loadDir(currentPath)}
            className="ml-auto w-6 h-6 flex items-center justify-center rounded hover:bg-white/[0.06]"
            style={{ color: "var(--text-tertiary)" }}
            title={t("common.refresh")}
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      )}

      {/* 文件列表 / 搜索结果 */}
      <div className="flex-1 overflow-y-auto py-1 px-1">
        {searchQuery ? (
          searching ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw size={14} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
            </div>
          ) : searchResults && searchResults.length === 0 ? (
            <div className="text-center py-8 text-[12px]" style={{ color: "var(--text-tertiary)" }}>
              {t("files.noResults")}
            </div>
          ) : (
            searchResults?.map(renderSearchResult)
          )
        ) : (
          <>
            {items.length === 0 && !loading && (
              <div className="text-center py-8 text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                {t("files.empty")}
              </div>
            )}
            {items.map((item) => renderItem(item, 0))}
          </>
        )}
      </div>
    </div>
  );
}

/* ── CodeViewer（右栏，支持编辑 + 语法高亮） ──── */
function CodeViewer({
  projectId,
  filePath,
  gitStatus,
  onClose,
}: {
  projectId: number;
  filePath: string;
  gitStatus: string | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [content, setContent] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<string>("");
  const [binary, setBinary] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [fileSize, setFileSize] = useState(0);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"" | "saved" | "failed">("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setCopied(false);
    setEditing(false);
    setSaveStatus("");
    api.projects
      .fileContent(projectId, filePath)
      .then((res) => {
        if (cancelled) return;
        setContent(res.content);
        setEditContent(res.content || "");
        setBinary(res.binary);
        setFileSize(res.size);
      })
      .catch(() => {
        if (cancelled) return;
        setContent(null);
        setBinary(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, filePath]);

  const fileName = filePath.split("/").pop() || filePath;
  const lang = detectLang(fileName);
  const isImage = IMG_EXTS.has(getExt(fileName));
  const hasUnsaved = editing && editContent !== content;

  // highlight.js: 对内容做语法高亮，返回 HTML 行数组
  const highlightedLines = useMemo(() => {
    if (!content || binary || isImage) return [];
    try {
      const hljsLang = lang === "plaintext" ? undefined : lang;
      const result = hljsLang && hljs.getLanguage(hljsLang)
        ? hljs.highlight(content, { language: hljsLang })
        : hljs.highlightAuto(content);
      return result.value.split("\n");
    } catch {
      // fallback: no highlight
      return content.split("\n").map((l) =>
        l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      );
    }
  }, [content, lang, binary, isImage]);

  const lineCount = highlightedLines.length;

  const handleCopy = useCallback(() => {
    if (!content) return;
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [content]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveStatus("");
    try {
      await api.projects.saveFile(projectId, filePath, editContent);
      setContent(editContent);
      setSaveStatus("saved");
      setEditing(false);
      setTimeout(() => setSaveStatus(""), 2000);
    } catch {
      setSaveStatus("failed");
    } finally {
      setSaving(false);
    }
  }, [projectId, filePath, editContent]);

  const handleStartEdit = useCallback(() => {
    setEditContent(content || "");
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [content]);

  const handleCancelEdit = useCallback(() => {
    setEditContent(content || "");
    setEditing(false);
  }, [content]);

  // Ctrl+S to save
  useEffect(() => {
    if (!editing) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editing, handleSave]);

  const canEdit = !binary && !isImage && content != null;
  const gitStyleInfo = gitStatus ? GIT_STATUS_STYLES[gitStatus] : undefined;

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div
        className="h-10 flex items-center gap-2 px-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <FileIcon name={fileName} isDir={false} />
        <span className="text-[12.5px] font-medium truncate flex-1" style={{ color: "var(--text-primary)" }}>
          {filePath}
        </span>
        {/* git status badge */}
        {gitStyleInfo && (
          <span
            className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
            style={{ background: gitStyleInfo.color + "18", color: gitStyleInfo.color }}
          >
            {gitStyleInfo.label}
          </span>
        )}
        {hasUnsaved && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
            {t("files.unsaved")}
          </span>
        )}
        {saveStatus === "saved" && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
            {t("files.saved")}
          </span>
        )}
        {saveStatus === "failed" && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
            {t("files.saveFailed")}
          </span>
        )}
        <span className="text-[10px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
          {formatSize(fileSize)}
        </span>
        {!isImage && (
          <span className="text-[10px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
            {lineCount} {t("files.lines")}
          </span>
        )}
        <span
          className="text-[10px] px-1.5 py-0.5 rounded"
          style={{ background: "var(--background-tertiary)", color: "var(--text-tertiary)" }}
        >
          {lang}
        </span>
        {canEdit && !editing && (
          <button
            onClick={handleStartEdit}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/[0.06]"
            style={{ color: "var(--text-tertiary)" }}
            title={t("files.edit")}
          >
            <Pencil size={12} />
          </button>
        )}
        {editing && (
          <>
            <button
              onClick={handleSave}
              disabled={saving || !hasUnsaved}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/[0.06] disabled:opacity-30"
              style={{ color: saving ? "var(--text-tertiary)" : "#22c55e" }}
              title={`${t("files.save")} (Ctrl+S)`}
            >
              <Save size={12} className={saving ? "animate-pulse" : ""} />
            </button>
            <button
              onClick={handleCancelEdit}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/[0.06]"
              style={{ color: "var(--text-tertiary)" }}
              title={t("files.cancel")}
            >
              <X size={12} />
            </button>
          </>
        )}
        {content && !editing && (
          <button
            onClick={handleCopy}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/[0.06]"
            style={{ color: copied ? "#22c55e" : "var(--text-tertiary)" }}
            title={t("files.copy")}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        )}
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/[0.06]"
          style={{ color: "var(--text-tertiary)" }}
        >
          <X size={13} />
        </button>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <RefreshCw size={16} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
          </div>
        )}
        {/* 图片预览 */}
        {!loading && isImage && (
          <div className="flex items-center justify-center h-full p-8">
            <img
              src={`/api/projects/${projectId}/file/raw?path=${encodeURIComponent(filePath)}`}
              alt={fileName}
              className="max-w-full max-h-full object-contain rounded-lg"
              style={{ background: "var(--background-tertiary)" }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                (e.target as HTMLImageElement).parentElement!.innerHTML = `
                  <div style="color: var(--text-tertiary); font-size: 13px;">${t("files.imagePreview")}</div>
                `;
              }}
            />
          </div>
        )}
        {!loading && binary && !isImage && (
          <div className="flex items-center justify-center h-full text-[13px]" style={{ color: "var(--text-tertiary)" }}>
            {t("files.binaryFile")}
          </div>
        )}
        {/* 编辑模式 */}
        {!loading && !binary && !isImage && content != null && editing && (
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-full p-4 font-mono text-[12px] leading-[1.65] resize-none outline-none"
            style={{
              background: "var(--background-primary)",
              color: "#bfbdb6",
              tabSize: 2,
            }}
            spellCheck={false}
          />
        )}
        {/* 只读模式 + 语法高亮 */}
        {!loading && !binary && !isImage && content != null && !editing && (
          <div className="font-mono text-[12px] leading-[1.65]">
            <table className="w-full border-collapse">
              <tbody>
                {highlightedLines.map((html, i) => (
                  <tr key={i} className="hover:bg-white/[0.02]">
                    <td
                      className="text-right select-none px-3 py-0 align-top shrink-0 w-[1%] whitespace-nowrap"
                      style={{ color: "#636d77", opacity: 0.6, borderRight: "1px solid var(--border)" }}
                    >
                      {i + 1}
                    </td>
                    <td
                      className="px-4 py-0 whitespace-pre hljs"
                      dangerouslySetInnerHTML={{ __html: html || " " }}
                    />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !binary && content == null && (
          <div className="flex items-center justify-center h-full text-[13px]" style={{ color: "var(--text-tertiary)" }}>
            {t("files.loadError")}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── ProjectFiles 主页面 ─────────────────────── */
export default function ProjectFiles({
  project,
  onBack,
}: {
  project: Project;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [currentPath, setCurrentPath] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [gitInfo, setGitInfo] = useState<GitStatusResponse | null>(null);

  // 加载 git status
  const loadGitStatus = useCallback(async () => {
    try {
      const res = await api.projects.gitStatus(project.id);
      setGitInfo(res);
    } catch {
      setGitInfo(null);
    }
  }, [project.id]);

  useEffect(() => {
    loadGitStatus();
  }, [loadGitStatus]);

  const gitFiles = gitInfo?.files || {};

  return (
    <div className="flex flex-col h-full">
      {/* 顶栏 */}
      <div
        className="h-11 flex items-center gap-3 px-4 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <button
          onClick={onBack}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/[0.06]"
          style={{ color: "var(--text-tertiary)" }}
        >
          <ArrowLeft size={14} />
        </button>
        <Folder size={15} style={{ color: "var(--accent)" }} />
        <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
          {project.name}
        </span>
        <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          {t("files.title")}
        </span>
        {/* git branch badge */}
        {gitInfo?.is_git && gitInfo.branch && (
          <div className="flex items-center gap-1 ml-auto">
            <GitBranch size={12} style={{ color: "var(--text-tertiary)" }} />
            <span className="text-[11px] font-mono" style={{ color: "var(--text-secondary)" }}>
              {gitInfo.branch}
            </span>
            {/* summary dots */}
            {gitInfo.summary && Object.entries(gitInfo.summary).map(([status, count]) => {
              const s = GIT_STATUS_STYLES[status];
              if (!s) return null;
              return (
                <span
                  key={status}
                  className="flex items-center gap-0.5 text-[10px] font-mono"
                  style={{ color: s.color }}
                  title={`${status}: ${count}`}
                >
                  <Circle size={6} fill={s.color} />
                  {count}
                </span>
              );
            })}
            <button
              onClick={loadGitStatus}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/[0.06] ml-1"
              style={{ color: "var(--text-tertiary)" }}
              title={t("common.refresh")}
            >
              <RefreshCw size={10} />
            </button>
          </div>
        )}
      </div>

      {/* 双栏 */}
      <div className="flex flex-1 min-h-0">
        {/* 左：文件树 */}
        <div
          className="flex flex-col shrink-0"
          style={{
            width: selectedFile ? "280px" : "100%",
            maxWidth: selectedFile ? "360px" : undefined,
            borderRight: selectedFile ? "1px solid var(--border)" : undefined,
            transition: "width 200ms",
          }}
        >
          <FileTree
            projectId={project.id}
            currentPath={currentPath}
            selectedFile={selectedFile}
            gitFiles={gitFiles}
            onNavigate={setCurrentPath}
            onSelectFile={setSelectedFile}
          />
        </div>

        {/* 右：代码查看/编辑 */}
        {selectedFile && (
          <div className="flex-1 min-w-0">
            <CodeViewer
              projectId={project.id}
              filePath={selectedFile}
              gitStatus={gitFiles[selectedFile]}
              onClose={() => setSelectedFile(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
