// frontend/src/components/ChatInput.tsx
// Discord 风格聊天输入：/ 命令面板 + 模型选择 + 文件上传

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  SendHorizontal, Square, Paperclip, X, Hash,
  Cpu, Download, Trash2, Plus, HelpCircle,
  Terminal, Gauge, Shield, FolderOpen, Wallet,
  Zap, MessageSquarePlus, RotateCcw, BrainCircuit,
  SlidersHorizontal, Ban,
} from "lucide-react";
import { api, type ChatModel } from "../lib/api";
import type { ChatOptions } from "../hooks/useChatWs";

// ── 类型 ────────────────────────────────────────────────────────

interface AttachedFile { name: string; content: string; size: number }

type CmdAction =
  | { type: "select"; options: { label: string; value: string; current?: boolean }[] }
  | { type: "input"; placeholder: string }
  | { type: "immediate" };

interface SlashCommand {
  name: string;
  description: string;
  icon: React.ReactNode;
  action: CmdAction;
  execute: (value?: string) => void;
}

export interface ChatInputProps {
  onSend: (message: string, model: string, options?: ChatOptions) => void;
  onStop: () => void;
  isGenerating: boolean;
  disabled?: boolean;
  onNewChat?: () => void;
  onExport?: () => void;
  onClear?: () => void;
}

// ── 组件 ────────────────────────────────────────────────────────

export function ChatInput({ onSend, onStop, isGenerating, disabled, onNewChat, onExport, onClear }: ChatInputProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [models, setModels] = useState<ChatModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  // 持久化的 Claude 参数
  const [chatOptions, setChatOptions] = useState<ChatOptions>({});

  // 命令面板
  const [showCommands, setShowCommands] = useState(false);
  const [cmdFilter, setCmdFilter] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [activeCmd, setActiveCmd] = useState<SlashCommand | null>(null); // 带子面板的命令
  const [subSelectedIdx, setSubSelectedIdx] = useState(0);
  const [inputMode, setInputMode] = useState(false); // 输入参数模式
  const [inputPlaceholder, setInputPlaceholder] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cmdPanelRef = useRef<HTMLDivElement>(null);

  // 加载模型
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
      description: t('chatInput.switchModel'),
      icon: <Cpu size={14} />,
      action: { type: "select", options: models.map(m => ({ label: m.name + (m.default ? ` (${t('chatInput.default')})` : ""), value: m.id, current: m.id === selectedModel })) },
      execute: (v) => { if (v) setSelectedModel(v); },
    },
    {
      name: "effort",
      description: t('chatInput.effortDesc'),
      icon: <Gauge size={14} />,
      action: { type: "select", options: [
        { label: t('chatInput.effortLow'), value: "low", current: chatOptions.effort === "low" },
        { label: t('chatInput.effortMedium'), value: "medium", current: chatOptions.effort === "medium" },
        { label: t('chatInput.effortHigh'), value: "high", current: chatOptions.effort === "high" },
      ]},
      execute: (v) => setChatOptions(prev => ({ ...prev, effort: v })),
    },
    {
      name: "system",
      description: t('chatInput.systemPrompt'),
      icon: <BrainCircuit size={14} />,
      action: { type: "input", placeholder: t('chatInput.systemPromptPlaceholder') },
      execute: (v) => setChatOptions(prev => ({ ...prev, system_prompt: v || undefined })),
    },
    {
      name: "append-system",
      description: t('chatInput.appendPrompt'),
      icon: <MessageSquarePlus size={14} />,
      action: { type: "input", placeholder: t('chatInput.appendPromptPlaceholder') },
      execute: (v) => setChatOptions(prev => ({ ...prev, append_system_prompt: v || undefined })),
    },
    {
      name: "cwd",
      description: t('chatInput.setCwd'),
      icon: <FolderOpen size={14} />,
      action: { type: "input", placeholder: t('chatInput.cwdPlaceholder') },
      execute: (v) => setChatOptions(prev => ({ ...prev, cwd: v || undefined })),
    },
    {
      name: "permission",
      description: t('chatInput.permissionMode'),
      icon: <Shield size={14} />,
      action: { type: "select", options: [
        { label: t('chatInput.permDefault'), value: "default", current: chatOptions.permission_mode === "default" },
        { label: t('chatInput.permAuto'), value: "auto", current: chatOptions.permission_mode === "auto" },
        { label: t('chatInput.permPlan'), value: "plan", current: chatOptions.permission_mode === "plan" },
        { label: t('chatInput.permAcceptEdits'), value: "acceptEdits", current: chatOptions.permission_mode === "acceptEdits" },
        { label: t('chatInput.permBypass'), value: "bypassPermissions", current: chatOptions.permission_mode === "bypassPermissions" },
      ]},
      execute: (v) => setChatOptions(prev => ({ ...prev, permission_mode: v || undefined })),
    },
    {
      name: "budget",
      description: t('chatInput.maxBudget'),
      icon: <Wallet size={14} />,
      action: { type: "input", placeholder: t('chatInput.budgetPlaceholder') },
      execute: (v) => setChatOptions(prev => ({ ...prev, max_budget: v ? parseFloat(v) : undefined })),
    },
    {
      name: "allow-tools",
      description: t('chatInput.allowTools'),
      icon: <SlidersHorizontal size={14} />,
      action: { type: "input", placeholder: t('chatInput.allowToolsPlaceholder') },
      execute: (v) => setChatOptions(prev => ({ ...prev, allowed_tools: v ? v.split(",").map(s => s.trim()) : undefined })),
    },
    {
      name: "disallow-tools",
      description: t('chatInput.disallowTools'),
      icon: <Ban size={14} />,
      action: { type: "input", placeholder: t('chatInput.disallowToolsPlaceholder') },
      execute: (v) => setChatOptions(prev => ({ ...prev, disallowed_tools: v ? v.split(",").map(s => s.trim()) : undefined })),
    },
    {
      name: "continue",
      description: t('chatInput.continueChat'),
      icon: <RotateCcw size={14} />,
      action: { type: "immediate" },
      execute: () => setChatOptions(prev => ({ ...prev, continue: true })),
    },
    {
      name: "resume",
      description: t('chatInput.resumeSession'),
      icon: <Zap size={14} />,
      action: { type: "input", placeholder: t('chatInput.sessionIdPlaceholder') },
      execute: (v) => setChatOptions(prev => ({ ...prev, session_id: v || undefined })),
    },
    {
      name: "new",
      description: t('chatInput.newChat'),
      icon: <Plus size={14} />,
      action: { type: "immediate" },
      execute: () => { setChatOptions({}); onNewChat?.(); },
    },
    {
      name: "export",
      description: t('chatInput.exportChat'),
      icon: <Download size={14} />,
      action: { type: "immediate" },
      execute: () => onExport?.(),
    },
    {
      name: "clear",
      description: t('chatInput.clearChat'),
      icon: <Trash2 size={14} />,
      action: { type: "immediate" },
      execute: () => onClear?.(),
    },
    {
      name: "reset",
      description: t('chatInput.resetAll'),
      icon: <Terminal size={14} />,
      action: { type: "immediate" },
      execute: () => {
        setChatOptions({});
        const def = models.find(m => m.default) || models[0];
        if (def) setSelectedModel(def.id);
      },
    },
    {
      name: "help",
      description: t('chatInput.showHelp'),
      icon: <HelpCircle size={14} />,
      action: { type: "immediate" },
      execute: () => { /* noop */ },
    },
  ], [models, selectedModel, chatOptions, onNewChat, onExport, onClear]);

  const filteredCommands = useMemo(() => {
    if (!cmdFilter) return commands;
    const q = cmdFilter.toLowerCase();
    return commands.filter(c => c.name.includes(q) || c.description.includes(q));
  }, [commands, cmdFilter]);

  // ── 输入处理 ──────────────────────────────────────────────────

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    if (inputMode) return; // 输入参数模式下不检测 /

    if (val.startsWith("/")) {
      const filter = val.slice(1).split(/\s/)[0] || "";
      setCmdFilter(filter);
      setShowCommands(true);
      setActiveCmd(null);
      setSelectedIdx(0);
    } else {
      setShowCommands(false);
      setActiveCmd(null);
    }
  };

  // ── 命令选择 ──────────────────────────────────────────────────

  const closePanel = useCallback(() => {
    setText("");
    setShowCommands(false);
    setActiveCmd(null);
    setInputMode(false);
    textareaRef.current?.focus();
  }, []);

  const selectCommand = useCallback((cmd: SlashCommand) => {
    if (cmd.action.type === "select") {
      setActiveCmd(cmd);
      setSubSelectedIdx(0);
    } else if (cmd.action.type === "input") {
      // 进入输入模式
      setActiveCmd(cmd);
      setInputMode(true);
      setInputPlaceholder(cmd.action.placeholder);
      setText("");
      setShowCommands(false);
    } else {
      cmd.execute();
      closePanel();
    }
  }, [closePanel]);

  const selectSubOption = useCallback((cmd: SlashCommand, value: string) => {
    cmd.execute(value);
    closePanel();
  }, [closePanel]);

  const submitInput = useCallback(() => {
    if (!activeCmd) return;
    activeCmd.execute(text.trim());
    closePanel();
  }, [activeCmd, text, closePanel]);

  // ── 键盘 ──────────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 输入参数模式
    if (inputMode && activeCmd) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitInput();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closePanel();
        return;
      }
      return;
    }

    // 子选项导航
    if (activeCmd && activeCmd.action.type === "select") {
      const opts = activeCmd.action.options || [];
      if (e.key === "ArrowUp") { e.preventDefault(); setSubSelectedIdx(p => (p - 1 + opts.length) % opts.length); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSubSelectedIdx(p => (p + 1) % opts.length); return; }
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (opts[subSelectedIdx]) selectSubOption(activeCmd, opts[subSelectedIdx].value); return; }
      if (e.key === "Escape" || e.key === "Backspace") { e.preventDefault(); setActiveCmd(null); return; }
      return;
    }

    // 命令列表导航
    if (showCommands) {
      const list = filteredCommands;
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx(p => (p - 1 + list.length) % list.length); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(p => (p + 1) % list.length); return; }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); if (list[selectedIdx]) selectCommand(list[selectedIdx]); return; }
      if (e.key === "Escape") { e.preventDefault(); closePanel(); return; }
      return;
    }

    // 普通发送
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── 发送 ──────────────────────────────────────────────────────

  const buildMessage = (userText: string): string => {
    if (attachedFiles.length === 0) return userText;
    const fileParts = attachedFiles.map(f => `<file name="${f.name}">\n${f.content}\n</file>`).join("\n\n");
    return `${fileParts}\n\n${userText}`;
  };

  const handleSend = () => {
    if (showCommands || activeCmd || inputMode) return;
    const trimmed = text.trim();
    if ((!trimmed && attachedFiles.length === 0) || isGenerating || disabled) return;
    onSend(buildMessage(trimmed), selectedModel, chatOptions);
    setText("");
    setAttachedFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  // ── 文件 ──────────────────────────────────────────────────────

  const readFiles = (files: FileList | File[]) => {
    Array.from(files).forEach(file => {
      if (file.size > 512 * 1024) return;
      const reader = new FileReader();
      reader.onload = () => setAttachedFiles(prev => [...prev, { name: file.name, content: reader.result as string, size: file.size }]);
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

  // ── 高度 ──────────────────────────────────────────────────────

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 136) + "px";
  }, []);
  useEffect(() => { adjustHeight(); }, [text, adjustHeight]);

  // 关闭面板
  useEffect(() => {
    if (!showCommands && !activeCmd) return;
    const handler = (e: MouseEvent) => {
      if (cmdPanelRef.current && !cmdPanelRef.current.contains(e.target as Node)) closePanel();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCommands, activeCmd, closePanel]);

  // 滚动选中项
  useEffect(() => {
    const el = cmdPanelRef.current?.querySelector("[data-active='true']");
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx, subSelectedIdx]);

  const currentModelName = models.find(m => m.id === selectedModel)?.name || selectedModel;
  const hasContent = text.trim() || attachedFiles.length > 0;
  const panelOpen = showCommands || !!activeCmd;

  // 活跃参数标签
  const activeParams = useMemo(() => {
    const tags: { label: string; key: string }[] = [];
    if (chatOptions.effort) tags.push({ label: `effort:${chatOptions.effort}`, key: "effort" });
    if (chatOptions.system_prompt) tags.push({ label: "system-prompt", key: "system_prompt" });
    if (chatOptions.append_system_prompt) tags.push({ label: "append-system", key: "append_system_prompt" });
    if (chatOptions.cwd) tags.push({ label: `cwd:${chatOptions.cwd.split("/").pop()}`, key: "cwd" });
    if (chatOptions.permission_mode) tags.push({ label: `perm:${chatOptions.permission_mode}`, key: "permission_mode" });
    if (chatOptions.max_budget) tags.push({ label: `budget:$${chatOptions.max_budget}`, key: "max_budget" });
    if (chatOptions.allowed_tools?.length) tags.push({ label: `tools:${chatOptions.allowed_tools.length}`, key: "allowed_tools" });
    if (chatOptions.disallowed_tools?.length) tags.push({ label: `deny:${chatOptions.disallowed_tools.length}`, key: "disallowed_tools" });
    if (chatOptions.continue) tags.push({ label: "continue", key: "continue" });
    if (chatOptions.session_id) tags.push({ label: `session:${chatOptions.session_id.slice(0, 8)}`, key: "session_id" });
    return tags;
  }, [chatOptions]);

  const removeParam = (key: string) => {
    setChatOptions(prev => {
      const next = { ...prev };
      delete (next as Record<string, unknown>)[key];
      return next;
    });
  };

  return (
    <div
      className="shrink-0 px-3 py-2 relative"
      style={{ borderTop: "1px solid var(--border)", background: "var(--background-secondary)" }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* ── 命令面板 ── */}
      {panelOpen && (
        <div
          ref={cmdPanelRef}
          className="absolute bottom-full left-3 right-3 mb-1 rounded-lg shadow-xl overflow-hidden z-50"
          style={{ background: "var(--background)", border: "1px solid var(--border)" }}
        >
          {/* 标题 */}
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
               style={{ color: "var(--text-tertiary)", background: "var(--background-secondary)", borderBottom: "1px solid var(--border)" }}>
            <Hash size={10} className="inline mr-1 -mt-0.5" />
            {inputMode && activeCmd ? `/${activeCmd.name}` : activeCmd ? activeCmd.name : t('chatInput.commands')}
          </div>

          {/* 输入参数模式 */}
          {inputMode && activeCmd && (
            <div className="px-3 py-3">
              <p className="text-[10px] mb-2" style={{ color: "var(--text-tertiary)" }}>{activeCmd.description}</p>
              <div className="text-[11px] px-2 py-1.5 rounded"
                   style={{ color: "var(--text-secondary)", background: "var(--background-secondary)", border: "1px solid var(--border)" }}>
                {t('chatInput.enterToConfirm')}
              </div>
            </div>
          )}

          {/* 列表 */}
          {!inputMode && (
            <div className="max-h-[280px] overflow-y-auto py-1">
              {activeCmd && activeCmd.action.type === "select" ? (
                (activeCmd.action.options).map((opt, i) => (
                  <button
                    key={opt.value}
                    data-active={i === subSelectedIdx}
                    onClick={() => selectSubOption(activeCmd, opt.value)}
                    onMouseEnter={() => setSubSelectedIdx(i)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                    style={{
                      background: i === subSelectedIdx ? "var(--accent-subtle)" : "transparent",
                      color: i === subSelectedIdx ? "var(--accent)" : "var(--text-secondary)",
                    }}
                  >
                    <span className="text-[12px] flex-1">{opt.label}</span>
                    {opt.current && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "var(--accent)", color: "#fff" }}>{t('chatInput.current')}</span>
                    )}
                  </button>
                ))
              ) : (
                filteredCommands.map((cmd, i) => (
                  <button
                    key={cmd.name}
                    data-active={i === selectedIdx}
                    onClick={() => selectCommand(cmd)}
                    onMouseEnter={() => setSelectedIdx(i)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                    style={{ background: i === selectedIdx ? "var(--accent-subtle)" : "transparent" }}
                  >
                    <span className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center"
                          style={{
                            background: i === selectedIdx ? "var(--accent)" : "var(--background-tertiary)",
                            color: i === selectedIdx ? "#fff" : "var(--text-tertiary)",
                          }}>
                      {cmd.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium" style={{ color: i === selectedIdx ? "var(--accent)" : "var(--text-primary)" }}>
                        /{cmd.name}
                      </div>
                      <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{cmd.description}</div>
                    </div>
                    {cmd.action.type === "select" && <span className="text-[10px] opacity-40 shrink-0">▸</span>}
                    {cmd.action.type === "input" && <span className="text-[10px] opacity-40 shrink-0">⌨</span>}
                  </button>
                ))
              )}
              {!activeCmd && filteredCommands.length === 0 && (
                <div className="px-3 py-4 text-center text-[11px]" style={{ color: "var(--text-tertiary)" }}>{t('chatInput.noMatch')}</div>
              )}
            </div>
          )}

          {/* 底部提示 */}
          <div className="px-3 py-1.5 flex items-center gap-3 text-[9px]"
               style={{ color: "var(--text-tertiary)", background: "var(--background-secondary)", borderTop: "1px solid var(--border)" }}>
            {inputMode
              ? <><Kbd>Enter</Kbd><span>确认</span><Kbd>Esc</Kbd><span>取消</span></>
              : <><Kbd>↑↓</Kbd><span>导航</span><Kbd>Enter</Kbd><span>选择</span><Kbd>Esc</Kbd><span>关闭</span></>
            }
          </div>
        </div>
      )}

      {/* 活跃参数标签 */}
      {activeParams.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5 px-1">
          {activeParams.map(t => (
            <span key={t.key} className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(68,119,255,0.1)", color: "var(--accent)", border: "1px solid rgba(68,119,255,0.2)" }}>
              {t.label}
              <button onClick={() => removeParam(t.key)} className="opacity-60 hover:opacity-100"><X size={8} /></button>
            </span>
          ))}
        </div>
      )}

      {/* 文件标签 */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5 px-1">
          {attachedFiles.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md"
                  style={{ background: "var(--background-tertiary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
              <span className="truncate max-w-[120px]">{f.name}</span>
              <span className="opacity-40">{(f.size / 1024).toFixed(0)}K</span>
              <button onClick={() => removeFile(i)} className="opacity-50 hover:opacity-100"><X size={10} /></button>
            </span>
          ))}
        </div>
      )}

      {/* 输入区域 */}
      <div
        className="flex items-end gap-2 rounded-lg px-3 py-2 transition-colors"
        style={{ background: "var(--background)", border: dragOver ? "1px solid var(--accent)" : "1px solid var(--border)" }}
      >
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isGenerating || disabled}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md transition-colors hover:brightness-125 disabled:opacity-30"
          style={{ color: "var(--text-tertiary)" }}
          title={t('chatInput.uploadFile')}
        >
          <Paperclip size={14} />
        </button>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={inputMode ? inputPlaceholder : t('chatInput.inputPlaceholder')}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none text-[12.5px] leading-[20px] outline-none placeholder:opacity-40"
          style={{ background: "transparent", color: "var(--text-primary)", minHeight: "20px", maxHeight: "136px" }}
        />

        {isGenerating ? (
          <button onClick={onStop}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md hover:brightness-125"
            style={{ background: "var(--danger)", color: "#fff" }} title={t('chatInput.stopGenerate')}>
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          <button onClick={inputMode ? submitInput : handleSend}
            disabled={(!hasContent && !inputMode) || disabled || (showCommands && !inputMode)}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md transition-colors disabled:opacity-30"
            style={{
              background: (hasContent || inputMode) && !showCommands ? "var(--accent)" : "var(--background-tertiary)",
              color: (hasContent || inputMode) && !showCommands ? "#fff" : "var(--text-tertiary)",
            }}
            title={inputMode ? t('chatInput.confirmInput') : t('chatInput.sendMessage')}>
            <SendHorizontal size={14} />
          </button>
        )}
      </div>

      {/* 底部工具栏 */}
      <div className="flex items-center mt-1.5 px-1 gap-1 flex-wrap">
        {/* 模型选择 */}
        <ToolbarDropdown
          label={currentModelName}
          icon={<Cpu size={11} />}
          options={models.map(m => ({ label: m.name + (m.default ? ` (${t('chatInput.default')})` : ""), value: m.id, active: m.id === selectedModel }))}
          onSelect={(v) => setSelectedModel(v)}
        />

        {/* Plan 模式切换 */}
        <ToolbarToggle
          label="Plan"
          icon={<Shield size={11} />}
          active={chatOptions.permission_mode === "plan"}
          onClick={() => setChatOptions(prev => ({
            ...prev,
            permission_mode: prev.permission_mode === "plan" ? undefined : "plan",
          }))}
        />

        {/* Effort 级别 */}
        <ToolbarDropdown
          label={chatOptions.effort || "effort"}
          icon={<Gauge size={11} />}
          active={!!chatOptions.effort}
          options={[
            { label: t('chatInput.effortLowShort'), value: "low", active: chatOptions.effort === "low" },
            { label: t('chatInput.effortMediumShort'), value: "medium", active: chatOptions.effort === "medium" },
            { label: t('chatInput.effortHighShort'), value: "high", active: chatOptions.effort === "high" },
            ...(chatOptions.effort ? [{ label: t('chatInput.clear'), value: "__clear__", active: false }] : []),
          ]}
          onSelect={(v) => setChatOptions(prev => ({ ...prev, effort: v === "__clear__" ? undefined : v }))}
        />

        {/* 权限模式 */}
        <ToolbarDropdown
          label={chatOptions.permission_mode && chatOptions.permission_mode !== "plan" ? chatOptions.permission_mode : t('chatInput.permission')}
          icon={<Zap size={11} />}
          active={!!chatOptions.permission_mode && chatOptions.permission_mode !== "plan"}
          options={[
            { label: t('chatInput.permDefaultShort'), value: "default", active: chatOptions.permission_mode === "default" },
            { label: t('chatInput.permAutoShort'), value: "auto", active: chatOptions.permission_mode === "auto" },
            { label: t('chatInput.permAcceptEditsShort'), value: "acceptEdits", active: chatOptions.permission_mode === "acceptEdits" },
            { label: t('chatInput.permBypassShort'), value: "bypassPermissions", active: chatOptions.permission_mode === "bypassPermissions" },
            ...(chatOptions.permission_mode && chatOptions.permission_mode !== "plan" ? [{ label: t('chatInput.clear'), value: "__clear__", active: false }] : []),
          ]}
          onSelect={(v) => setChatOptions(prev => ({ ...prev, permission_mode: v === "__clear__" ? undefined : v }))}
        />

        {dragOver && <span className="text-[10px]" style={{ color: "var(--accent)" }}>松开以上传文件</span>}
        <span className="ml-auto text-[9px] opacity-30">/ 更多命令</span>
      </div>
    </div>
  );
}

// ── 小组件 ──────────────────────────────────────────────────────

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1 py-0.5 rounded text-[8px]"
         style={{ background: "var(--background-tertiary)", border: "1px solid var(--border)" }}>
      {children}
    </kbd>
  );
}

/** 工具栏切换按钮 */
function ToolbarToggle({ label, icon, active, onClick }: {
  label: string; icon: React.ReactNode; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors hover:brightness-125"
      style={{
        background: active ? "rgba(68,119,255,0.15)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-tertiary)",
        border: active ? "1px solid rgba(68,119,255,0.3)" : "1px solid transparent",
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/** 工具栏下拉按钮 */
function ToolbarDropdown({ label, icon, active, options, onSelect }: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  options: { label: string; value: string; active?: boolean }[];
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors hover:brightness-125"
        style={{
          background: active ? "rgba(68,119,255,0.15)" : "transparent",
          color: active ? "var(--accent)" : "var(--text-tertiary)",
          border: active ? "1px solid rgba(68,119,255,0.3)" : "1px solid transparent",
        }}
      >
        {icon}
        <span>{label}</span>
        <span className="text-[8px] opacity-50">▾</span>
      </button>

      {open && (
        <div
          className="absolute bottom-full left-0 mb-1 min-w-[160px] rounded-lg shadow-xl overflow-hidden z-50 py-1"
          style={{ background: "var(--background)", border: "1px solid var(--border)" }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onSelect(opt.value); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors hover:brightness-125"
              style={{
                background: opt.active ? "var(--accent-subtle)" : "transparent",
                color: opt.active ? "var(--accent)" : "var(--text-secondary)",
              }}
            >
              <span className="flex-1">{opt.label}</span>
              {opt.active && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
