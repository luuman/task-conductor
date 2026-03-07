// frontend/src/components/ChatInput.tsx
// 聊天输入组件：多行输入 + 模型选择 + 文件上传 + 发送/停止按钮

import { useState, useRef, useEffect, useCallback } from "react";
import { SendHorizontal, Square, ChevronDown, Paperclip, X } from "lucide-react";
import { api, type ChatModel } from "../lib/api";

interface AttachedFile {
  name: string;
  content: string;
  size: number;
}

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
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载模型列表
  useEffect(() => {
    api.chat.models()
      .then((list) => {
        setModels(list);
        const def = list.find((m) => m.default) || list[0];
        if (def) setSelectedModel(def.id);
      })
      .catch(() => {
        setModels([{ id: "claude-sonnet-4-20250514", name: "Sonnet 4" }]);
        setSelectedModel("claude-sonnet-4-20250514");
      });
  }, []);

  // 自动调整高度
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 20;
    const maxHeight = lineHeight * 6 + 16;
    el.style.height = Math.min(el.scrollHeight, maxHeight) + "px";
  }, []);

  useEffect(() => { adjustHeight(); }, [text, adjustHeight]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 构建带文件内容的消息
  const buildMessage = (userText: string): string => {
    if (attachedFiles.length === 0) return userText;
    const fileParts = attachedFiles.map(f =>
      `<file name="${f.name}">\n${f.content}\n</file>`
    ).join("\n\n");
    return `${fileParts}\n\n${userText}`;
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if ((!trimmed && attachedFiles.length === 0) || isGenerating || disabled) return;
    const msg = buildMessage(trimmed);
    onSend(msg, selectedModel);
    setText("");
    setAttachedFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  // 文件读取
  const readFiles = (files: FileList | File[]) => {
    Array.from(files).forEach(file => {
      if (file.size > 512 * 1024) {
        // 大于 512KB 跳过
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        setAttachedFiles(prev => [...prev, { name: file.name, content, size: file.size }]);
      };
      reader.readAsText(file);
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) readFiles(e.target.files);
    e.target.value = "";
  };

  const removeFile = (idx: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  // 拖拽上传
  const [dragOver, setDragOver] = useState(false);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) readFiles(e.dataTransfer.files);
  }, []);

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
  const hasContent = text.trim() || attachedFiles.length > 0;

  return (
    <div
      className="shrink-0 px-3 py-2"
      style={{ borderTop: "1px solid var(--border)", background: "var(--background-secondary)" }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* 已附加的文件标签 */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5 px-1">
          {attachedFiles.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md"
                  style={{ background: "var(--background-tertiary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
              <span className="truncate max-w-[120px]">{f.name}</span>
              <span className="opacity-40">{(f.size / 1024).toFixed(0)}K</span>
              <button onClick={() => removeFile(i)} className="opacity-50 hover:opacity-100 transition-opacity">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 输入区域 */}
      <div
        className="flex items-end gap-2 rounded-lg px-3 py-2 transition-colors"
        style={{
          background: "var(--background)",
          border: dragOver ? "1px solid var(--accent)" : "1px solid var(--border)",
        }}
      >
        {/* 文件上传按钮 */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isGenerating || disabled}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md transition-colors hover:brightness-125 disabled:opacity-30"
          style={{ color: "var(--text-tertiary)" }}
          title="上传文件"
        >
          <Paperclip size={14} />
        </button>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />

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
            maxHeight: "136px",
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
            disabled={!hasContent || disabled}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md transition-colors disabled:opacity-30"
            style={{
              background: hasContent ? "var(--accent)" : "var(--background-tertiary)",
              color: hasContent ? "#fff" : "var(--text-tertiary)",
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

        {/* 拖拽提示 */}
        {dragOver && (
          <span className="ml-2 text-[10px]" style={{ color: "var(--accent)" }}>
            松开以上传文件
          </span>
        )}
      </div>
    </div>
  );
}
