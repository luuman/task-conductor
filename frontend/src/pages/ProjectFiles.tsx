import { useCallback, useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { api, type FileItem, type Project } from "../lib/api";
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

/* ── 语言检测（用于代码高亮 class） ─────────────── */
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
  onNavigate,
  onSelectFile,
}: {
  projectId: number;
  currentPath: string;
  selectedFile: string | null;
  onNavigate: (path: string) => void;
  onSelectFile: (path: string) => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Record<string, FileItem[]>>({});

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
            color: isSelected ? "var(--accent)" : "var(--text-secondary)",
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

  return (
    <div className="flex flex-col h-full">
      <div
        className="h-10 flex items-center gap-2 px-3 shrink-0"
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
      <div className="flex-1 overflow-y-auto py-1 px-1">
        {items.length === 0 && !loading && (
          <div className="text-center py-8 text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            {t("files.empty")}
          </div>
        )}
        {items.map((item) => renderItem(item, 0))}
      </div>
    </div>
  );
}

/* ── CodeViewer（右栏） ──────────────────────── */
function CodeViewer({
  projectId,
  filePath,
  onClose,
}: {
  projectId: number;
  filePath: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [content, setContent] = useState<string | null>(null);
  const [binary, setBinary] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [fileSize, setFileSize] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setCopied(false);
    api.projects
      .fileContent(projectId, filePath)
      .then((res) => {
        if (cancelled) return;
        setContent(res.content);
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

  const handleCopy = useCallback(() => {
    if (!content) return;
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [content]);

  // 行号 + 内容
  const lines = useMemo(() => content?.split("\n") || [], [content]);

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
        <span className="text-[10px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
          {formatSize(fileSize)}
        </span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded"
          style={{ background: "var(--background-tertiary)", color: "var(--text-tertiary)" }}
        >
          {lang}
        </span>
        {content && (
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
        {!loading && binary && (
          <div className="flex items-center justify-center h-full text-[13px]" style={{ color: "var(--text-tertiary)" }}>
            {t("files.binaryFile")}
          </div>
        )}
        {!loading && !binary && content != null && (
          <div className="font-mono text-[12px] leading-[1.65]">
            <table className="w-full border-collapse">
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i} className="hover:bg-white/[0.02]">
                    <td
                      className="text-right select-none px-3 py-0 align-top shrink-0 w-[1%] whitespace-nowrap"
                      style={{ color: "var(--text-tertiary)", opacity: 0.5, borderRight: "1px solid var(--border)" }}
                    >
                      {i + 1}
                    </td>
                    <td className="px-4 py-0 whitespace-pre" style={{ color: "var(--text-primary)" }}>
                      {line || " "}
                    </td>
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
            onNavigate={setCurrentPath}
            onSelectFile={setSelectedFile}
          />
        </div>

        {/* 右：代码查看 */}
        {selectedFile && (
          <div className="flex-1 min-w-0">
            <CodeViewer
              projectId={project.id}
              filePath={selectedFile}
              onClose={() => setSelectedFile(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
