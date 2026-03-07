// frontend/src/components/ChatInput.tsx
// Discord 风格聊天输入组件：/ 命令面板 + 模型选择 + 文件上传

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { SendHorizontal, Square, Paperclip, X, Hash, Cpu, Download, Trash2, Plus, HelpCircle } from "lucide-react";
import { api, type ChatModel } from "../lib/api";

// ── 类型定义 ────────────────────────────────────────────────────

interface AttachedFile {
  name: string;
  content: string;
  size: number;
}

interface SlashCommand {
  name: string;
  description: string;
  icon: React.ReactNode;
  /** 子选项（如模型列表），为空则直接执行 */
  options?: { label: string; value: string }[];
  /** 执行命令 */
  execute: (option?: string) => void;
}

export interface ChatInputProps {
  onSend: (message: string, model: string) => void;
  onStop: () => void;
  isGenerating: boolean;
  disabled?: boolean;
  onNewChat?: () => void;
  onExport?: () => void;
  onClear?: () => void;
}

// ── 组件 ────────────────────────────────────────────────────────

export function ChatInput({ onSend, onStop, isGenerating, disabled, onNewChat, onExport, onClear }: ChatInputProps) {
  const [text, setText] = useState("");
  const [models, setModels] = useState<ChatModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  // 命令面板状态
  const [showCommands, setShowCommands] = useState(false);
  const [cmdFilter, setCmdFilter] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showSubOptions, setShowSubOptions] = useState<SlashCommand | null>(null);
  const [subSelectedIdx, setSubSelectedIdx] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cmdPanelRef = useRef<HTMLDivElement>(null);

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

  // ── 命令定义 ──────────────────────────────────────────────────

  const commands: SlashCommand[] = useMemo(() => [
    {
      name: "model",
      description: "切换模型",
      icon: <Cpu size={14} />,
      options: models.map(m => ({ label: `${m.name}${m.default ? " (默认)" : ""}`, value: m.id })),
      execute: (modelId?: string) => {
        if (modelId) setSelectedModel(modelId);
      },
    },
    {
      name: "new",
      description: "新建对话",
      icon: <Plus size={14} />,
      execute: () => onNewChat?.(),
    },
    {
      name: "export",
      description: "导出对话为 Markdown",
      icon: <Download size={14} />,
      execute: () => onExport?.(),
    },
    {
      name: "clear",
      description: "清空当前对话",
      icon: <Trash2 size={14} />,
      execute: () => onClear?.(),
    },
    {
      name: "help",
      description: "查看可用命令",
      icon: <HelpCircle size={14} />,
      execute: () => {
        // help 只展示命令列表，不做其他事
      },
    },
  ], [models, onNewChat, onExport, onClear]);

  // 过滤后的命令
  const filteredCommands = useMemo(() => {
    if (!cmdFilter) return commands;
    const q = cmdFilter.toLowerCase();
    return commands.filter(c => c.name.includes(q) || c.description.includes(q));
  }, [commands, cmdFilter]);

  // ── 输入变化处理 ──────────────────────────────────────────────

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    // 检测是否以 / 开头（命令模式）
    if (val.startsWith("/")) {
      const filter = val.slice(1).split(/\s/)[0] || "";
      setCmdFilter(filter);
      setShowCommands(true);
      setShowSubOptions(null);
      setSelectedIdx(0);
    } else {
      setShowCommands(false);
      setShowSubOptions(null);
    }
  };

  // ── 命令选择 ──────────────────────────────────────────────────

  const selectCommand = useCallback((cmd: SlashCommand) => {
    if (cmd.options && cmd.options.length > 0) {
      setShowSubOptions(cmd);
      setSubSelectedIdx(0);
    } else {
      cmd.execute();
      setText("");
      setShowCommands(false);
      setShowSubOptions(null);
      textareaRef.current?.focus();
    }
  }, []);

  const selectSubOption = useCallback((cmd: SlashCommand, optionValue: string) => {
    cmd.execute(optionValue);
    setText("");
    setShowCommands(false);
    setShowSubOptions(null);
    textareaRef.current?.focus();
  }, []);

  // ── 键盘处理 ──────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 命令面板导航
    if (showCommands && !showSubOptions) {
      const list = filteredCommands;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx(prev => (prev - 1 + list.length) % list.length);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx(prev => (prev + 1) % list.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        if (list[selectedIdx]) selectCommand(list[selectedIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowCommands(false);
        setText("");
        return;
      }
    }

    // 子选项导航
    if (showSubOptions) {
      const opts = showSubOptions.options || [];
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSubSelectedIdx(prev => (prev - 1 + opts.length) % opts.length);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSubSelectedIdx(prev => (prev + 1) % opts.length);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (opts[subSelectedIdx]) selectSubOption(showSubOptions, opts[subSelectedIdx].value);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowSubOptions(null);
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        setShowSubOptions(null);
        return;
      }
    }

    // 普通发送
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── 发送 ──────────────────────────────────────────────────────

  const buildMessage = (userText: string): string => {
    if (attachedFiles.length === 0) return userText;
    const fileParts = attachedFiles.map(f =>
      `<file name="${f.name}">\n${f.content}\n</file>`
    ).join("\n\n");
    return `${fileParts}\n\n${userText}`;
  };

  const handleSend = () => {
    if (showCommands || showSubOptions) return; // 命令模式下不发送
    const trimmed = text.trim();
    if ((!trimmed && attachedFiles.length === 0) || isGenerating || disabled) return;
    onSend(buildMessage(trimmed), selectedModel);
    setText("");
    setAttachedFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  // ── 文件处理 ──────────────────────────────────────────────────

  const readFiles = (files: FileList | File[]) => {
    Array.from(files).forEach(file => {
      if (file.size > 512 * 1024) return;
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedFiles(prev => [...prev, { name: file.name, content: reader.result as string, size: file.size }]);
      };
      reader.readAsText(file);
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) readFiles(e.target.files);
    e.target.value = "";
  };

  const removeFile = (idx: number) => setAttachedFiles(prev => prev.filter((_, i) => i !== idx));

  const [dragOver, setDragOver] = useState(false);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) readFiles(e.dataTransfer.files);
  }, []);

  // ── 自动调整高度 ──────────────────────────────────────────────

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 136) + "px";
  }, []);

  useEffect(() => { adjustHeight(); }, [text, adjustHeight]);

  // 点击外部关闭命令面板
  useEffect(() => {
    if (!showCommands && !showSubOptions) return;
    const handler = (e: MouseEvent) => {
      if (cmdPanelRef.current && !cmdPanelRef.current.contains(e.target as Node)) {
        setShowCommands(false);
        setShowSubOptions(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCommands, showSubOptions]);

  // 确保选中项可见
  useEffect(() => {
    const panel = cmdPanelRef.current;
    if (!panel) return;
    const active = panel.querySelector("[data-active='true']");
    active?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx, subSelectedIdx]);

  const currentModelName = models.find((m) => m.id === selectedModel)?.name || selectedModel;
  const hasContent = text.trim() || attachedFiles.length > 0;

  return (
    <div
      className="shrink-0 px-3 py-2 relative"
      style={{ borderTop: "1px solid var(--border)", background: "var(--background-secondary)" }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* ── 命令面板（Discord 风格弹出） ── */}
      {(showCommands || showSubOptions) && (
        <div
          ref={cmdPanelRef}
          className="absolute bottom-full left-3 right-3 mb-1 rounded-lg shadow-xl overflow-hidden z-50"
          style={{ background: "var(--background)", border: "1px solid var(--border)" }}
        >
          {/* 标题栏 */}
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
               style={{ color: "var(--text-tertiary)", background: "var(--background-secondary)", borderBottom: "1px solid var(--border)" }}>
            <Hash size={10} className="inline mr-1 -mt-0.5" />
            {showSubOptions ? showSubOptions.name : "命令"}
          </div>

          {/* 命令列表 / 子选项列表 */}
          <div className="max-h-[240px] overflow-y-auto py-1">
            {showSubOptions ? (
              // 子选项列表
              (showSubOptions.options || []).map((opt, i) => (
                <button
                  key={opt.value}
                  data-active={i === subSelectedIdx}
                  onClick={() => selectSubOption(showSubOptions, opt.value)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                  style={{
                    background: i === subSelectedIdx ? "var(--accent-subtle)" : "transparent",
                    color: i === subSelectedIdx ? "var(--accent)" : "var(--text-secondary)",
                  }}
                  onMouseEnter={() => setSubSelectedIdx(i)}
                >
                  <Cpu size={13} className="shrink-0 opacity-50" />
                  <span className="text-[12px]">{opt.label}</span>
                  {opt.value === selectedModel && (
                    <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded"
                          style={{ background: "var(--accent)", color: "#fff" }}>当前</span>
                  )}
                </button>
              ))
            ) : (
              // 命令列表
              filteredCommands.map((cmd, i) => (
                <button
                  key={cmd.name}
                  data-active={i === selectedIdx}
                  onClick={() => selectCommand(cmd)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors group"
                  style={{
                    background: i === selectedIdx ? "var(--accent-subtle)" : "transparent",
                  }}
                  onMouseEnter={() => setSelectedIdx(i)}
                >
                  <span className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center"
                        style={{
                          background: i === selectedIdx ? "var(--accent)" : "var(--background-tertiary)",
                          color: i === selectedIdx ? "#fff" : "var(--text-tertiary)",
                        }}>
                    {cmd.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium"
                         style={{ color: i === selectedIdx ? "var(--accent)" : "var(--text-primary)" }}>
                      /{cmd.name}
                    </div>
                    <div className="text-[10px]"
                         style={{ color: "var(--text-tertiary)" }}>
                      {cmd.description}
                    </div>
                  </div>
                  {cmd.options && (
                    <span className="text-[10px] opacity-40 shrink-0">▸</span>
                  )}
                </button>
              ))
            )}
            {!showSubOptions && filteredCommands.length === 0 && (
              <div className="px-3 py-4 text-center text-[11px]"
                   style={{ color: "var(--text-tertiary)" }}>
                没有匹配的命令
              </div>
            )}
          </div>

          {/* 底部提示 */}
          <div className="px-3 py-1.5 flex items-center gap-3 text-[9px]"
               style={{ color: "var(--text-tertiary)", background: "var(--background-secondary)", borderTop: "1px solid var(--border)" }}>
            <span><kbd className="px-1 py-0.5 rounded text-[8px]" style={{ background: "var(--background-tertiary)", border: "1px solid var(--border)" }}>↑↓</kbd> 导航</span>
            <span><kbd className="px-1 py-0.5 rounded text-[8px]" style={{ background: "var(--background-tertiary)", border: "1px solid var(--border)" }}>Enter</kbd> 选择</span>
            <span><kbd className="px-1 py-0.5 rounded text-[8px]" style={{ background: "var(--background-tertiary)", border: "1px solid var(--border)" }}>Esc</kbd> 关闭</span>
          </div>
        </div>
      )}

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
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="输入消息，/ 打开命令..."
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none text-[12.5px] leading-[20px] outline-none placeholder:opacity-40"
          style={{ background: "transparent", color: "var(--text-primary)", minHeight: "20px", maxHeight: "136px" }}
        />

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
            disabled={!hasContent || disabled || showCommands}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md transition-colors disabled:opacity-30"
            style={{
              background: hasContent && !showCommands ? "var(--accent)" : "var(--background-tertiary)",
              color: hasContent && !showCommands ? "#fff" : "var(--text-tertiary)",
            }}
            title="发送 (Enter)"
          >
            <SendHorizontal size={14} />
          </button>
        )}
      </div>

      {/* 底部状态栏 */}
      <div className="flex items-center mt-1.5 px-1 gap-2">
        <span className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ color: "var(--text-tertiary)" }}>
          {currentModelName}
        </span>
        {dragOver && (
          <span className="text-[10px]" style={{ color: "var(--accent)" }}>松开以上传文件</span>
        )}
        <span className="ml-auto text-[9px] opacity-30">/ 命令</span>
      </div>
    </div>
  );
}
