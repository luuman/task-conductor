// frontend/src/components/ConvTranscript.tsx
import { useEffect, useRef } from "react";
import type { TranscriptMessage, TranscriptBlock } from "../lib/api";

// 工具摘要
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

// 内联工具卡（在 assistant 消息中嵌入显示）
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

// 用户气泡
function UserBubble({ msg }: { msg: TranscriptMessage }) {
  const text = msg.blocks.filter(b => b.type === "text").map(b => b.text).join("\n");
  return (
    <div className="flex justify-end px-4 py-1">
      <div className="max-w-[70%] rounded-2xl rounded-tr-sm px-3 py-2 text-[12px] whitespace-pre-wrap"
           style={{ background: "var(--accent)", color: "white" }}>
        {text}
      </div>
    </div>
  );
}

// 助手气泡
function AssistantBubble({ msg }: { msg: TranscriptMessage }) {
  return (
    <div className="flex items-start gap-2 px-4 py-1">
      {/* Avatar */}
      <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold mt-0.5"
           style={{ background: "var(--accent)", color: "white" }}>
        TC
      </div>
      <div className="flex-1 max-w-[80%] space-y-1">
        {msg.blocks.map((block, i) =>
          block.type === "text" ? (
            <p key={i} className="text-[12px] whitespace-pre-wrap leading-relaxed"
               style={{ color: "var(--text-primary)" }}>
              {block.text}
            </p>
          ) : (
            <InlineToolCard key={i} block={block} />
          )
        )}
      </div>
    </div>
  );
}

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
