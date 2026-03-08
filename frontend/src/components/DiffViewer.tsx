import { useMemo, useState } from "react";
import { Columns2, List } from "lucide-react";
import hljs from "highlight.js";
import "../styles/hljs-ayu-dark.css";

/* ── Types ─────────────────────────────────────── */

interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  header: string;
  lines: DiffLine[];
}

interface DiffLine {
  type: "add" | "del" | "ctx";
  content: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface DiffViewerProps {
  diff: string;
  fileName?: string;
}

/* ── Parser ────────────────────────────────────── */

function parseDiff(raw: string): DiffHunk[] {
  const lines = raw.split("\n");
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    // Skip file headers
    if (line.startsWith("---") || line.startsWith("+++")) continue;
    // Skip diff command line
    if (line.startsWith("diff ") || line.startsWith("index ")) continue;

    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
    if (hunkMatch) {
      current = {
        oldStart: parseInt(hunkMatch[1]),
        oldCount: parseInt(hunkMatch[2] ?? "1"),
        newStart: parseInt(hunkMatch[3]),
        newCount: parseInt(hunkMatch[4] ?? "1"),
        header: line,
        lines: [],
      };
      oldLine = current.oldStart;
      newLine = current.newStart;
      hunks.push(current);
      continue;
    }

    if (!current) continue;

    if (line.startsWith("-")) {
      current.lines.push({ type: "del", content: line.slice(1), oldLine: oldLine++, newLine: null });
    } else if (line.startsWith("+")) {
      current.lines.push({ type: "add", content: line.slice(1), oldLine: null, newLine: newLine++ });
    } else {
      // Context line (starts with space) or empty line within hunk
      const content = line.startsWith(" ") ? line.slice(1) : line;
      current.lines.push({ type: "ctx", content, oldLine: oldLine++, newLine: newLine++ });
    }
  }

  return hunks;
}

/* ── Syntax highlight helper ───────────────────── */

function detectLangFromName(name: string): string | undefined {
  const ext = name.lastIndexOf(".") > 0 ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  const map: Record<string, string> = {
    js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
    py: "python", java: "java", c: "c", cpp: "cpp", h: "c", hpp: "cpp",
    go: "go", rs: "rust", rb: "ruby", php: "php", sh: "bash", bash: "bash",
    zsh: "bash", json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
    xml: "xml", html: "html", htm: "html", css: "css", scss: "scss",
    md: "markdown", sql: "sql", graphql: "graphql",
  };
  return map[ext];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightLine(content: string, lang: string | undefined): string {
  if (!content) return " ";
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(content, { language: lang }).value;
    }
    return escapeHtml(content);
  } catch {
    return escapeHtml(content);
  }
}

/* ── Line number cell style ────────────────────── */
const lnStyle: React.CSSProperties = {
  color: "#636d77",
  borderRight: "1px solid var(--border)",
};

/* ── Component ─────────────────────────────────── */

export default function DiffViewer({ diff, fileName }: DiffViewerProps) {
  const [mode, setMode] = useState<"inline" | "split">("inline");

  const hunks = useMemo(() => parseDiff(diff), [diff]);
  const lang = useMemo(() => (fileName ? detectLangFromName(fileName) : undefined), [fileName]);

  // Empty state
  if (!diff.trim()) {
    return (
      <div className="flex items-center justify-center h-full min-h-[120px]">
        <span className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
          No changes
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col font-mono text-[12px] leading-[1.65]">
      {/* Header bar */}
      <div
        className="flex items-center justify-between h-9 px-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span className="text-[12px] truncate" style={{ color: "var(--text-secondary)" }}>
          {fileName || "diff"}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setMode("inline")}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/[0.06]"
            style={{ color: mode === "inline" ? "var(--accent)" : "var(--text-tertiary)" }}
            title="Inline"
          >
            <List size={14} />
          </button>
          <button
            onClick={() => setMode("split")}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/[0.06]"
            style={{ color: mode === "split" ? "var(--accent)" : "var(--text-tertiary)" }}
            title="Side by side"
          >
            <Columns2 size={14} />
          </button>
        </div>
      </div>

      {/* Diff content */}
      <div className="overflow-auto">
        {mode === "inline" ? (
          <InlineView hunks={hunks} lang={lang} />
        ) : (
          <SplitView hunks={hunks} lang={lang} />
        )}
      </div>
    </div>
  );
}

/* ── Inline (unified) view ─────────────────────── */

function InlineView({ hunks, lang }: { hunks: DiffHunk[]; lang: string | undefined }) {
  return (
    <table className="w-full border-collapse">
      <tbody>
        {hunks.map((hunk, hi) => (
          <HunkRows key={hi} hunk={hunk} lang={lang} />
        ))}
      </tbody>
    </table>
  );
}

function HunkRows({ hunk, lang }: { hunk: DiffHunk; lang: string | undefined }) {
  return (
    <>
      {/* Hunk header */}
      <tr>
        <td
          colSpan={3}
          className="px-3 py-0.5 text-[11px] select-none bg-blue-500/[0.08] text-blue-400"
        >
          {hunk.header}
        </td>
      </tr>
      {hunk.lines.map((line, li) => {
        const bgClass =
          line.type === "add" ? "bg-emerald-500/10" :
          line.type === "del" ? "bg-red-500/10" : "";
        const prefix =
          line.type === "add" ? "+" :
          line.type === "del" ? "-" : " ";
        const prefixColor =
          line.type === "add" ? "text-emerald-300" :
          line.type === "del" ? "text-red-300" : "";

        return (
          <tr key={li} className={bgClass}>
            <td className="text-right select-none px-2 py-0 w-[1%] whitespace-nowrap align-top" style={lnStyle}>
              {line.oldLine ?? ""}
            </td>
            <td className="text-right select-none px-2 py-0 w-[1%] whitespace-nowrap align-top" style={lnStyle}>
              {line.newLine ?? ""}
            </td>
            <td className="px-3 py-0 whitespace-pre">
              <span className={`select-none ${prefixColor}`}>{prefix}</span>
              <span
                className="hljs"
                dangerouslySetInnerHTML={{ __html: highlightLine(line.content, lang) }}
              />
            </td>
          </tr>
        );
      })}
    </>
  );
}

/* ── Side-by-side view ─────────────────────────── */

interface SplitPair {
  left: DiffLine | null;
  right: DiffLine | null;
}

function buildSplitPairs(lines: DiffLine[]): SplitPair[] {
  const pairs: SplitPair[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.type === "ctx") {
      pairs.push({ left: line, right: line });
      i++;
    } else if (line.type === "del") {
      // Collect consecutive del lines
      const dels: DiffLine[] = [];
      while (i < lines.length && lines[i].type === "del") {
        dels.push(lines[i]);
        i++;
      }
      // Collect consecutive add lines that follow
      const adds: DiffLine[] = [];
      while (i < lines.length && lines[i].type === "add") {
        adds.push(lines[i]);
        i++;
      }
      // Pair them up
      const maxLen = Math.max(dels.length, adds.length);
      for (let j = 0; j < maxLen; j++) {
        pairs.push({
          left: j < dels.length ? dels[j] : null,
          right: j < adds.length ? adds[j] : null,
        });
      }
    } else if (line.type === "add") {
      // Add without preceding del
      pairs.push({ left: null, right: line });
      i++;
    } else {
      i++;
    }
  }

  return pairs;
}

function SplitView({ hunks, lang }: { hunks: DiffHunk[]; lang: string | undefined }) {
  return (
    <table className="w-full border-collapse">
      <tbody>
        {hunks.map((hunk, hi) => (
          <SplitHunkRows key={hi} hunk={hunk} lang={lang} />
        ))}
      </tbody>
    </table>
  );
}

function SplitHunkRows({ hunk, lang }: { hunk: DiffHunk; lang: string | undefined }) {
  const pairs = useMemo(() => buildSplitPairs(hunk.lines), [hunk.lines]);

  return (
    <>
      {/* Hunk header */}
      <tr>
        <td
          colSpan={4}
          className="px-3 py-0.5 text-[11px] select-none bg-blue-500/[0.08] text-blue-400"
        >
          {hunk.header}
        </td>
      </tr>
      {pairs.map((pair, pi) => {
        const leftBg =
          pair.left?.type === "del" ? "bg-red-500/10" : "";
        const rightBg =
          pair.right?.type === "add" ? "bg-emerald-500/10" : "";

        return (
          <tr key={pi}>
            {/* Left side */}
            <td
              className={`text-right select-none px-2 py-0 w-[1%] whitespace-nowrap align-top ${leftBg}`}
              style={lnStyle}
            >
              {pair.left?.oldLine ?? ""}
            </td>
            <td
              className={`px-3 py-0 whitespace-pre w-1/2 ${leftBg}`}
              style={{ borderRight: "1px solid var(--border)" }}
            >
              {pair.left ? (
                <>
                  {pair.left.type === "del" && (
                    <span className="select-none text-red-300">-</span>
                  )}
                  {pair.left.type === "ctx" && (
                    <span className="select-none"> </span>
                  )}
                  <span
                    className="hljs"
                    dangerouslySetInnerHTML={{ __html: highlightLine(pair.left.content, lang) }}
                  />
                </>
              ) : (
                <span>&nbsp;</span>
              )}
            </td>
            {/* Right side */}
            <td
              className={`text-right select-none px-2 py-0 w-[1%] whitespace-nowrap align-top ${rightBg}`}
              style={lnStyle}
            >
              {pair.right?.newLine ?? ""}
            </td>
            <td className={`px-3 py-0 whitespace-pre w-1/2 ${rightBg}`}>
              {pair.right ? (
                <>
                  {pair.right.type === "add" && (
                    <span className="select-none text-emerald-300">+</span>
                  )}
                  {pair.right.type === "ctx" && (
                    <span className="select-none"> </span>
                  )}
                  <span
                    className="hljs"
                    dangerouslySetInnerHTML={{ __html: highlightLine(pair.right.content, lang) }}
                  />
                </>
              ) : (
                <span>&nbsp;</span>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}
