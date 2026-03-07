// frontend/src/components/ConvTranscript.tsx
import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { TranscriptMessage, TranscriptBlock } from "../lib/api";

// ── Markdown 组件（紧凑版）───────────────────────────────────
const mdComponents: Components = {
  p:      ({ children }) => <p className="mb-1 last:mb-0 leading-relaxed">{children}</p>,
  h1:     ({ children }) => <h1 className="text-[13px] font-bold mb-1 mt-2">{children}</h1>,
  h2:     ({ children }) => <h2 className="text-[13px] font-bold mb-1 mt-1.5">{children}</h2>,
  h3:     ({ children }) => <h3 className="text-[12px] font-semibold mb-0.5 mt-1">{children}</h3>,
  ul:     ({ children }) => <ul className="list-disc pl-4 mb-1 space-y-0.5">{children}</ul>,
  ol:     ({ children }) => <ol className="list-decimal pl-4 mb-1 space-y-0.5">{children}</ol>,
  li:     ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold" style={{ color: "var(--text-primary)" }}>{children}</strong>,
  em:     ({ children }) => <em className="italic opacity-90">{children}</em>,
  code:   ({ children, className }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className="block text-[11px] font-mono px-3 py-2 rounded my-1 overflow-x-auto whitespace-pre"
              style={{ background: "rgba(0,0,0,0.3)", color: "#bfbdb6", border: "1px solid var(--border)" }}>
          {children}
        </code>
      );
    }
    return (
      <code className="text-[11px] font-mono px-1 py-0.5 rounded"
            style={{ background: "rgba(0,0,0,0.3)", color: "#ffb454" }}>
        {children}
      </code>
    );
  },
  pre:    ({ children }) => <pre className="my-1 overflow-x-auto">{children}</pre>,
  blockquote: ({ children }) => (
    <blockquote className="pl-3 my-1 italic opacity-80"
                style={{ borderLeft: "3px solid var(--border)" }}>
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2 opacity-20" style={{ borderColor: "var(--border)" }} />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="underline underline-offset-2 opacity-80 hover:opacity-100"
       style={{ color: "#59c2ff" }}>
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-1">
      <table className="text-[11px] border-collapse w-full">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="px-2 py-1 text-left font-semibold"
        style={{ border: "1px solid var(--border)", background: "rgba(255,255,255,0.03)" }}>
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-2 py-1" style={{ border: "1px solid var(--border)" }}>{children}</td>
  ),
};

// ── 工具颜色映射 ─────────────────────────────────────────────
const TOOL_COLORS: Record<string, string> = {
  Read:       "#58a6ff",
  Write:      "#3fb950",
  Edit:       "#d29922",
  MultiEdit:  "#d29922",
  Bash:       "#bc8cff",
  Grep:       "#f0883e",
  Glob:       "#39d2c0",
  WebSearch:  "#56d4dd",
  WebFetch:   "#56d4dd",
  Agent:      "#bc8cff",
  TodoWrite:  "#d2a6ff",
  TodoRead:   "#d2a6ff",
  NotebookEdit: "#d29922",
};
const DEFAULT_COLOR = "#8b949e";

function getToolColor(name: string | null | undefined) {
  if (!name) return DEFAULT_COLOR;
  return TOOL_COLORS[name] ?? DEFAULT_COLOR;
}

// ── 工具摘要（CLI 风格）─────────────────────────────────────
function toolLabel(name: string | null | undefined, input: Record<string, unknown> | null | undefined): string {
  if (!name) return "Tool";
  if (!input) return name;

  switch (name) {
    case "Bash": {
      const cmd = String(input.command || "").trim();
      return cmd ? `Bash(${cmd.length > 100 ? cmd.slice(0, 100) + "…" : cmd})` : "Bash";
    }
    case "Read": {
      const fp = String(input.file_path || "");
      const short = fp.split("/").pop() || fp;
      return short ? `Read(${short})` : "Read";
    }
    case "Write": {
      const fp = String(input.file_path || "");
      const short = fp.split("/").pop() || fp;
      return short ? `Write(${short})` : "Write";
    }
    case "Edit": case "MultiEdit": {
      const fp = String(input.file_path || "");
      const short = fp.split("/").pop() || fp;
      return short ? `Update(${short})` : "Update";
    }
    case "Glob":
      return `Glob(${String(input.pattern || "")})`;
    case "Grep":
      return `Grep("${input.pattern || ""}"${input.path ? " " + input.path : ""})`;
    case "WebSearch":
      return `WebSearch(${String(input.query || "")})`;
    case "WebFetch":
      return `WebFetch(${String(input.url || "").slice(0, 80)})`;
    case "Agent":
      return `Agent(${String(input.description || input.prompt || "").slice(0, 80)})`;
    case "TodoWrite":
      return "TodoWrite";
    case "TodoRead":
      return "TodoRead";
    default:
      return name;
  }
}

// ── Edit 差异摘要 ────────────────────────────────────────────
function editDiffSummary(input: Record<string, unknown> | null | undefined): string | null {
  if (!input) return null;
  const oldStr = String(input.old_string ?? "");
  const newStr = String(input.new_string ?? "");
  if (!oldStr && !newStr) return null;

  const oldLines = oldStr ? oldStr.split("\n").length : 0;
  const newLines = newStr ? newStr.split("\n").length : 0;
  const added = Math.max(0, newLines - oldLines);
  const removed = Math.max(0, oldLines - newLines);
  const parts: string[] = [];
  if (added > 0) parts.push(`+${added}`);
  if (removed > 0) parts.push(`-${removed}`);
  if (parts.length === 0 && oldLines > 0) parts.push(`~${oldLines} lines`);
  return parts.join(", ");
}

// ── 结果展示（可展开）────────────────────────────────────────
const RESULT_TRUNCATE = 600;

function ResultContent({ result, isError }: { result: string; isError: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncate = result.length > RESULT_TRUNCATE;
  const displayed = expanded || !needsTruncate ? result : result.slice(0, RESULT_TRUNCATE) + "…";

  return (
    <div className="mt-0.5">
      <pre className="text-[11px] font-mono whitespace-pre-wrap break-words overflow-x-auto max-h-[400px] overflow-y-auto leading-[1.5]"
           style={{ color: isError ? "#f85149" : "var(--text-tertiary)", margin: 0 }}>
        {displayed}
      </pre>
      {needsTruncate && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-[10px] mt-0.5 hover:underline"
          style={{ color: "var(--accent)" }}>
          {expanded ? "收起" : `展开全部 (${result.length} 字符)`}
        </button>
      )}
    </div>
  );
}

// ── 工具调用行（CLI 风格 ● ToolName(summary)）──────────────
function ToolLine({ block }: { block: TranscriptBlock }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen(v => !v), []);

  const color = getToolColor(block.tool_name);
  const label = toolLabel(block.tool_name, block.tool_input);
  const hasResult = block.tool_result != null && block.tool_result !== "";
  const isError = block.tool_error === true;
  const isEdit = block.tool_name === "Edit" || block.tool_name === "MultiEdit";
  const diffInfo = isEdit ? editDiffSummary(block.tool_input) : null;

  // Determine result summary for collapsed view
  const resultPreview = hasResult
    ? block.tool_result!.split("\n").slice(0, 2).join(" ").slice(0, 120)
    : null;

  return (
    <div className="group">
      {/* ● 工具名(摘要) */}
      <button
        onClick={toggle}
        className="flex items-start gap-2 w-full text-left py-0.5 hover:bg-white/[0.02] rounded px-1 -mx-1 transition-colors"
      >
        {/* ● 圆点 */}
        <span className="shrink-0 text-[10px] mt-[3px] leading-none" style={{ color }}>●</span>
        {/* 工具标签 */}
        <span className="flex-1 min-w-0">
          <span className="text-[12px] font-mono" style={{ color }}>
            {label}
          </span>
          {/* Edit 差异信息 */}
          {diffInfo && (
            <span className="text-[10px] ml-1.5 font-mono" style={{ color: "var(--text-tertiary)" }}>
              ({diffInfo})
            </span>
          )}
          {/* 错误标记 */}
          {isError && (
            <span className="text-[10px] ml-1.5 font-mono" style={{ color: "#f85149" }}>ERROR</span>
          )}
        </span>
        {/* 展开箭头 */}
        {hasResult && (
          <span className="shrink-0 text-[9px] mt-[3px] opacity-40 transition-transform"
                style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
            ▶
          </span>
        )}
      </button>

      {/* ⎿ 结果预览（折叠时） */}
      {!open && hasResult && resultPreview && (
        <div className="flex items-start gap-2 pl-1">
          <span className="shrink-0 text-[12px] leading-none mt-[1px]" style={{ color: "var(--border)" }}>⎿</span>
          <span className="text-[11px] font-mono truncate" style={{ color: "var(--text-tertiary)" }}>
            {resultPreview}
          </span>
        </div>
      )}

      {/* ⎿ 结果详情（展开时）*/}
      {open && hasResult && (
        <div className="flex items-start gap-2 pl-1">
          <span className="shrink-0 text-[12px] leading-none mt-[1px]" style={{ color: "var(--border)" }}>⎿</span>
          <div className="flex-1 min-w-0">
            <ResultContent result={block.tool_result!} isError={isError} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── 用户消息行（❯ prompt）───────────────────────────────────
function UserLine({ msg }: { msg: TranscriptMessage }) {
  const text = msg.blocks.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
  if (!text) return null;

  return (
    <div className="flex items-start gap-2 py-1">
      <span className="shrink-0 text-[13px] font-bold mt-[1px]" style={{ color: "#59c2ff" }}>❯</span>
      <div className="flex-1 min-w-0 text-[12px] leading-relaxed" style={{ color: "#e6e1cf" }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {text}
        </ReactMarkdown>
      </div>
    </div>
  );
}

// ── 助手消息块（文本 + 工具调用）─────────────────────────────
function AssistantBlock({ msg }: { msg: TranscriptMessage }) {
  return (
    <div className="space-y-0.5">
      {msg.blocks.map((block, i) =>
        block.type === "text" ? (
          <div key={i} className="text-[12px] leading-relaxed py-0.5"
               style={{ color: "var(--text-primary)" }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {block.text ?? ""}
            </ReactMarkdown>
          </div>
        ) : (
          <ToolLine key={i} block={block} />
        )
      )}
    </div>
  );
}

// ── 时间分隔符 ──────────────────────────────────────────────
function TimeSeparator({ ts }: { ts: string }) {
  const d = new Date(ts);
  const time = d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="flex-1 h-px" style={{ background: "var(--border)", opacity: 0.3 }} />
      <span className="text-[9px] font-mono shrink-0" style={{ color: "var(--text-tertiary)", opacity: 0.5 }}>
        {time}
      </span>
      <div className="flex-1 h-px" style={{ background: "var(--border)", opacity: 0.3 }} />
    </div>
  );
}

// ── 主组件 ──────────────────────────────────────────────────
interface Props {
  messages: TranscriptMessage[];
  loading: boolean;
  fileFound: boolean;
}

export function ConvTranscript({ messages, loading, fileFound }: Props) {
  const { t } = useTranslation();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[12px]"
           style={{ color: "var(--text-tertiary)" }}>{t('convTranscript.loading')}</div>
    );
  }

  if (!fileFound) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2"
           style={{ color: "var(--text-tertiary)" }}>
        <span className="text-2xl">📂</span>
        <p className="text-[12px]">{t('convTranscript.fileNotExist')}</p>
        <p className="text-[10px] opacity-60">{t('convTranscript.maybeDeleted')}</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3"
           style={{ color: "var(--text-tertiary)" }}>
        <span className="text-3xl">💬</span>
        <p className="text-[12px]">{t('convTranscript.selectHint')}</p>
      </div>
    );
  }

  // Group consecutive messages and insert time separators
  let lastTs = "";

  return (
    <div className="px-5 py-3 space-y-1 font-[system-ui]" style={{ maxWidth: 860, margin: "0 auto" }}>
      {messages.map((msg, i) => {
        const showTime = msg.ts && msg.ts !== lastTs;
        if (msg.ts) lastTs = msg.ts;

        return (
          <div key={i}>
            {showTime && msg.ts && <TimeSeparator ts={msg.ts} />}
            {msg.role === "user"
              ? <UserLine msg={msg} />
              : <AssistantBlock msg={msg} />
            }
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
