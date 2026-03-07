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
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "../styles/hljs-ayu-dark.css";
import "../styles/markdown-prose.css";
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

function formatSize(bytes: number | null) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Strip YAML frontmatter (--- ... ---) from markdown */
function stripFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const end = content.indexOf("\n---", 3);
  if (end === -1) return content;
  return content.slice(end + 4).trimStart();
}

/** Preprocess Docusaurus admonitions (:::tip → html blocks) */
function preprocessAdmonitions(content: string): string {
  return content.replace(
    /^:::(tip|warning|info|danger|note|caution)\s*(.*)?$\n([\s\S]*?)^:::$/gm,
    (_match, type: string, title: string, body: string) => {
      const label = (title || type).trim();
      const normalizedType = type === "caution" ? "warning" : type;
      return `<div class="md-admonition ${normalizedType}"><div class="md-admonition-title">${label}</div>\n\n${body.trim()}\n\n</div>`;
    }
  );
}

/** Generate a slug from heading text for anchor IDs */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

/* ── heading extraction for TOC ───────────────── */

interface TocHeading {
  level: number;
  text: string;
  id: string;
}

function extractTocHeadings(content: string, fileName: string): TocHeading[] {
  const ext = getExt(fileName);
  const headings: TocHeading[] = [];
  if (ext !== "md" && ext !== "txt" && ext !== "rst") return headings;

  const stripped = stripFrontmatter(content);
  for (const line of stripped.split("\n")) {
    const m = line.match(/^(#{1,6})\s+(.+)/);
    if (m) {
      const text = m[2].replace(/\s*#+\s*$/, "");
      headings.push({ level: m[1].length, text, id: slugify(text) });
    }
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
  name: string;
  displayName: string;
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
    if (node.displayName.toLowerCase().includes(filterLower)) return true;
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
          <span className="truncate flex-1" title={node.name}>{node.displayName}</span>
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
  activeId,
  onJump,
}: {
  headings: TocHeading[];
  activeId: string;
  onJump: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (headings.length === 0) return null;

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
          const isActive = h.id === activeId;
          return (
            <button
              key={`${h.id}-${i}`}
              onClick={() => onJump(h.id)}
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

/* ── Markdown Viewer ─────────────────────────── */

function MarkdownViewer({
  content,
  fileName,
  containerRef,
}: {
  content: string;
  fileName: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const ext = getExt(fileName);
  const isMarkdown = ext === "md" || ext === "txt" || ext === "rst";

  if (!isMarkdown) {
    // Non-markdown: show as preformatted text
    return (
      <div ref={containerRef} className="flex-1 overflow-auto">
        <pre className="p-4 text-[13px] font-mono whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>
          {content}
        </pre>
      </div>
    );
  }

  const processed = preprocessAdmonitions(stripFrontmatter(content));

  return (
    <div ref={containerRef} className="flex-1 overflow-auto">
      <div className="md-prose">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            // Add IDs to headings for TOC navigation
            h1: ({ children, ...props }) => <h1 id={slugify(String(children))} {...props}>{children}</h1>,
            h2: ({ children, ...props }) => <h2 id={slugify(String(children))} {...props}>{children}</h2>,
            h3: ({ children, ...props }) => <h3 id={slugify(String(children))} {...props}>{children}</h3>,
            h4: ({ children, ...props }) => <h4 id={slugify(String(children))} {...props}>{children}</h4>,
            h5: ({ children, ...props }) => <h5 id={slugify(String(children))} {...props}>{children}</h5>,
            h6: ({ children, ...props }) => <h6 id={slugify(String(children))} {...props}>{children}</h6>,
            // Hide <!-- truncate --> comments
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            hr: (props) => <hr className="md-truncate-marker" {...props} />,
          }}
        >
          {processed}
        </ReactMarkdown>
      </div>
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
  const [activeHeadingId, setActiveHeadingId] = useState("");
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
    setActiveHeadingId("");
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

  const headings = useMemo(() => {
    if (!docContent || !selectedName) return [];
    return extractTocHeadings(docContent, selectedName);
  }, [docContent, selectedName]);

  // Track active heading via IntersectionObserver
  useEffect(() => {
    const container = contentRef.current;
    if (!container || headings.length === 0) return;

    // Small delay to let markdown render
    const timer = setTimeout(() => {
      const headingEls = container.querySelectorAll("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]");
      if (headingEls.length === 0) return;

      const observer = new IntersectionObserver(
        (entries) => {
          // Find the topmost visible heading
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          if (visible.length > 0) {
            setActiveHeadingId(visible[0].target.id);
          }
        },
        { root: container, rootMargin: "-10px 0px -80% 0px", threshold: 0 }
      );

      headingEls.forEach((el) => observer.observe(el));
      return () => observer.disconnect();
    }, 100);

    return () => clearTimeout(timer);
  }, [docContent, headings]);

  const jumpToHeading = useCallback((id: string) => {
    const container = contentRef.current;
    if (!container) return;
    const el = container.querySelector(`#${CSS.escape(id)}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveHeadingId(id);
    }
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
            <MarkdownViewer
              content={docContent}
              fileName={selectedName}
              containerRef={contentRef}
            />
          )}
        </div>

        {/* Right resize handle + 文章导航 */}
        {showOutline && (
          <>
            <ResizeHandle onMouseDown={rightPane.onMouseDown} />
            <div className="shrink-0 overflow-hidden" style={{ width: `${rightPane.width}px` }}>
              <TocNav headings={headings} activeId={activeHeadingId} onJump={jumpToHeading} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
