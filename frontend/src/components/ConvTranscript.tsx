// frontend/src/components/ConvTranscript.tsx
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
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
    default:
      return name;
  }
}

// ── 简单 diff 算法 ──────────────────────────────────────────
interface DiffLine {
  type: "added" | "removed" | "unchanged";
  text: string;
  oldNum?: number;
  newNum?: number;
}

function computeDiff(oldStr: string, newStr: string): { lines: DiffLine[]; added: number; removed: number } {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const result: DiffLine[] = [];
  let added = 0, removed = 0;

  // Simple LCS-based diff
  const m = oldLines.length, n = newLines.length;

  // For performance, if both are large, use a simpler approach
  if (m + n > 500) {
    // Fallback: show all old as removed, all new as added
    let oldNum = 1;
    for (const line of oldLines) {
      result.push({ type: "removed", text: line, oldNum: oldNum++ });
      removed++;
    }
    let newNum = 1;
    for (const line of newLines) {
      result.push({ type: "added", text: line, newNum: newNum++ });
      added++;
    }
    return { lines: result, added, removed };
  }

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  const diffParts: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diffParts.push({ type: "unchanged", text: oldLines[i - 1], oldNum: i, newNum: j });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diffParts.push({ type: "added", text: newLines[j - 1], newNum: j });
      added++;
      j--;
    } else {
      diffParts.push({ type: "removed", text: oldLines[i - 1], oldNum: i });
      removed++;
      i--;
    }
  }

  diffParts.reverse();

  // Collapse long unchanged regions (>4 lines) into context
  let contextLines = 0;
  for (const d of diffParts) {
    if (d.type === "unchanged") {
      contextLines++;
    } else {
      contextLines = 0;
    }
    result.push(d);
  }

  return { lines: result, added, removed };
}

// ── Edit Diff 视图组件 ──────────────────────────────────────
function EditDiffView({ input }: { input: Record<string, unknown> }) {
  const oldStr = String(input.old_string ?? "");
  const newStr = String(input.new_string ?? "");
  const filePath = String(input.file_path ?? "");
  const shortPath = filePath.split("/").pop() || filePath;

  const { lines, added, removed } = useMemo(() => computeDiff(oldStr, newStr), [oldStr, newStr]);

  // Collapse runs of >3 unchanged lines into a "... N unchanged lines ..." divider
  const rendered: (DiffLine | { type: "collapse"; count: number })[] = [];
  let unchangedRun: DiffLine[] = [];

  const flushUnchanged = () => {
    if (unchangedRun.length <= 3) {
      rendered.push(...unchangedRun);
    } else {
      rendered.push(unchangedRun[0]);
      rendered.push({ type: "collapse", count: unchangedRun.length - 2 });
      rendered.push(unchangedRun[unchangedRun.length - 1]);
    }
    unchangedRun = [];
  };

  for (const line of lines) {
    if (line.type === "unchanged") {
      unchangedRun.push(line);
    } else {
      if (unchangedRun.length > 0) flushUnchanged();
      rendered.push(line);
    }
  }
  if (unchangedRun.length > 0) flushUnchanged();

  return (
    <div className="my-1.5 rounded-lg overflow-hidden text-[11px] font-mono"
         style={{ border: "1px solid var(--border)" }}>
      {/* 头部：文件名 + 统计 */}
      <div className="flex items-center gap-2 px-3 py-1.5"
           style={{ background: "rgba(210,153,34,0.08)", borderBottom: "1px solid var(--border)" }}>
        <span style={{ color: "#d29922" }}>✎</span>
        <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{shortPath}</span>
        <span className="flex-1" />
        {added > 0 && <span style={{ color: "#3fb950" }}>+{added}</span>}
        {removed > 0 && <span style={{ color: "#f85149" }}>-{removed}</span>}
      </div>
      {/* Diff 内容 */}
      <div className="overflow-x-auto max-h-[440px] overflow-y-auto"
           style={{ background: "#0d1117" }}>
        {rendered.map((item, idx) => {
          if ("count" in item) {
            return (
              <div key={idx} className="px-4 py-0.5 text-center text-[10px]"
                   style={{ background: "rgba(255,255,255,0.02)", color: "var(--text-tertiary)", borderTop: "1px solid rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                ⋯ {item.count} unchanged lines ⋯
              </div>
            );
          }
          const bg = item.type === "added"
            ? "rgba(63,185,80,0.10)"
            : item.type === "removed"
            ? "rgba(248,81,73,0.10)"
            : "transparent";
          const numColor = item.type === "added"
            ? "rgba(63,185,80,0.5)"
            : item.type === "removed"
            ? "rgba(248,81,73,0.5)"
            : "rgba(255,255,255,0.15)";
          const textColor = item.type === "added"
            ? "#aff5b4"
            : item.type === "removed"
            ? "#ffa198"
            : "#8b949e";
          const sign = item.type === "added" ? "+" : item.type === "removed" ? "-" : " ";
          const lineNum = item.type === "removed" ? item.oldNum : item.newNum;

          return (
            <div key={idx} className="flex leading-[1.6]" style={{ background: bg }}>
              {/* 行号 */}
              <span className="w-[40px] text-right pr-2 select-none shrink-0"
                    style={{ color: numColor }}>
                {lineNum ?? ""}
              </span>
              {/* +/- 标记 */}
              <span className="w-[16px] text-center select-none shrink-0"
                    style={{ color: item.type === "added" ? "#3fb950" : item.type === "removed" ? "#f85149" : "transparent" }}>
                {sign}
              </span>
              {/* 代码内容 */}
              <span className="flex-1 whitespace-pre" style={{ color: textColor }}>
                {item.text || " "}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Bash 结果块 ─────────────────────────────────────────────
function BashResultBlock({ command, result, isError }: { command: string; result: string; isError: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const lines = result.split("\n");
  const isLong = lines.length > 12;
  const displayed = expanded || !isLong ? result : lines.slice(0, 8).join("\n") + "\n…";

  return (
    <div className="my-1.5 rounded-lg overflow-hidden text-[11px] font-mono"
         style={{ border: `1px solid ${isError ? "rgba(248,81,73,0.3)" : "var(--border)"}` }}>
      {/* 命令头 */}
      <div className="flex items-center gap-1.5 px-3 py-1.5"
           style={{ background: "rgba(188,140,255,0.06)", borderBottom: "1px solid var(--border)" }}>
        <span style={{ color: "#bc8cff", fontWeight: 600 }}>$</span>
        <span className="flex-1 truncate" style={{ color: "var(--text-secondary)" }}>{command}</span>
      </div>
      {/* 输出 */}
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto" style={{ background: "#0d1117" }}>
        <pre className="px-3 py-2 whitespace-pre-wrap break-words leading-[1.5]"
             style={{ color: isError ? "#ffa198" : "#8b949e", margin: 0 }}>
          {displayed}
        </pre>
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full px-3 py-1 text-[10px] text-left hover:bg-white/[0.02]"
          style={{ color: "var(--accent)", borderTop: "1px solid var(--border)" }}>
          {expanded ? "收起" : `展开全部 (${lines.length} 行)`}
        </button>
      )}
    </div>
  );
}

// ── Read 结果块 ─────────────────────────────────────────────
function ReadResultBlock({ result, isError }: { result: string; isError: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const lines = result.split("\n");
  const isLong = lines.length > 15;
  const displayed = expanded || !isLong ? result : lines.slice(0, 10).join("\n") + "\n…";

  return (
    <div className="my-1.5 rounded-lg overflow-hidden text-[11px] font-mono"
         style={{ border: `1px solid ${isError ? "rgba(248,81,73,0.3)" : "var(--border)"}` }}>
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto" style={{ background: "#0d1117" }}>
        <pre className="px-3 py-2 whitespace-pre-wrap break-words leading-[1.5]"
             style={{ color: isError ? "#ffa198" : "#8b949e", margin: 0 }}>
          {displayed}
        </pre>
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full px-3 py-1 text-[10px] text-left hover:bg-white/[0.02]"
          style={{ color: "var(--accent)", borderTop: "1px solid var(--border)" }}>
          {expanded ? "收起" : `展开全部 (${lines.length} 行)`}
        </button>
      )}
    </div>
  );
}

// ── 通用结果块 ──────────────────────────────────────────────
function GenericResultBlock({ result, isError }: { result: string; isError: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncate = result.length > 600;
  const displayed = expanded || !needsTruncate ? result : result.slice(0, 600) + "…";

  return (
    <div className="mt-0.5">
      <pre className="text-[11px] font-mono whitespace-pre-wrap break-words overflow-x-auto max-h-[400px] overflow-y-auto leading-[1.5]"
           style={{ color: isError ? "#ffa198" : "var(--text-tertiary)", margin: 0 }}>
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
  if (added > 0 || newLines > 0) parts.push(`Added ${added || newLines} line${(added || newLines) > 1 ? "s" : ""}`);
  if (removed > 0 || oldLines > 0) parts.push(`removed ${removed || oldLines} line${(removed || oldLines) > 1 ? "s" : ""}`);
  return parts.join(", ");
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
  const isBash = block.tool_name === "Bash";
  const isRead = block.tool_name === "Read";
  const hasEditData = isEdit && block.tool_input && (block.tool_input.old_string || block.tool_input.new_string);
  const diffInfo = isEdit ? editDiffSummary(block.tool_input) : null;
  const bashCmd = isBash ? String(block.tool_input?.command ?? "") : "";
  const hasExpandable = hasResult || hasEditData;

  return (
    <div className="group">
      {/* ● 工具名(摘要) */}
      <button
        onClick={hasExpandable ? toggle : undefined}
        className={`flex items-start gap-2 w-full text-left py-0.5 rounded px-1 -mx-1 transition-colors ${hasExpandable ? "hover:bg-white/[0.02] cursor-pointer" : "cursor-default"}`}
      >
        {/* ● 圆点 */}
        <span className="shrink-0 text-[10px] mt-[3px] leading-none" style={{ color }}>●</span>
        {/* 工具标签 */}
        <span className="flex-1 min-w-0">
          <span className="text-[12px] font-mono" style={{ color }}>
            {label}
          </span>
          {/* 错误标记 */}
          {isError && (
            <span className="text-[10px] ml-1.5 font-mono px-1.5 py-0.5 rounded-sm"
                  style={{ color: "#f85149", background: "rgba(248,81,73,0.1)" }}>
              ERROR
            </span>
          )}
        </span>
        {/* 展开箭头 */}
        {hasExpandable && (
          <span className="shrink-0 text-[9px] mt-[4px] opacity-30 group-hover:opacity-60 transition-all"
                style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
            ▶
          </span>
        )}
      </button>

      {/* ⎿ 折叠摘要 */}
      {!open && (
        <div className="flex items-start gap-2 pl-1">
          <span className="shrink-0 text-[12px] leading-none mt-[1px]" style={{ color: "var(--border)" }}>⎿</span>
          <span className="text-[11px] truncate" style={{ color: "var(--text-tertiary)" }}>
            {isEdit && diffInfo ? (
              <span className="font-mono">{diffInfo}</span>
            ) : isBash && hasResult ? (
              <span className="font-mono">{block.tool_result!.split("\n").slice(0, 1).join("").slice(0, 120) || "(no output)"}</span>
            ) : isRead && hasResult ? (
              <span className="font-mono">{block.tool_result!.split("\n").length} lines</span>
            ) : hasResult ? (
              <span className="font-mono">{block.tool_result!.split("\n").slice(0, 1).join("").slice(0, 120)}</span>
            ) : (
              <span className="opacity-50">(no output)</span>
            )}
          </span>
        </div>
      )}

      {/* 展开详情 */}
      {open && (
        <div className="pl-5">
          {/* Edit: 显示 diff 视图 */}
          {hasEditData && (
            <EditDiffView input={block.tool_input!} />
          )}
          {/* Bash: 显示命令 + 输出 */}
          {isBash && hasResult && (
            <BashResultBlock command={bashCmd} result={block.tool_result!} isError={isError} />
          )}
          {/* Read: 显示文件内容 */}
          {isRead && hasResult && (
            <ReadResultBlock result={block.tool_result!} isError={isError} />
          )}
          {/* 其他工具: 通用结果 */}
          {!isEdit && !isBash && !isRead && hasResult && (
            <GenericResultBlock result={block.tool_result!} isError={isError} />
          )}
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
    <div className="flex items-start gap-2 pt-2 pb-1">
      <span className="shrink-0 text-[13px] font-bold mt-[1px]" style={{ color: "#59c2ff" }}>❯</span>
      <div className="flex-1 min-w-0 text-[12px] leading-relaxed font-medium" style={{ color: "#e6e1cf" }}>
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

  return (
    <div className="px-5 py-3 space-y-0.5 font-[system-ui]" style={{ maxWidth: 860, margin: "0 auto" }}>
      {messages.map((msg, i) => (
        <div key={i}>
          {msg.role === "user"
            ? <UserLine msg={msg} />
            : <AssistantBlock msg={msg} />
          }
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
