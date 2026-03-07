// frontend/src/components/ConvTranscript.tsx
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { TranscriptMessage, TranscriptBlock } from "../lib/api";

// ── Markdown 组件 ────────────────────────────────────────────
const mdComponents: Components = {
  p:      ({ children }) => <p className="mb-1 last:mb-0 leading-relaxed">{children}</p>,
  h1:     ({ children }) => <h1 className="text-[13px] font-bold mb-1 mt-2" style={{ color: "var(--text-primary)" }}>{children}</h1>,
  h2:     ({ children }) => <h2 className="text-[13px] font-bold mb-1 mt-1.5" style={{ color: "var(--text-primary)" }}>{children}</h2>,
  h3:     ({ children }) => <h3 className="text-[12px] font-semibold mb-0.5 mt-1" style={{ color: "var(--text-primary)" }}>{children}</h3>,
  ul:     ({ children }) => <ul className="list-disc pl-4 mb-1 space-y-0.5">{children}</ul>,
  ol:     ({ children }) => <ol className="list-decimal pl-4 mb-1 space-y-0.5">{children}</ol>,
  li:     ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold" style={{ color: "var(--text-primary)" }}>{children}</strong>,
  em:     ({ children }) => <em className="italic" style={{ color: "var(--text-secondary)" }}>{children}</em>,
  code:   ({ children, className }) => {
    if (className?.includes("language-")) {
      return (
        <code className="block text-[11px] font-mono px-3 py-2 rounded-md my-1 overflow-x-auto whitespace-pre"
              style={{ background: "var(--background)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
          {children}
        </code>
      );
    }
    return (
      <code className="text-[11px] font-mono px-1 py-0.5 rounded"
            style={{ background: "var(--background-tertiary)", color: "var(--accent)" }}>
        {children}
      </code>
    );
  },
  pre:    ({ children }) => <pre className="my-1 overflow-x-auto">{children}</pre>,
  blockquote: ({ children }) => (
    <blockquote className="pl-3 my-1 opacity-90"
                style={{ borderLeft: "2px solid var(--accent)", color: "var(--text-secondary)" }}>
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2" style={{ borderColor: "var(--border)" }} />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="underline underline-offset-2 hover:brightness-125 transition-all"
       style={{ color: "var(--accent)" }}>
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
        style={{ border: "1px solid var(--border)", background: "var(--background-tertiary)" }}>
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-2 py-1" style={{ border: "1px solid var(--border)" }}>{children}</td>
  ),
};

// ── 工具颜色（使用项目 semantic tokens）──────────────────────
const TOOL_COLORS: Record<string, string> = {
  Read:         "var(--info)",      // #38bdf8
  Write:        "var(--success)",   // #22c55e
  Edit:         "var(--warning)",   // #f59e0b
  MultiEdit:    "var(--warning)",
  Bash:         "var(--accent)",    // #4477ff
  Grep:         "var(--warning)",   // #f59e0b
  Glob:         "var(--info)",      // #38bdf8
  WebSearch:    "var(--info)",
  WebFetch:     "var(--info)",
  Agent:        "var(--accent)",
  TodoWrite:    "var(--text-secondary)",
  TodoRead:     "var(--text-secondary)",
  NotebookEdit: "var(--warning)",
};

function getToolColor(name: string | null | undefined) {
  if (!name) return "var(--text-tertiary)";
  return TOOL_COLORS[name] ?? "var(--text-tertiary)";
}

// ── 工具标签 ─────────────────────────────────────────────────
function toolLabel(name: string | null | undefined, input: Record<string, unknown> | null | undefined): { tag: string; detail: string } {
  if (!name) return { tag: "Tool", detail: "" };
  if (!input) return { tag: name, detail: "" };

  switch (name) {
    case "Bash": {
      const cmd = String(input.command || "").trim();
      return { tag: "Bash", detail: cmd.length > 120 ? cmd.slice(0, 120) + "…" : cmd };
    }
    case "Read": {
      const fp = String(input.file_path || "");
      return { tag: "Read", detail: fp.split("/").pop() || fp };
    }
    case "Write": {
      const fp = String(input.file_path || "");
      return { tag: "Write", detail: fp.split("/").pop() || fp };
    }
    case "Edit": case "MultiEdit": {
      const fp = String(input.file_path || "");
      return { tag: "Update", detail: fp.split("/").pop() || fp };
    }
    case "Glob":
      return { tag: "Glob", detail: String(input.pattern || "") };
    case "Grep":
      return { tag: "Grep", detail: `"${input.pattern || ""}"${input.path ? " " + input.path : ""}` };
    case "WebSearch":
      return { tag: "WebSearch", detail: String(input.query || "") };
    case "WebFetch":
      return { tag: "WebFetch", detail: String(input.url || "").slice(0, 80) };
    case "Agent":
      return { tag: "Agent", detail: String(input.description || input.prompt || "").slice(0, 80) };
    default:
      return { tag: name, detail: "" };
  }
}

// ── Diff 算法 ────────────────────────────────────────────────
interface DiffLine {
  type: "add" | "del" | "ctx";
  text: string;
  oldNum?: number;
  newNum?: number;
}

function computeDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldL = oldStr.split("\n");
  const newL = newStr.split("\n");
  const m = oldL.length, n = newL.length;

  if (m + n > 400) {
    const out: DiffLine[] = [];
    oldL.forEach((t, i) => out.push({ type: "del", text: t, oldNum: i + 1 }));
    newL.forEach((t, i) => out.push({ type: "add", text: t, newNum: i + 1 }));
    return out;
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = oldL[i - 1] === newL[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);

  const raw: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldL[i - 1] === newL[j - 1]) {
      raw.push({ type: "ctx", text: oldL[i - 1], oldNum: i, newNum: j });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.push({ type: "add", text: newL[j - 1], newNum: j });
      j--;
    } else {
      raw.push({ type: "del", text: oldL[i - 1], oldNum: i });
      i--;
    }
  }
  raw.reverse();
  return raw;
}

// ── Edit Diff 视图 ──────────────────────────────────────────
function EditDiffView({ input }: { input: Record<string, unknown> }) {
  const oldStr = String(input.old_string ?? "");
  const newStr = String(input.new_string ?? "");

  const raw = useMemo(() => computeDiff(oldStr, newStr), [oldStr, newStr]);
  const added = raw.filter(d => d.type === "add").length;
  const removed = raw.filter(d => d.type === "del").length;

  // Collapse long unchanged runs (keep 1 line context each side)
  const lines: (DiffLine | { type: "fold"; count: number })[] = [];
  let ctxRun: DiffLine[] = [];
  const flushCtx = () => {
    if (ctxRun.length <= 4) {
      lines.push(...ctxRun);
    } else {
      lines.push(ctxRun[0]);
      lines.push({ type: "fold", count: ctxRun.length - 2 });
      lines.push(ctxRun[ctxRun.length - 1]);
    }
    ctxRun = [];
  };
  for (const d of raw) {
    if (d.type === "ctx") { ctxRun.push(d); }
    else { if (ctxRun.length) flushCtx(); lines.push(d); }
  }
  if (ctxRun.length) flushCtx();

  return (
    <div className="rounded-lg overflow-hidden"
         style={{ background: "var(--background)", border: "1px solid var(--border)" }}>
      {/* 统计头 */}
      <div className="flex items-center gap-3 px-3 h-7 text-[10px] font-mono"
           style={{ background: "var(--background-secondary)", borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)" }}>
        {added > 0 && <span style={{ color: "var(--success)" }}>+{added}</span>}
        {removed > 0 && <span style={{ color: "var(--danger)" }}>-{removed}</span>}
        {added === 0 && removed === 0 && <span>no changes</span>}
      </div>
      {/* Diff 行 */}
      <div className="overflow-x-auto max-h-[380px] overflow-y-auto text-[11px] font-mono leading-[1.65]">
        {lines.map((item, idx) => {
          if ("count" in item) {
            return (
              <div key={idx} className="flex items-center h-[22px]"
                   style={{ background: "var(--background-secondary)" }}>
                <span className="w-[72px]" />
                <span className="text-[10px] px-2" style={{ color: "var(--text-tertiary)" }}>
                  ⋯ {item.count} lines ⋯
                </span>
              </div>
            );
          }
          const isAdd = item.type === "add";
          const isDel = item.type === "del";
          return (
            <div key={idx} className="flex"
                 style={{
                   background: isAdd ? "rgba(34,197,94,0.06)" : isDel ? "rgba(244,63,94,0.06)" : "transparent",
                 }}>
              {/* 旧行号 */}
              <span className="w-[36px] text-right pr-1.5 select-none shrink-0"
                    style={{ color: isDel ? "rgba(244,63,94,0.4)" : "var(--text-tertiary)", opacity: isDel ? 1 : 0.4 }}>
                {isDel ? item.oldNum : item.type === "ctx" ? item.oldNum : ""}
              </span>
              {/* 新行号 */}
              <span className="w-[36px] text-right pr-1.5 select-none shrink-0"
                    style={{ color: isAdd ? "rgba(34,197,94,0.4)" : "var(--text-tertiary)", opacity: isAdd ? 1 : 0.4 }}>
                {isAdd ? item.newNum : item.type === "ctx" ? item.newNum : ""}
              </span>
              {/* +/- */}
              <span className="w-[18px] text-center select-none shrink-0"
                    style={{ color: isAdd ? "var(--success)" : isDel ? "var(--danger)" : "transparent" }}>
                {isAdd ? "+" : isDel ? "−" : " "}
              </span>
              {/* 代码 */}
              <span className="flex-1 whitespace-pre pr-3"
                    style={{
                      color: isAdd ? "#86efac" : isDel ? "#fda4af" : "var(--text-tertiary)",
                    }}>
                {item.text || " "}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Bash 输出块 ─────────────────────────────────────────────
function BashOutput({ command, result, isError }: { command: string; result: string; isError: boolean }) {
  const [open, setOpen] = useState(false);
  const lines = result.split("\n");
  const isLong = lines.length > 10;
  const displayed = open || !isLong ? result : lines.slice(0, 6).join("\n") + "\n…";

  return (
    <div className="rounded-lg overflow-hidden"
         style={{ background: "var(--background)", border: `1px solid ${isError ? "rgba(244,63,94,0.25)" : "var(--border)"}` }}>
      <div className="flex items-center gap-2 px-3 h-7"
           style={{ background: "var(--background-secondary)", borderBottom: "1px solid var(--border)" }}>
        <span className="text-[11px] font-mono font-semibold" style={{ color: "var(--accent)" }}>$</span>
        <span className="text-[11px] font-mono flex-1 truncate" style={{ color: "var(--text-secondary)" }}>{command}</span>
      </div>
      <pre className="px-3 py-2 text-[11px] font-mono whitespace-pre-wrap break-words overflow-x-auto max-h-[360px] overflow-y-auto leading-[1.55]"
           style={{ color: isError ? "var(--danger)" : "var(--text-tertiary)", margin: 0 }}>
        {displayed}
      </pre>
      {isLong && (
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full h-6 text-[10px] font-mono hover:brightness-125 transition-all"
          style={{ color: "var(--accent)", borderTop: "1px solid var(--border)", background: "var(--background-secondary)" }}>
          {open ? "▲ 收起" : `▼ 展开 (${lines.length} 行)`}
        </button>
      )}
    </div>
  );
}

// ── 通用输出块 ──────────────────────────────────────────────
function OutputBlock({ result, isError }: { result: string; isError: boolean }) {
  const [open, setOpen] = useState(false);
  const isLong = result.length > 500;
  const displayed = open || !isLong ? result : result.slice(0, 500) + "…";

  return (
    <div className="rounded-lg overflow-hidden"
         style={{ background: "var(--background)", border: "1px solid var(--border)" }}>
      <pre className="px-3 py-2 text-[11px] font-mono whitespace-pre-wrap break-words overflow-x-auto max-h-[360px] overflow-y-auto leading-[1.55]"
           style={{ color: isError ? "var(--danger)" : "var(--text-tertiary)", margin: 0 }}>
        {displayed}
      </pre>
      {isLong && (
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full h-6 text-[10px] font-mono hover:brightness-125 transition-all"
          style={{ color: "var(--accent)", borderTop: "1px solid var(--border)", background: "var(--background-secondary)" }}>
          {open ? "▲ 收起" : `▼ 展开 (${result.length} 字)`}
        </button>
      )}
    </div>
  );
}

// ── Edit 折叠摘要 ────────────────────────────────────────────
function editSummary(input: Record<string, unknown> | null | undefined): string {
  if (!input) return "";
  const oldN = String(input.old_string ?? "").split("\n").length;
  const newN = String(input.new_string ?? "").split("\n").length;
  const parts: string[] = [];
  if (newN > 0) parts.push(`Added ${newN} line${newN > 1 ? "s" : ""}`);
  if (oldN > 0) parts.push(`removed ${oldN} line${oldN > 1 ? "s" : ""}`);
  return parts.join(", ");
}

// ── 工具调用行 ──────────────────────────────────────────────
function ToolLine({ block }: { block: TranscriptBlock }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen(v => !v), []);

  const color = getToolColor(block.tool_name);
  const { tag, detail } = toolLabel(block.tool_name, block.tool_input);
  const hasResult = block.tool_result != null && block.tool_result !== "";
  const isError = block.tool_error === true;
  const isEdit = block.tool_name === "Edit" || block.tool_name === "MultiEdit";
  const isBash = block.tool_name === "Bash";
  const hasEditData = isEdit && block.tool_input && (block.tool_input.old_string || block.tool_input.new_string);
  const bashCmd = isBash ? String(block.tool_input?.command ?? "") : "";
  const canExpand = hasResult || hasEditData;

  // Collapsed summary line
  const collapsedText = isEdit && hasEditData
    ? editSummary(block.tool_input)
    : isBash && hasResult
    ? block.tool_result!.split("\n")[0].slice(0, 140)
    : block.tool_name === "Read" && hasResult
    ? `${block.tool_result!.split("\n").length} lines`
    : hasResult
    ? block.tool_result!.split("\n")[0].slice(0, 140)
    : "";

  return (
    <div>
      {/* ● Tag(detail) */}
      <div
        onClick={canExpand ? toggle : undefined}
        className={`flex items-baseline gap-2 py-[3px] rounded-md px-1 -mx-1 transition-colors ${canExpand ? "cursor-pointer hover:bg-[var(--background-tertiary)]" : ""}`}
      >
        <span className="text-[9px] mt-[2px] leading-none shrink-0" style={{ color }}>●</span>
        <span className="text-[12px] font-mono font-semibold shrink-0" style={{ color }}>{tag}</span>
        {detail && (
          <span className="text-[11px] font-mono truncate" style={{ color: "var(--text-secondary)" }}>
            {detail}
          </span>
        )}
        {isError && (
          <span className="text-[9px] font-mono px-1.5 py-[1px] rounded font-semibold shrink-0"
                style={{ color: "var(--danger)", background: "rgba(244,63,94,0.1)" }}>
            ERROR
          </span>
        )}
        {canExpand && (
          <span className="text-[8px] opacity-25 shrink-0 transition-transform ml-auto"
                style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
        )}
      </div>

      {/* ⎿ 折叠摘要 */}
      {!open && collapsedText && (
        <div className="flex items-start gap-2 pl-[3px] pb-0.5">
          <span className="shrink-0 text-[11px] leading-none mt-px" style={{ color: "var(--border)" }}>⎿</span>
          <span className="text-[11px] font-mono truncate" style={{ color: "var(--text-tertiary)" }}>
            {collapsedText}
          </span>
        </div>
      )}

      {/* 展开内容 */}
      {open && (
        <div className="ml-4 mt-1 mb-2">
          {hasEditData && <EditDiffView input={block.tool_input!} />}
          {isBash && hasResult && <BashOutput command={bashCmd} result={block.tool_result!} isError={isError} />}
          {!isEdit && !isBash && hasResult && <OutputBlock result={block.tool_result!} isError={isError} />}
        </div>
      )}
    </div>
  );
}

// ── 用户消息 ─────────────────────────────────────────────────
function UserLine({ msg }: { msg: TranscriptMessage }) {
  const text = msg.blocks.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
  if (!text) return null;

  return (
    <div className="flex items-start gap-2.5 pt-3 pb-1">
      <span className="shrink-0 text-[14px] font-bold leading-none mt-[2px]" style={{ color: "var(--accent)" }}>❯</span>
      <div className="flex-1 min-w-0 text-[12.5px] leading-relaxed" style={{ color: "var(--text-primary)" }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {text}
        </ReactMarkdown>
      </div>
    </div>
  );
}

// ── 助手消息 ─────────────────────────────────────────────────
function AssistantBlock({ msg }: { msg: TranscriptMessage }) {
  return (
    <div className="space-y-0.5 pb-0.5">
      {msg.blocks.map((block, i) =>
        block.type === "text" ? (
          <div key={i} className="text-[12px] leading-relaxed py-0.5 pl-[3px]"
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
    <div className="px-5 py-4 space-y-0.5" style={{ maxWidth: 880, margin: "0 auto" }}>
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
