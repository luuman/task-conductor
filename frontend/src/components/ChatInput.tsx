// frontend/src/components/ChatInput.tsx
// 聊天输入组件：多行输入 + 模型选择 + 发送/停止按钮

import { useState, useRef, useEffect, useCallback } from "react";
import { SendHorizontal, Square, ChevronDown } from "lucide-react";
import { api, type ChatModel } from "../lib/api";

export interface ChatInputProps {
  onSend: (message: string, model: string) => void;
  onStop: () => void;
  isGenerating: boolean;
  disabled?: boolean;
}

export function ChatInput({ onSend, onStop, isGenerating, disabled }: ChatInputProps) {
  const [text, setText] = useState("");
  const [models, setModels] = useState<ChatModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [showModelMenu, setShowModelMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 加载模型列表
  useEffect(() => {
    api.chat.models()
      .then((list) => {
        setModels(list);
        const def = list.find((m) => m.default) || list[0];
        if (def) setSelectedModel(def.id);
      })
      .catch(() => {
        // 加载失败时使用默认值
        setModels([{ id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" }]);
        setSelectedModel("claude-sonnet-4-20250514");
      });
  }, []);

  // 自动调整高度
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 20;
    const maxHeight = lineHeight * 6 + 16; // 6 行 + padding
    el.style.height = Math.min(el.scrollHeight, maxHeight) + "px";
  }, []);

  useEffect(() => { adjustHeight(); }, [text, adjustHeight]);

  // 键盘快捷键
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isGenerating || disabled) return;
    onSend(trimmed, selectedModel);
    setText("");
    // 重置高度
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  // 点击外部关闭模型菜单
  useEffect(() => {
    if (!showModelMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showModelMenu]);

  const currentModelName = models.find((m) => m.id === selectedModel)?.name || selectedModel;

  return (
    <div
      className="shrink-0 px-3 py-2"
      style={{ borderTop: "1px solid var(--border)", background: "var(--background-secondary)" }}
    >
      {/* 输入区域 */}
      <div
        className="flex items-end gap-2 rounded-lg px-3 py-2"
        style={{ background: "var(--background)", border: "1px solid var(--border)" }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="发送消息..."
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none text-[12.5px] leading-[20px] outline-none placeholder:opacity-40"
          style={{
            background: "transparent",
            color: "var(--text-primary)",
            minHeight: "20px",
            maxHeight: "136px", // 6行 + padding
          }}
        />

        {/* 发送 / 停止按钮 */}
        {isGenerating ? (
          <button
            onClick={onStop}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md transition-colors hover:brightness-125"
            style={{ background: "var(--danger)", color: "#fff" }}
            title="停止生成"
          >
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim() || disabled}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md transition-colors disabled:opacity-30"
            style={{
              background: text.trim() ? "var(--accent)" : "var(--background-tertiary)",
              color: text.trim() ? "#fff" : "var(--text-tertiary)",
            }}
            title="发送 (Enter)"
          >
            <SendHorizontal size={14} />
          </button>
        )}
      </div>

      {/* 底部栏：模型选择 */}
      <div className="flex items-center mt-1.5 px-1">
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowModelMenu((v) => !v)}
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors hover:brightness-125"
            style={{ color: "var(--text-tertiary)", background: "transparent" }}
          >
            <span className="truncate max-w-[140px]">{currentModelName}</span>
            <ChevronDown size={10} />
          </button>

          {showModelMenu && models.length > 0 && (
            <div
              className="absolute bottom-full left-0 mb-1 min-w-[180px] rounded-lg py-1 shadow-lg z-50"
              style={{ background: "var(--background-secondary)", border: "1px solid var(--border)" }}
            >
              {models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelectedModel(m.id);
                    setShowModelMenu(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-[11px] transition-colors"
                  style={{
                    color: m.id === selectedModel ? "var(--accent)" : "var(--text-secondary)",
                    background: m.id === selectedModel ? "var(--accent-subtle)" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (m.id !== selectedModel) e.currentTarget.style.background = "var(--background-tertiary)";
                  }}
                  onMouseLeave={(e) => {
                    if (m.id !== selectedModel) e.currentTarget.style.background = "transparent";
                  }}
                >
                  {m.name}
                  {m.default && (
                    <span className="ml-1.5 text-[9px] opacity-50">default</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
