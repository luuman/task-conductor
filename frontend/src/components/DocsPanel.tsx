import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FileText,
  FileJson,
  File,
  Folder,
  FolderOpen,
  Search,
  X,
  RefreshCw,
  BookOpen,
  ChevronRight,
  ChevronDown,
  List,
} from "lucide-react";
import hljs from "highlight.js";
import "../styles/hljs-ayu-dark.css";
import { api, type FileItem } from "../lib/api";
import { cn } from "../lib/utils";

/* ── helpers ──────────────────────────────────── */

function getExt(name: string) {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

function DocIcon({ name, size = 14 }: { name: string; size?: number }) {
  const ext = getExt(name);
  if (ext === "md" || ext === "rst" || ext === "txt")
    return <FileText size={size} className="shrink-0 text-blue-400" />;
  if (ext === "json" || ext === "yaml" || ext === "yml" || ext === "toml")
    return <FileJson size={size} className="shrink-0 text-yellow-400" />;
  return <File size={size} className="shrink-0" style={{ color: "var(--text-tertiary)" }} />;
}

function detectLang(name: string): string {
  const ext = getExt(name);
  const map: Record<string, string> = {
    md: "markdown", txt: "plaintext", rst: "plaintext",
    json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
    html: "html",
  };
  return map[ext] || "plaintext";
}

function formatSize(bytes: number | null) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* ── heading extraction（文章导航） ───────────── */

interface Heading {
  level: number;
  text: string;
  line: number; // 0-based line index
}

function extractHeadings(content: string, fileName: string): Heading[] {
  const ext = getExt(fileName);
  const headings: Heading[] = [];
  const lines = content.split("\n");

  if (ext === "md" || ext === "rst" || ext === "txt") {
    lines.forEach((line, i) => {
      // ATX headings: # H1, ## H2, etc.
      const m = line.match(/^(#{1,6})\s+(.+)/);
      if (m) {
        headings.push({ level: m[1].length, text: m[2].replace(/\s*#+\s*$/, ""), line: i });
      }
    });
  } else if (ext === "html") {
    lines.forEach((line, i) => {
      const m = line.match(/<h([1-6])[^>]*>([^<]+)<\/h[1-6]>/i);
      if (m) {
        headings.push({ level: parseInt(m[1]), text: m[2], line: i });
      }
    });
  }
  return headings;
}

/* ── drag-to-resize hook ─────────────────────── */

function useDragResize(
  direction: "left" | "right",
  initial: number,
  min: number,
  max: number,
) {
  const [width, setWidth] = useState(initial);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = direction === "left"
        ? ev.clientX - startX.current
        : startX.current - ev.clientX;
      setWidth(Math.min(max, Math.max(min, startW.current + delta)));
    };
    const onUp = () => {
      dragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [width, min, max, direction]);

  return { width, onMouseDown };
}

/* ── tree node structure ─────────────────────── */

interface TreeNode {
  name: string;       // file/dir name
  displayName: string; // title from doc content, fallback to name
  path: string;
  isDir: boolean;
  children: TreeNode[];
  item?: FileItem;
}

function buildTree(items: FileItem[]): TreeNode[] {
  const root: TreeNode[] = [];
  const dirs = new Map<string, TreeNode>();

  const getOrCreateDir = (pathParts: string[], fullPath: string): TreeNode => {
    const existing = dirs.get(fullPath);
    if (existing) return existing;
    const dirName = pathParts[pathParts.length - 1];
    const node: TreeNode = { name: dirName, displayName: dirName, path: fullPath, isDir: true, children: [] };
    dirs.set(fullPath, node);

    if (pathParts.length === 1) {
      root.push(node);
    } else {
      const parentPath = pathParts.slice(0, -1).join("/");
      const parent = getOrCreateDir(pathParts.slice(0, -1), parentPath);
      parent.children.push(node);
    }
    return node;
  };

  for (const item of items) {
    // Strip "docs/" prefix for tree display
    const rel = item.path.replace(/^docs\//, "");
    const parts = rel.split("/");
    const display = item.title || item.name;
    if (parts.length === 1) {
      root.push({ name: item.name, displayName: display, path: item.path, isDir: false, children: [], item });
    } else {
      const dirParts = parts.slice(0, -1);
      const dirPath = dirParts.join("/");
      const parent = getOrCreateDir(dirParts, dirPath);
      parent.children.push({ name: item.name, displayName: display, path: item.path, isDir: false, children: [], item });
    }
  }

  // Sort: dirs first, then files, alphabetical
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => { if (n.isDir) sortNodes(n.children); });
  };
  sortNodes(root);
  return root;
}

/* ── DocTree（左栏-文档导航） ─────────────────── */

function DocTree({
  nodes,
  selectedPath,
  filter,
  onSelect,
}: {
  nodes: TreeNode[];
  selectedPath: string | null;
  filter: string;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Default expand all directories
    const s = new Set<string>();
    const walk = (ns: TreeNode[]) => {
      for (const n of ns) {
        if (n.isDir) { s.add(n.path); walk(n.children); }
      }
    };
    walk(nodes);
    return s;
  });

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const filterLower = filter.toLowerCase();

  const matchesFilter = (node: TreeNode): boolean => {
    if (!filter) return true;
    if (node.name.toLowerCase().includes(filterLower)) return true;
    if (node.isDir) return node.children.some(matchesFilter);
    return false;
  };

  const renderNode = (node: TreeNode, depth: number) => {
    if (!matchesFilter(node)) return null;
    const isOpen = expanded.has(node.path);
    const isSelected = node.path === selectedPath;

    return (
      <div key={node.path}>
        <button
          onClick={() => node.isDir ? toggle(node.path) : onSelect(node.path)}
          className={cn(
            "w-full flex items-center gap-1.5 py-[3px] pr-2 text-[12px] rounded transition-colors text-left group",
            isSelected && !node.isDir ? "font-medium" : "hover:bg-white/[0.04]"
          )}
          style={{
            paddingLeft: `${depth * 14 + 6}px`,
            background: isSelected && !node.isDir ? "var(--accent-subtle)" : undefined,
            color: isSelected && !node.isDir ? "var(--accent)" : "var(--text-secondary)",
          }}
        >
          {node.isDir ? (
            isOpen
              ? <><ChevronDown size={11} className="shrink-0" style={{ color: "var(--text-tertiary)" }} /><FolderOpen size={13} className="shrink-0" style={{ color: "var(--accent)" }} /></>
              : <><ChevronRight size={11} className="shrink-0" style={{ color: "var(--text-tertiary)" }} /><Folder size={13} className="shrink-0" style={{ color: "var(--accent)" }} /></>
          ) : (
            <><span className="w-[11px] shrink-0" /><DocIcon name={node.name} size={13} /></>
          )}
          <span className="truncate flex-1">{node.name}</span>
          {!node.isDir && node.item?.size != null && (
            <span className="text-[9px] opacity-0 group-hover:opacity-50 shrink-0 tabular-nums">
              {formatSize(node.item.size)}
            </span>
          )}
        </button>
        {node.isDir && isOpen && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return <>{nodes.map((n) => renderNode(n, 0))}</>;
}

/* ── TocNav（右栏-文章导航） ──────────────────── */

function TocNav({
  headings,
  activeLine,
  onJump,
}: {
  headings: Heading[];
  activeLine: number;
  onJump: (line: number) => void;
}) {
  const { t } = useTranslation();
  if (headings.length === 0) return null;

  // Find which heading is "active" based on scroll position
  let activeIdx = 0;
  for (let i = headings.length - 1; i >= 0; i--) {
    if (headings[i].line <= activeLine) { activeIdx = i; break; }
  }

  const minLevel = Math.min(...headings.map((h) => h.level));

  return (
    <div className="flex flex-col h-full">
      <div
        className="h-9 flex items-center gap-1.5 px-3 shrink-0 text-[11px] font-medium"
        style={{ borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)" }}
      >
        <List size={12} />
        {t("docsPanel.outline")}
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {headings.map((h, i) => {
          const indent = (h.level - minLevel) * 12 + 8;
          const isActive = i === activeIdx;
          return (
            <button
              key={`${h.line}-${i}`}
              onClick={() => onJump(h.line)}
              className={cn(
                "w-full text-left py-[3px] pr-2 text-[11px] rounded transition-colors truncate",
                isActive ? "font-medium" : "hover:bg-white/[0.04]"
              )}
              style={{
                paddingLeft: `${indent}px`,
                color: isActive ? "var(--accent)" : "var(--text-tertiary)",
              }}
              title={h.text}
            >
              {h.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Resize Handle ───────────────────────────── */

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="w-[3px] shrink-0 cursor-col-resize group relative"
      style={{ background: "var(--border)" }}
    >
      <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-[var(--accent)] group-hover:opacity-30 transition-opacity rounded" />
    </div>
  );
}

/* ── DocsPanel 主组件 ────────────────────────── */

interface DocsPanelProps {
  projectId: number;
  onClose: () => void;
}

export function DocsPanel({ projectId, onClose }: DocsPanelProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<FileItem[]>([]);
  const [hasDocs, setHasDocs] = useState(true);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [docContent, setDocContent] = useState<string | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [scrollLine, setScrollLine] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  // Resizable panes
  const leftPane = useDragResize("left", 220, 140, 400);
  const rightPane = useDragResize("right", 180, 120, 320);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.projects.docs(projectId);
      setHasDocs(res.has_docs);
      setItems(res.items);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const loadContent = useCallback(async (path: string) => {
    setSelectedPath(path);
    setDocLoading(true);
    setDocContent(null);
    setScrollLine(0);
    try {
      const res = await api.projects.docContent(projectId, path);
      setDocContent(res.content);
    } catch {
      setDocContent(null);
    } finally {
      setDocLoading(false);
    }
  }, [projectId]);

  const tree = useMemo(() => buildTree(items), [items]);

  const selectedName = selectedPath?.split("/").pop() || "";
  const selectedLang = selectedName ? detectLang(selectedName) : "";

  const highlightedLines = useMemo(() => {
    if (!docContent) return [];
    try {
      const hljsLang = selectedLang === "plaintext" ? undefined : selectedLang;
      const result = hljsLang && hljs.getLanguage(hljsLang)
        ? hljs.highlight(docContent, { language: hljsLang })
        : { value: docContent.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") };
      return result.value.split("\n");
    } catch {
      return docContent.split("\n").map((l) =>
        l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      );
    }
  }, [docContent, selectedLang]);

  const headings = useMemo(() => {
    if (!docContent || !selectedName) return [];
    return extractHeadings(docContent, selectedName);
  }, [docContent, selectedName]);

  // Track scroll position to highlight active heading
  const handleScroll = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const rows = el.querySelectorAll("tr");
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].getBoundingClientRect().top <= el.getBoundingClientRect().top + 60) {
        setScrollLine(i);
        return;
      }
    }
    setScrollLine(0);
  }, []);

  const jumpToLine = useCallback((line: number) => {
    const el = contentRef.current;
    if (!el) return;
    const row = el.querySelectorAll("tr")[line];
    if (row) row.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const hasContent = selectedPath && docContent != null && !docLoading;
  const showOutline = hasContent && headings.length > 0;

  return (
    <div className="fixed inset-y-0 right-0 flex flex-col shadow-2xl z-50"
         style={{
           width: "min(90vw, 900px)",
           background: "var(--background-primary)",
           borderLeft: "1px solid var(--border)",
         }}>
      {/* Header */}
      <div className="h-10 flex items-center gap-2 px-3 shrink-0"
           style={{ borderBottom: "1px solid var(--border)" }}>
        <BookOpen size={15} style={{ color: "var(--accent)" }} />
        <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
          {t("docsPanel.header.title")}
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
          {t("docsPanel.header.subtitle")}
        </span>
        {selectedPath && (
          <span className="text-[11px] font-mono ml-2 truncate" style={{ color: "var(--text-secondary)" }}>
            {selectedPath.replace(/^docs\//, "")}
          </span>
        )}
        <span className="flex-1" />
        {hasContent && (
          <span className="text-[10px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
            {highlightedLines.length} {t("docsPanel.lines")}
          </span>
        )}
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/[0.06]"
          style={{ color: "var(--text-tertiary)" }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Three-column body */}
      <div className="flex flex-1 min-h-0">
        {/* Left: 文档导航 */}
        <div className="flex flex-col shrink-0 overflow-hidden" style={{ width: `${leftPane.width}px` }}>
          {/* Search */}
          <div className="px-2 pt-2 pb-1 shrink-0">
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px]"
              style={{ background: "var(--background-tertiary)", border: "1px solid var(--border)" }}
            >
              <Search size={11} style={{ color: "var(--text-tertiary)" }} className="shrink-0" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t("docsPanel.search")}
                className="flex-1 bg-transparent outline-none text-[11px]"
                style={{ color: "var(--text-primary)" }}
              />
              {filter && (
                <button onClick={() => setFilter("")} className="shrink-0" style={{ color: "var(--text-tertiary)" }}>
                  <X size={10} />
                </button>
              )}
            </div>
          </div>
          {/* Tree */}
          <div className="flex-1 overflow-y-auto py-1 px-1">
            {loading ? (
              <div className="flex items-center justify-center h-24">
                <RefreshCw size={13} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
              </div>
            ) : !hasDocs ? (
              <div className="flex items-center justify-center h-24">
                <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  {t("docsPanel.noDocs")}
                </p>
              </div>
            ) : tree.length === 0 ? (
              <div className="flex items-center justify-center h-24">
                <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  {t("docsPanel.empty")}
                </p>
              </div>
            ) : (
              <DocTree
                nodes={tree}
                selectedPath={selectedPath}
                filter={filter}
                onSelect={loadContent}
              />
            )}
          </div>
          {/* Footer */}
          <div className="px-3 py-1.5 shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
            <p className="text-[9px]" style={{ color: "var(--text-tertiary)" }}>
              {items.length} docs
            </p>
          </div>
        </div>

        {/* Left resize handle */}
        <ResizeHandle onMouseDown={leftPane.onMouseDown} />

        {/* Center: 文档内容查看器 */}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {!selectedPath && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center" style={{ color: "var(--text-tertiary)" }}>
                <BookOpen size={32} className="mx-auto mb-2" strokeWidth={1.2} />
                <p className="text-[12px]">{t("docsPanel.selectDoc")}</p>
              </div>
            </div>
          )}
          {selectedPath && docLoading && (
            <div className="flex-1 flex items-center justify-center">
              <RefreshCw size={16} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
            </div>
          )}
          {selectedPath && !docLoading && docContent == null && (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                {t("files.loadError")}
              </p>
            </div>
          )}
          {hasContent && (
            <div
              ref={contentRef}
              className="flex-1 overflow-auto"
              onScroll={handleScroll}
            >
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
                          className="px-4 py-0 whitespace-pre-wrap hljs"
                          dangerouslySetInnerHTML={{ __html: html || " " }}
                        />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right resize handle + 文章导航 */}
        {showOutline && (
          <>
            <ResizeHandle onMouseDown={rightPane.onMouseDown} />
            <div className="shrink-0 overflow-hidden" style={{ width: `${rightPane.width}px` }}>
              <TocNav headings={headings} activeLine={scrollLine} onJump={jumpToLine} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
