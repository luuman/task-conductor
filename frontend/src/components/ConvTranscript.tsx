// frontend/src/components/ConvTranscript.tsx
import { useEffect, useRef, useState, useCallback, useMemo, createContext, useContext } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import hljs from "highlight.js/lib/core";
import "../styles/hljs-ayu-dark.css";
import typescript from "highlight.js/lib/languages/typescript";
import javascript from "highlight.js/lib/languages/javascript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import sql from "highlight.js/lib/languages/sql";
import yaml from "highlight.js/lib/languages/yaml";
import markdown from "highlight.js/lib/languages/markdown";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import java from "highlight.js/lib/languages/java";
import cpp from "highlight.js/lib/languages/cpp";

hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("css", css);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("go", go);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("java", java);
hljs.registerLanguage("cpp", cpp);
import type { TranscriptMessage, TranscriptBlock } from "../lib/api";
import {
  Terminal,
  FileText,
  FileEdit,
  Search,
  FolderSearch,
  Globe,
  Bot as BotIcon,
  User,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

// ── Context ─────────────────────────────────────────────────
// signal > 0 = expand all (increments), signal < 0 = collapse all (decrements)
const ExpandSignalCtx = createContext(0);
// 默认展开模式
const AutoExpandCtx = createContext(false);
// 文件打开回调：(filePath) => void
const OpenFileCtx = createContext<((filePath: string) => void) | null>(null);

// ── Markdown 组件 ────────────────────────────────────────────
const mdComponents: Components = {
  p:      ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
  h1:     ({ children }) => <h1 className="text-[14px] font-bold mb-1 mt-3" style={{ color: "var(--text-primary)" }}>{children}</h1>,
  h2:     ({ children }) => <h2 className="text-[13px] font-bold mb-1 mt-2" style={{ color: "var(--text-primary)" }}>{children}</h2>,
  h3:     ({ children }) => <h3 className="text-[12.5px] font-semibold mb-0.5 mt-1.5" style={{ color: "var(--text-primary)" }}>{children}</h3>,
  ul:     ({ children }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
  ol:     ({ children }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
  li:     ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold" style={{ color: "var(--text-primary)" }}>{children}</strong>,
  em:     ({ children }) => <em className="italic" style={{ color: "var(--text-secondary)" }}>{children}</em>,
  code:   ({ children, className }) => {
    if (className?.includes("language-")) {
      return (
        <code className="block text-[11px] font-mono px-3 py-2 rounded-md my-1.5 overflow-x-auto whitespace-pre"
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
    <blockquote className="pl-3 my-1.5"
                style={{ borderLeft: "2px solid var(--accent)", color: "var(--text-secondary)" }}>
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3" style={{ borderColor: "var(--border)" }} />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="underline underline-offset-2 hover:brightness-125 transition-all"
       style={{ color: "var(--accent)" }}>
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-1.5">
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

// ── 可点击文件路径 ───────────────────────────────────────────
function ClickableFilePath({ filePath, className, style }: { filePath: string; className?: string; style?: React.CSSProperties }) {
  const onOpenFile = useContext(OpenFileCtx);
  const fileName = filePath.split("/").pop() || filePath;
  return (
    <span
      title={filePath}
      className={`${className || ""} ${onOpenFile ? "cursor-pointer hover:underline" : ""}`}
      style={{ ...style, ...(onOpenFile ? { color: "var(--accent)" } : {}) }}
      onClick={onOpenFile ? (e) => { e.stopPropagation(); onOpenFile(filePath); } : undefined}
    >
      {fileName}
    </span>
  );
}

// ── 工具图标 ─────────────────────────────────────────────────
function ToolIcon({ name, size = 14 }: { name: string; size?: number }) {
  const props = { size, strokeWidth: 1.75, className: "shrink-0" };
  switch (name) {
    case "Bash": return <Terminal {...props} style={{ color: "var(--accent)" }} />;
    case "Read": return <FileText {...props} style={{ color: "var(--info)" }} />;
    case "Write": return <FileEdit {...props} style={{ color: "var(--success)" }} />;
    case "Edit": case "MultiEdit": return <FileEdit {...props} style={{ color: "var(--warning)" }} />;
    case "Grep": return <Search {...props} style={{ color: "var(--warning)" }} />;
    case "Glob": return <FolderSearch {...props} style={{ color: "var(--info)" }} />;
    case "WebSearch": case "WebFetch": return <Globe {...props} style={{ color: "var(--info)" }} />;
    default: return <Terminal {...props} style={{ color: "var(--text-tertiary)" }} />;
  }
}

// ── 工具标签 ─────────────────────────────────────────────────
function getToolDetail(name: string | null | undefined, input: Record<string, unknown> | null | undefined): string {
  if (!name || !input) return "";
  switch (name) {
    case "Bash": return String(input.command || "").slice(0, 120);
    case "Read": case "Write": return String(input.file_path || "");
    case "Edit": case "MultiEdit": return String(input.file_path || "");
    case "Glob": return String(input.pattern || "");
    case "Grep": return `"${input.pattern || ""}"${input.path ? " in " + input.path : ""}`;
    case "WebSearch": return String(input.query || "");
    case "WebFetch": return String(input.url || "").slice(0, 80);
    case "Agent": return String(input.description || input.prompt || "").slice(0, 80);
    default: return "";
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
  const filePath = String(input.file_path ?? "");

  const raw = useMemo(() => computeDiff(oldStr, newStr), [oldStr, newStr]);
  const added = raw.filter(d => d.type === "add").length;
  const removed = raw.filter(d => d.type === "del").length;

  const lines: (DiffLine | { type: "fold"; count: number })[] = [];
  let ctxRun: DiffLine[] = [];
  const flushCtx = () => {
    if (ctxRun.length <= 4) { lines.push(...ctxRun); }
    else {
      lines.push(ctxRun[0]);
      lines.push({ type: "fold", count: ctxRun.length - 2 });
      lines.push(ctxRun[ctxRun.length - 1]);
    }
    ctxRun = [];
  };
  for (const d of raw) {
    if (d.type === "ctx") ctxRun.push(d);
    else { if (ctxRun.length) flushCtx(); lines.push(d); }
  }
  if (ctxRun.length) flushCtx();

  return (
    <div className="rounded-lg overflow-hidden mt-2"
         style={{ border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 px-3 py-2"
           style={{ background: "var(--background-secondary)", borderBottom: "1px solid var(--border)" }}>
        <FileEdit size={13} strokeWidth={1.75} style={{ color: "var(--warning)" }} />
        <ClickableFilePath filePath={filePath}
          className="text-[11px] font-mono flex-1 truncate"
          style={{ color: "var(--text-secondary)" }} />
        <div className="flex items-center gap-2 text-[10px] font-mono shrink-0">
          {added > 0 && <span style={{ color: "var(--success)" }}>+{added}</span>}
          {removed > 0 && <span style={{ color: "var(--danger)" }}>−{removed}</span>}
        </div>
      </div>
      <div className="overflow-x-auto overflow-y-auto text-[11px] font-mono leading-[1.7]"
           style={{ background: "var(--background)" }}>
        {lines.map((item, idx) => {
          if ("count" in item) {
            return (
              <div key={idx} className="flex items-center justify-center py-0.5"
                   style={{ background: "var(--background-secondary)", borderTop: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)" }}>
                <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                  ⋯ {item.count} unchanged lines ⋯
                </span>
              </div>
            );
          }
          const isAdd = item.type === "add";
          const isDel = item.type === "del";
          return (
            <div key={idx} className="flex group"
                 style={{ background: isAdd ? "rgba(34,197,94,0.07)" : isDel ? "rgba(244,63,94,0.07)" : "transparent" }}>
              <span className="w-5 text-center select-none shrink-0 font-semibold"
                    style={{ color: isAdd ? "var(--success)" : isDel ? "var(--danger)" : "transparent" }}>
                {isAdd ? "+" : isDel ? "−" : " "}
              </span>
              <span className="flex-1 whitespace-pre pr-4"
                    style={{ color: isAdd ? "#86efac" : isDel ? "#fda4af" : "var(--text-tertiary)", opacity: isAdd || isDel ? 1 : 0.6 }}>
                {item.text || " "}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Bash 输出 ────────────────────────────────────────────────
function BashOutput({ command, result, isError }: { command: string; result: string; isError: boolean }) {
  const [open, setOpen] = useState(false);
  const lines = result.split("\n");
  const isLong = lines.length > 10;
  const displayed = open || !isLong ? result : lines.slice(0, 6).join("\n") + "\n…";

  return (
    <div className="rounded-lg overflow-hidden mt-2"
         style={{ border: `1px solid ${isError ? "rgba(244,63,94,0.3)" : "var(--border)"}` }}>
      <div className="flex items-center gap-2 px-3 py-1.5"
           style={{ background: "var(--background-secondary)", borderBottom: "1px solid var(--border)" }}>
        <span className="text-[11px] font-mono font-bold" style={{ color: "var(--accent)" }}>$</span>
        <span className="text-[11px] font-mono flex-1 truncate" style={{ color: "var(--text-secondary)" }}>{command}</span>
      </div>
      <pre className="px-3 py-2 text-[11px] font-mono whitespace-pre-wrap break-words overflow-x-auto overflow-y-auto leading-[1.6]"
           style={{ color: isError ? "var(--danger)" : "var(--text-tertiary)", margin: 0, background: "var(--background)" }}>
        {displayed}
      </pre>
      {isLong && (
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full h-6 text-[10px] font-mono transition-colors"
          style={{ color: "var(--accent)", borderTop: "1px solid var(--border)", background: "var(--background-secondary)" }}>
          {open ? "▲ 收起" : `▼ ${lines.length} 行`}
        </button>
      )}
    </div>
  );
}

// ── Read 文件高亮视图 ────────────────────────────────────────
function guessLang(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rs: "rust", go: "go", java: "java", kt: "kotlin",
    rb: "ruby", sh: "bash", zsh: "bash", bash: "bash",
    css: "css", scss: "scss", less: "less", html: "xml", xml: "xml", svg: "xml",
    json: "json", yaml: "yaml", yml: "yaml", toml: "ini", md: "markdown",
    sql: "sql", c: "c", cpp: "cpp", h: "c", hpp: "cpp",
    dockerfile: "dockerfile", makefile: "makefile",
  };
  return map[ext] || "";
}

/** 去掉 cat -n 风格的行号前缀，如 "     1→" */
function stripLineNumbers(text: string): string {
  // 匹配每行开头的  空格+数字+→ 或 空格+数字+\t 格式
  return text.replace(/^ *\d+[→\t]/gm, "");
}

function ReadFileView({ filePath, result }: { filePath: string; result: string }) {
  const stripped = stripLineNumbers(result);
  const lines = stripped.split("\n");
  const lang = guessLang(filePath);

  const highlighted = useMemo(() => {
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(stripped, { language: lang }).value;
      }
      return hljs.highlightAuto(stripped).value;
    } catch {
      return null;
    }
  }, [stripped, lang]);

  return (
    <div className="rounded-lg overflow-hidden mt-2"
         style={{ border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 px-3 py-1.5"
           style={{ background: "var(--background-secondary)", borderBottom: "1px solid var(--border)" }}>
        <FileText size={13} strokeWidth={1.75} style={{ color: "var(--info)" }} />
        <ClickableFilePath filePath={filePath}
          className="text-[11px] font-mono flex-1 truncate"
          style={{ color: "var(--text-secondary)" }} />
        <span className="text-[10px] font-mono shrink-0" style={{ color: "var(--text-tertiary)" }}>
          {lines.length} lines
        </span>
      </div>
      {highlighted ? (
        <pre className="hljs px-3 py-2 text-[11px] font-mono overflow-x-auto leading-[1.7]"
             style={{ margin: 0, background: "var(--background)" }}
             dangerouslySetInnerHTML={{ __html: highlighted }} />
      ) : (
        <pre className="px-3 py-2 text-[11px] font-mono whitespace-pre-wrap break-words overflow-x-auto leading-[1.7]"
             style={{ color: "var(--text-tertiary)", margin: 0, background: "var(--background)" }}>
          {stripped}
        </pre>
      )}
    </div>
  );
}

// ── Agent markdown 输出 ──────────────────────────────────────
function AgentResultView({ result, description }: { result: string; description: string }) {
  return (
    <div className="rounded-lg overflow-hidden mt-2"
         style={{ border: "1px solid var(--border)" }}>
      {description && (
        <div className="flex items-center gap-2 px-3 py-1.5"
             style={{ background: "var(--background-secondary)", borderBottom: "1px solid var(--border)" }}>
          <BotIcon size={13} strokeWidth={1.75} style={{ color: "var(--accent)" }} />
          <span className="text-[11px] font-medium flex-1 truncate"
                style={{ color: "var(--text-secondary)" }}>{description}</span>
        </div>
      )}
      <div className="px-4 py-3 text-[12px] leading-relaxed"
           style={{ color: "var(--text-primary)", background: "var(--background)" }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {result}
        </ReactMarkdown>
      </div>
    </div>
  );
}

// ── 通用输出（markdown 渲染） ────────────────────────────────
function OutputBlock({ result, isError }: { result: string; isError: boolean }) {
  const [open, setOpen] = useState(false);
  const isLong = result.length > 800;
  const displayed = open || !isLong ? result : result.slice(0, 800) + "\n\n…";

  return (
    <div className="rounded-lg overflow-hidden mt-2"
         style={{ border: `1px solid ${isError ? "rgba(244,63,94,0.3)" : "var(--border)"}` }}>
      <div className="px-4 py-3 text-[12px] leading-relaxed overflow-y-auto "
           style={{ color: isError ? "var(--danger)" : "var(--text-primary)", background: "var(--background)" }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {displayed}
        </ReactMarkdown>
      </div>
      {isLong && (
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full h-6 text-[10px] font-mono transition-colors"
          style={{ color: "var(--accent)", borderTop: "1px solid var(--border)", background: "var(--background-secondary)" }}>
          {open ? "▲ 收起" : `▼ 展开 (${result.length} 字)`}
        </button>
      )}
    </div>
  );
}

// ── 工具卡片 ─────────────────────────────────────────────────
function ToolWidget({ block }: { block: TranscriptBlock }) {
  const signal = useContext(ExpandSignalCtx);
  const autoExpand = useContext(AutoExpandCtx);
  const [open, setOpen] = useState(autoExpand);
  const toggle = useCallback(() => setOpen(v => !v), []);

  // 响应全局展开/折叠信号
  const prevSignal = useRef(signal);
  useEffect(() => {
    if (signal === prevSignal.current) return;
    prevSignal.current = signal;
    setOpen(signal > 0);
  }, [signal]);

  const toolName = block.tool_name || "Tool";
  const detail = getToolDetail(block.tool_name, block.tool_input);
  const hasFilePath = ["Read", "Write", "Edit", "MultiEdit"].includes(toolName) && block.tool_input?.file_path;
  const filePath = hasFilePath ? String(block.tool_input!.file_path) : "";
  const hasResult = block.tool_result != null && block.tool_result !== "";
  const isError = block.tool_error === true;
  const isEdit = toolName === "Edit" || toolName === "MultiEdit";
  const isBash = toolName === "Bash";
  const isRead = toolName === "Read";
  const isAgent = toolName === "Agent";
  const hasEditData = isEdit && block.tool_input && (block.tool_input.old_string || block.tool_input.new_string);
  const bashCmd = isBash ? String(block.tool_input?.command ?? "") : "";
  const canExpand = hasResult || hasEditData;

  const editInfo = useMemo(() => {
    if (!hasEditData || !block.tool_input) return "";
    const oldN = String(block.tool_input.old_string ?? "").split("\n").length;
    const newN = String(block.tool_input.new_string ?? "").split("\n").length;
    const parts: string[] = [];
    if (newN > 0) parts.push(`+${newN}`);
    if (oldN > 0) parts.push(`−${oldN}`);
    return parts.join(" ");
  }, [hasEditData, block.tool_input]);

  const preview = hasResult
    ? block.tool_name === "Read"
      ? `${block.tool_result!.split("\n").length} lines`
      : block.tool_result!.split("\n")[0].slice(0, 100)
    : "";

  return (
    <div className="my-1">
      <button
        onClick={canExpand ? toggle : undefined}
        className={`w-full flex items-center gap-2 py-1 text-left transition-colors rounded ${canExpand ? "hover:bg-white/[0.03]" : ""}`}
      >
        <ToolIcon name={toolName} size={14} />
        <span className="text-[11.5px] font-semibold shrink-0" style={{ color: "var(--text-primary)" }}>
          {isEdit ? "Edit" : toolName}
        </span>
        {hasFilePath ? (
          <ClickableFilePath filePath={filePath}
            className="text-[10.5px] font-mono truncate px-1.5 py-0.5 rounded"
            style={{ background: "var(--background)", color: "var(--text-secondary)" }} />
        ) : detail ? (
          <code className="text-[10.5px] font-mono truncate px-1.5 py-0.5 rounded"
                style={{ background: "var(--background)", color: "var(--text-secondary)" }}>
            {detail}
          </code>
        ) : null}
        {editInfo && (
          <span className="text-[10px] font-mono shrink-0" style={{ color: "var(--text-tertiary)" }}>{editInfo}</span>
        )}
        {isError && (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0"
                style={{ color: "var(--danger)", background: "rgba(244,63,94,0.1)" }}>ERROR</span>
        )}
        <span className="flex-1" />
        {!open && preview && (
          <span className="text-[10px] font-mono truncate max-w-[180px]" style={{ color: "var(--text-tertiary)" }}>{preview}</span>
        )}
        {canExpand && (
          open
            ? <ChevronDown size={12} style={{ color: "var(--text-tertiary)" }} className="shrink-0" />
            : <ChevronRight size={12} style={{ color: "var(--text-tertiary)" }} className="shrink-0" />
        )}
      </button>
      {open && (
        <div className="pt-1 pb-1">
          {hasEditData && <EditDiffView input={block.tool_input!} />}
          {isBash && hasResult && <BashOutput command={bashCmd} result={block.tool_result!} isError={isError} />}
          {isRead && hasResult && <ReadFileView filePath={String(block.tool_input?.file_path ?? "")} result={block.tool_result!} />}
          {isAgent && hasResult && <AgentResultView result={block.tool_result!} description={String(block.tool_input?.description ?? "")} />}
          {!isEdit && !isBash && !isRead && !isAgent && hasResult && <OutputBlock result={block.tool_result!} isError={isError} />}
        </div>
      )}
    </div>
  );
}

// ── 头像 ─────────────────────────────────────────────────────
function ClaudeAvatar() {
  return (
    <div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center mt-0.5"
         style={{ background: "var(--accent-subtle)", border: "1px solid rgba(68,119,255,0.15)" }}>
      <BotIcon size={14} style={{ color: "var(--accent)" }} />
    </div>
  );
}

function UserAvatar() {
  return (
    <div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center mt-0.5"
         style={{ background: "var(--background-tertiary)", border: "1px solid var(--border)" }}>
      <User size={14} style={{ color: "var(--text-secondary)" }} />
    </div>
  );
}

// ── 消息卡片 ─────────────────────────────────────────────────
function UserCard({ msg }: { msg: TranscriptMessage }) {
  const text = msg.blocks.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
  if (!text) return null;
  return (
    <div className="flex items-start gap-3 px-4 py-2 justify-end">
      <div className="min-w-0 max-w-[75%] rounded-lg px-3.5 py-2.5"
           style={{ background: "var(--background-tertiary)", border: "1px solid var(--border)" }}>
        <div className="text-[12.5px] leading-relaxed" style={{ color: "var(--text-primary)" }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{text}</ReactMarkdown>
        </div>
      </div>
      <UserAvatar />
    </div>
  );
}

function AssistantCard({ msg }: { msg: TranscriptMessage }) {
  return (
    <div className="flex items-start gap-3 px-4 py-2 justify-start">
      <ClaudeAvatar />
      <div className="min-w-0 max-w-[85%] rounded-lg px-3.5 py-2.5"
           style={{ background: "rgba(68,119,255,0.04)", border: "1px solid rgba(68,119,255,0.12)" }}>
        <div className="space-y-1 text-[12.5px] leading-relaxed" style={{ color: "var(--text-primary)" }}>
          {msg.blocks.map((block, i) =>
            block.type === "text" ? (
              <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={mdComponents}>{block.text ?? ""}</ReactMarkdown>
            ) : (
              <ToolWidget key={i} block={block} />
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ── 主组件 ──────────────────────────────────────────────────
interface Props {
  messages: TranscriptMessage[];
  loading: boolean;
  fileFound: boolean;
  onOpenFile?: (filePath: string) => void;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  autoExpand?: boolean;
}

export function ConvTranscript({ messages, loading, fileFound, onOpenFile, scrollRef, autoExpand: autoExpandProp }: Props) {
  const { t } = useTranslation();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [expandSignal, setExpandSignal] = useState(0);
  const autoExpand = autoExpandProp ?? false;
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // 切换消息时重置信号和当前问题（保持 autoExpand 状态）
  useEffect(() => { setExpandSignal(prev => autoExpand ? Math.abs(prev) + 1 : -(Math.abs(prev) + 1)); setCurrentQuestion(null); }, [messages]);

  // autoExpand 变化时同步展开/折叠信号
  useEffect(() => {
    setExpandSignal(prev => autoExpand ? Math.abs(prev) + 1 : -(Math.abs(prev) + 1));
  }, [autoExpand]);

  // 提取用户问题列表
  const userQuestions = useMemo(() => {
    const qs: { text: string; msgIndex: number }[] = [];
    messages.forEach((msg, i) => {
      if (msg.role !== "user") return;
      const text = msg.blocks.filter(b => b.type === "text").map(b => b.text).join(" ").trim();
      if (text) qs.push({ text, msgIndex: i });
    });
    return qs;
  }, [messages]);

  // IntersectionObserver 检测当前可见的用户问题
  useEffect(() => {
    const container = scrollRef?.current;
    if (!container || userQuestions.length === 0) return;

    // 需要等 DOM 渲染完毕
    const timer = setTimeout(() => {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const idx = Number((entry.target as HTMLElement).dataset.msgIndex);
              const q = userQuestions.find(q => q.msgIndex === idx);
              if (q) setCurrentQuestion(q.text.slice(0, 200));
            }
          }
        },
        { root: container, rootMargin: "-40px 0px 0px 0px", threshold: 0.1 }
      );

      const qIndices = new Set(userQuestions.map(q => q.msgIndex));
      const elements = container.querySelectorAll("[data-msg-index]");
      elements.forEach(el => {
        const idx = Number((el as HTMLElement).dataset.msgIndex);
        if (qIndices.has(idx)) observer.observe(el);
      });

      // store cleanup
      (container as any).__convObserver = observer;
    }, 100);

    return () => {
      clearTimeout(timer);
      const obs = (container as any).__convObserver;
      if (obs) { obs.disconnect(); delete (container as any).__convObserver; }
    };
  }, [userQuestions, scrollRef]);

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
    <OpenFileCtx.Provider value={onOpenFile ?? null}>
    <AutoExpandCtx.Provider value={autoExpand}>
    <ExpandSignalCtx.Provider value={expandSignal}>
      {/* 吸顶问题灯 */}
      {currentQuestion && (
        <div className="sticky top-0 z-10 h-11 flex items-center gap-2 px-4 backdrop-blur-md"
             style={{ background: "rgba(7,7,13,0.85)", borderBottom: "1px solid var(--border)" }}>
          <User size={12} style={{ color: "var(--text-tertiary)" }} className="shrink-0" />
          <span className="text-[11px] truncate flex-1" style={{ color: "var(--text-secondary)" }}>
            {currentQuestion}
          </span>
        </div>
      )}
      <div className="py-2 space-y-1">
        {messages.map((msg, i) => (
          <div key={i} data-msg-index={i}>
            {msg.role === "user"
              ? <UserCard msg={msg} />
              : <AssistantCard msg={msg} />
            }
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </ExpandSignalCtx.Provider>
    </AutoExpandCtx.Provider>
    </OpenFileCtx.Provider>
  );
}
