import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FileText,
  FileJson,
  File,
  Search,
  X,
  RefreshCw,
  ArrowLeft,
  BookOpen,
} from "lucide-react";
import hljs from "highlight.js";
import "../styles/hljs-ayu-dark.css";
import { api, type FileItem } from "../lib/api";
import { cn } from "../lib/utils";

function getExt(name: string) {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

function DocIcon({ name }: { name: string }) {
  const ext = getExt(name);
  if (ext === "md" || ext === "rst" || ext === "txt")
    return <FileText size={14} className="shrink-0 text-blue-400" />;
  if (ext === "json" || ext === "yaml" || ext === "yml" || ext === "toml")
    return <FileJson size={14} className="shrink-0 text-yellow-400" />;
  return <File size={14} className="shrink-0" style={{ color: "var(--text-tertiary)" }} />;
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
    try {
      const res = await api.projects.docContent(projectId, path);
      setDocContent(res.content);
    } catch {
      setDocContent(null);
    } finally {
      setDocLoading(false);
    }
  }, [projectId]);

  const filtered = useMemo(() => {
    if (!filter) return items;
    const q = filter.toLowerCase();
    return items.filter(
      (it) => it.name.toLowerCase().includes(q) || it.path.toLowerCase().includes(q)
    );
  }, [items, filter]);

  const selectedName = selectedPath?.split("/").pop() || "";
  const selectedLang = selectedName ? detectLang(selectedName) : "";

  const highlightedLines = useMemo(() => {
    if (!docContent) return [];
    try {
      const lang = selectedLang;
      const hljsLang = lang === "plaintext" ? undefined : lang;
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

  return (
    <div className="fixed inset-y-0 right-0 w-[520px] flex flex-col shadow-2xl z-50"
         style={{ background: "var(--background-primary)", borderLeft: "1px solid var(--border)" }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3 shrink-0"
           style={{ borderBottom: "1px solid var(--border)" }}>
        {selectedPath ? (
          <button
            onClick={() => { setSelectedPath(null); setDocContent(null); }}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/[0.06]"
            style={{ color: "var(--text-tertiary)" }}
          >
            <ArrowLeft size={14} />
          </button>
        ) : (
          <BookOpen size={16} style={{ color: "var(--accent)" }} />
        )}
        <div className="flex-1 min-w-0">
          {selectedPath ? (
            <p className="text-[12.5px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
              {selectedPath.replace(/^docs\//, "")}
            </p>
          ) : (
            <>
              <h2 className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                {t("docsPanel.header.title")}
              </h2>
              <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                {t("docsPanel.header.subtitle")}
              </p>
            </>
          )}
        </div>
        {selectedPath && docContent && (
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

      {/* List view */}
      {!selectedPath && (
        <>
          {/* Search */}
          <div className="px-3 py-2 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
            <div
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[12px]"
              style={{ background: "var(--background-tertiary)", border: "1px solid var(--border)" }}
            >
              <Search size={12} style={{ color: "var(--text-tertiary)" }} className="shrink-0" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t("docsPanel.search")}
                className="flex-1 bg-transparent outline-none text-[12px]"
                style={{ color: "var(--text-primary)" }}
              />
              {filter && (
                <button onClick={() => setFilter("")} className="shrink-0" style={{ color: "var(--text-tertiary)" }}>
                  <X size={11} />
                </button>
              )}
            </div>
          </div>

          {/* Doc list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <RefreshCw size={14} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
              </div>
            ) : !hasDocs ? (
              <div className="flex items-center justify-center h-32">
                <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                  {t("docsPanel.noDocs")}
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center h-32">
                <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                  {filter ? t("docsPanel.noMatch") : t("docsPanel.empty")}
                </p>
              </div>
            ) : (
              <div className="py-1 px-1">
                {filtered.map((item) => {
                  const relPath = item.path.replace(/^docs\//, "");
                  const dirPart = relPath.includes("/")
                    ? relPath.slice(0, relPath.lastIndexOf("/") + 1)
                    : "";
                  return (
                    <button
                      key={item.path}
                      onClick={() => loadContent(item.path)}
                      className="w-full flex items-center gap-2 py-2 px-3 text-[12.5px] rounded-md text-left hover:bg-white/[0.04] transition-colors group"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <DocIcon name={item.name} />
                      <span className="truncate flex-1">
                        {dirPart && (
                          <span style={{ color: "var(--text-tertiary)" }}>{dirPart}</span>
                        )}
                        {item.name}
                      </span>
                      {item.size != null && (
                        <span className="text-[10px] opacity-0 group-hover:opacity-60 shrink-0 tabular-nums">
                          {formatSize(item.size)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
            <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
              {items.length} docs
            </p>
          </div>
        </>
      )}

      {/* Content view */}
      {selectedPath && (
        <div className="flex-1 overflow-auto">
          {docLoading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw size={14} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
            </div>
          ) : docContent == null ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                {t("files.loadError")}
              </p>
            </div>
          ) : (
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
          )}
        </div>
      )}
    </div>
  );
}
