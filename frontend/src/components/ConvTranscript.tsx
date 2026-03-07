// frontend/src/components/ConvTranscript.tsx
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { TranscriptMessage, TranscriptBlock } from "../lib/api";

// ── Claude 图标 ───────────────────────────────────────────────
function ClaudeAvatar() {
  return (
    <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center mt-0.5 overflow-hidden"
         style={{ background: "#cc785c" }}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="white">
        <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-1.11-.097v-.427l.73-.097 2.35-.146 2.952-.17 1.11-.12.097-.176-.097-.128-.79-.444-2.235-1.17-2.086-1.025-.972-.59v-.444l.444-.097.903.388 2.555 1.11 2.146.903.487.146.158-.146v-.146l-.34-1.985-.61-2.965-.17-1.5.41-.14.55.097.61 1.11.925 2.65.657 2.146.437.97.292.14.194-.194v-1.07L12.7 4.19l.073-2.31.097-.7.475-.34.444.34.146 1.13.17 2.55.097 2.893v.657l.292.097.194-.097 1.207-1.765 1.35-1.813.754-.967.56.17.097.42-.413.754-1.013 1.838-1.255 2.016-.437.827.097.146.388.049.84-.34 2.41-.79 1.862-.437.827.194.49-.34.243-.925.073-1.813.34-2.44.485-1.207.267-.17.194.073.17.484-.04 1.17.073 1.207v.84l.314.27.49.04.97-.49 2.105-1.03 1.546-.79.753-.292.34.38-.073.56-.657.437-2.21 1.34-1.813 1.025-.754.56.073.267.34.097 2.38.25 2.404.413h.098l.097.34-.29.29-1.888-.1-2.15-.073h-1.11l-.267.218.097.29 1.207.888 1.546 1.207 1.304 1.133.17.56-.29.38-.534-.073-1.546-1.11-1.74-1.377-1.304-1.013-.38-.097-.267.097-.073.38-.097 2.407-.146 2.09-.267 1.133.17.62-.42.097-.79-.097-1.79-.049-2.116v-.657l-.34-.17-.29.17-1.255 1.692-1.11 1.254-.925.84-.487.073-.34-.292.17-.62 1.207-1.985 1.11-1.692.54-.937v-.243l-.17-.097-.317.097-1.013.39-2.09.84-1.888.875-.92.303-.38-.29.073-.56z"/>
      </svg>
    </div>
  );
}

// ── 工具摘要 ──────────────────────────────────────────────────
function toolSummary(name: string | null | undefined, input: Record<string, unknown> | null | undefined): string {
  if (!name || !input) return "";
  switch (name) {
    case "Read": case "Write": case "Edit":
      return String(input.file_path || input.notebook_path || "");
    case "Bash": return String(input.command || "").slice(0, 120);
    case "Glob": return String(input.pattern || "");
    case "Grep": return `"${input.pattern}"${input.path ? "  " + input.path : ""}`;
    case "WebSearch": return String(input.query || "");
    case "WebFetch": return String(input.url || "");
    case "Agent": return String(input.description || input.prompt || "").slice(0, 100);
    default: try { return JSON.stringify(input).slice(0, 100); } catch { return ""; }
  }
}

// ── Markdown 组件重写（匹配深色主题）────────────────────────
const mdComponents: Components = {
  p:      ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
  h1:     ({ children }) => <h1 className="text-[14px] font-bold mb-1.5 mt-2">{children}</h1>,
  h2:     ({ children }) => <h2 className="text-[13px] font-bold mb-1 mt-2">{children}</h2>,
  h3:     ({ children }) => <h3 className="text-[12px] font-semibold mb-1 mt-1.5">{children}</h3>,
  ul:     ({ children }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
  ol:     ({ children }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
  li:     ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold" style={{ color: "var(--text-primary)" }}>{children}</strong>,
  em:     ({ children }) => <em className="italic opacity-90">{children}</em>,
  code:   ({ children, className }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className="block text-[10.5px] font-mono px-3 py-2 rounded my-1 overflow-x-auto whitespace-pre"
              style={{ background: "var(--background-tertiary)", color: "#79c0ff", border: "1px solid var(--border)" }}>
          {children}
        </code>
      );
    }
    return (
      <code className="text-[10.5px] font-mono px-1 py-0.5 rounded"
            style={{ background: "var(--background-tertiary)", color: "#79c0ff" }}>
        {children}
      </code>
    );
  },
  pre:    ({ children }) => <pre className="my-1 overflow-x-auto">{children}</pre>,
  blockquote: ({ children }) => (
    <blockquote className="pl-3 my-1.5 italic opacity-80"
                style={{ borderLeft: "3px solid var(--border)" }}>
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2 opacity-20" style={{ borderColor: "var(--border)" }} />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="underline underline-offset-2 opacity-80 hover:opacity-100"
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
    <td className="px-2 py-1"
        style={{ border: "1px solid var(--border)" }}>
      {children}
    </td>
  ),
};

// ── 内联工具卡 ────────────────────────────────────────────────
function InlineToolCard({ block }: { block: TranscriptBlock }) {
  const detail = toolSummary(block.tool_name, block.tool_input ?? null);
  return (
    <div className="my-1 rounded-md overflow-hidden text-[11px]"
         style={{ border: "1px solid var(--border)", background: "var(--background-tertiary)" }}>
      <div className="flex items-center gap-1.5 px-2.5 py-1">
        <span className="font-semibold text-[#79c0ff]">{block.tool_name || "Tool"}</span>
        {detail && (
          <span className="flex-1 truncate font-mono opacity-70"
                style={{ color: "var(--text-secondary)" }} title={detail}>
            {detail}
          </span>
        )}
      </div>
    </div>
  );
}

// ── 用户气泡 ──────────────────────────────────────────────────
function UserBubble({ msg }: { msg: TranscriptMessage }) {
  const text = msg.blocks.filter(b => b.type === "text").map(b => b.text).join("\n");
  return (
    <div className="flex justify-end px-4 py-1">
      <div className="max-w-[72%] rounded-2xl rounded-tr-sm px-3 py-2 text-[12px]"
           style={{ background: "#1e2540", color: "#c8d4f0", border: "1px solid #2a3560" }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {text}
        </ReactMarkdown>
      </div>
    </div>
  );
}

// ── 助手气泡 ──────────────────────────────────────────────────
function AssistantBubble({ msg }: { msg: TranscriptMessage }) {
  return (
    <div className="flex items-start gap-2 px-4 py-1">
      <ClaudeAvatar />
      <div className="flex-1 max-w-[80%] space-y-1 text-[12px]"
           style={{ color: "var(--text-primary)" }}>
        {msg.blocks.map((block, i) =>
          block.type === "text" ? (
            <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={mdComponents}>
              {block.text ?? ""}
            </ReactMarkdown>
          ) : (
            <InlineToolCard key={i} block={block} />
          )
        )}
      </div>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────
interface Props {
  messages: TranscriptMessage[];
  loading: boolean;
  fileFound: boolean;
}

export function ConvTranscript({ messages, loading, fileFound }: Props) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[12px]"
           style={{ color: "var(--text-tertiary)" }}>加载中...</div>
    );
  }

  if (!fileFound) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2"
           style={{ color: "var(--text-tertiary)" }}>
        <span className="text-2xl">📂</span>
        <p className="text-[12px]">本地 transcript 文件不存在</p>
        <p className="text-[10px] opacity-60">（该会话的对话记录可能已被删除）</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3"
           style={{ color: "var(--text-tertiary)" }}>
        <span className="text-3xl">💬</span>
        <p className="text-[12px]">选择左侧会话查看对话记录</p>
      </div>
    );
  }

  return (
    <div className="py-3 space-y-1">
      {messages.map((msg, i) =>
        msg.role === "user"
          ? <UserBubble key={i} msg={msg} />
          : <AssistantBubble key={i} msg={msg} />
      )}
      <div ref={bottomRef} />
    </div>
  );
}
