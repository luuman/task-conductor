// frontend/src/components/GlobalConfigPanel.tsx
// 全局配置可视化编辑面板 —— 供 ClaudeConfig 页面嵌入使用
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import {
  Save,
  RotateCcw,
  Download,
  Upload,
  Check,
  AlertTriangle,
  FolderOpen,
  Key,
  Cpu,
  ToggleLeft,
  Settings2,
  Shield,
  Bell,
  Activity,
  GitBranch,
  Palette,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Zap,
  Terminal,
  MessageSquare,
  FileSearch,
  Code2,
  Search,
  GitMerge,
  Bug,
  Gauge,
  Lock,
  FileOutput,
  Wifi,
  Layers,
  Database,
  Puzzle,
  Stethoscope,
  Command,
  Variable,
} from "lucide-react";
import { api } from "../lib/api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

// ── 分区定义 ─────────────────────────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  desc: string;
  type: "text" | "password" | "number" | "select" | "switch" | "slider" | "textarea" | "json" | "tags" | "kv" | "multicheck";
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  placeholder?: string;
  checkOptions?: { value: string; label: string }[];
}

interface SectionDef {
  id: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  fields: FieldDef[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TFunc = (key: string) => any;

function getSections(t: TFunc): SectionDef[] {
  const s = (section: string, field: string) => t(`globalConfig.sections.${section}.fields.${field}.label`);
  const sd = (section: string, field: string) => t(`globalConfig.sections.${section}.fields.${field}.desc`);
  const sp = (section: string, field: string) => t(`globalConfig.sections.${section}.fields.${field}.placeholder`);
  return [
  {
    id: "project", label: t("globalConfig.sections.project.label"), desc: t("globalConfig.sections.project.desc"),
    icon: FolderOpen, color: "#22c55e",
    fields: [
      { key: "name", label: s("project","name"), desc: sd("project","name"), type: "text", placeholder: "My Project" },
      { key: "description", label: s("project","description"), desc: sd("project","description"), type: "textarea", placeholder: sp("project","description") },
      { key: "workDir", label: s("project","workDir"), desc: sd("project","workDir"), type: "text", placeholder: "./" },
      { key: "framework", label: s("project","framework"), desc: sd("project","framework"), type: "select", options: [
        { value: "auto", label: t("globalConfig.sections.project.frameworkOptions.auto") },
        { value: "python", label: "Python" },
        { value: "javascript", label: "JavaScript" },
        { value: "typescript", label: "TypeScript" },
        { value: "java", label: "Java" },
        { value: "go", label: "Go" },
        { value: "rust", label: "Rust" },
        { value: "cpp", label: "C++" },
        { value: "other", label: t("globalConfig.sections.project.frameworkOptions.other") },
      ]},
    ],
  },
  {
    id: "api", label: t("globalConfig.sections.api.label"), desc: t("globalConfig.sections.api.desc"),
    icon: Key, color: "#f59e0b",
    fields: [
      { key: "apiKey", label: s("api","apiKey"), desc: sd("api","apiKey"), type: "password", placeholder: "sk-ant-..." },
      { key: "endpoint", label: s("api","endpoint"), desc: sd("api","endpoint"), type: "text", placeholder: "https://api.anthropic.com" },
      { key: "version", label: s("api","version"), desc: sd("api","version"), type: "select", options: [
        { value: "v1", label: "v1" },
        { value: "v2", label: "v2" },
        { value: "beta", label: "beta" },
      ]},
      { key: "timeout", label: s("api","timeout"), desc: sd("api","timeout"), type: "number", min: 5, max: 300, unit: "s", placeholder: "30" },
      { key: "retries", label: s("api","retries"), desc: sd("api","retries"), type: "number", min: 0, max: 10, placeholder: "3" },
    ],
  },
  {
    id: "model", label: t("globalConfig.sections.model.label"), desc: t("globalConfig.sections.model.desc"),
    icon: Cpu, color: "#8b5cf6",
    fields: [
      { key: "model", label: s("model","model"), desc: sd("model","model"), type: "select", options: [
        { value: "claude-opus-4-6", label: t("globalConfig.sections.model.modelOptions.opus") },
        { value: "claude-sonnet-4-6", label: t("globalConfig.sections.model.modelOptions.sonnet") },
        { value: "claude-haiku-4-5-20251001", label: t("globalConfig.sections.model.modelOptions.haiku") },
      ]},
      { key: "temperature", label: s("model","temperature"), desc: sd("model","temperature"), type: "slider", min: 0, max: 1, step: 0.05 },
      { key: "maxTokens", label: s("model","maxTokens"), desc: sd("model","maxTokens"), type: "number", min: 256, max: 200000, placeholder: "4096" },
      { key: "topP", label: s("model","topP"), desc: sd("model","topP"), type: "slider", min: 0, max: 1, step: 0.05 },
      { key: "frequencyPenalty", label: s("model","frequencyPenalty"), desc: sd("model","frequencyPenalty"), type: "slider", min: 0, max: 2, step: 0.1 },
      { key: "presencePenalty", label: s("model","presencePenalty"), desc: sd("model","presencePenalty"), type: "slider", min: 0, max: 2, step: 0.1 },
    ],
  },
  {
    id: "features", label: t("globalConfig.sections.features.label"), desc: t("globalConfig.sections.features.desc"),
    icon: ToggleLeft, color: "#06b6d4",
    fields: [
      { key: "autoComplete", label: s("features","autoComplete"), desc: sd("features","autoComplete"), type: "switch" },
      { key: "realTimeAnalysis", label: s("features","realTimeAnalysis"), desc: sd("features","realTimeAnalysis"), type: "switch" },
      { key: "errorDetection", label: s("features","errorDetection"), desc: sd("features","errorDetection"), type: "switch" },
      { key: "performanceSuggestions", label: s("features","performanceSuggestions"), desc: sd("features","performanceSuggestions"), type: "switch" },
      { key: "securityAudit", label: s("features","securityAudit"), desc: sd("features","securityAudit"), type: "switch" },
      { key: "docGeneration", label: s("features","docGeneration"), desc: sd("features","docGeneration"), type: "switch" },
    ],
  },
  {
    id: "advanced", label: t("globalConfig.sections.advanced.label"), desc: t("globalConfig.sections.advanced.desc"),
    icon: Settings2, color: "#64748b",
    fields: [
      { key: "concurrency", label: s("advanced","concurrency"), desc: sd("advanced","concurrency"), type: "number", min: 1, max: 50, placeholder: "5" },
      { key: "cacheSize", label: s("advanced","cacheSize"), desc: sd("advanced","cacheSize"), type: "select", options: [
        { value: "50", label: "50 MB" },
        { value: "100", label: "100 MB" },
        { value: "200", label: "200 MB" },
        { value: "500", label: "500 MB" },
      ]},
      { key: "logLevel", label: s("advanced","logLevel"), desc: sd("advanced","logLevel"), type: "select", options: [
        { value: "debug", label: "Debug" },
        { value: "info", label: "Info" },
        { value: "warn", label: "Warn" },
        { value: "error", label: "Error" },
      ]},
      { key: "logRetentionDays", label: s("advanced","logRetentionDays"), desc: sd("advanced","logRetentionDays"), type: "number", min: 1, max: 365, unit: t("globalConfig.sections.advanced.units.days"), placeholder: "7" },
      { key: "proxy", label: s("advanced","proxy"), desc: sd("advanced","proxy"), type: "text", placeholder: "http://proxy:8080" },
      { key: "customHeaders", label: s("advanced","customHeaders"), desc: sd("advanced","customHeaders"), type: "json" },
    ],
  },
  {
    id: "permissions", label: t("globalConfig.sections.permissions.label"), desc: t("globalConfig.sections.permissions.desc"),
    icon: Shield, color: "#ef4444",
    fields: [
      { key: "fileAccess", label: s("permissions","fileAccess"), desc: sd("permissions","fileAccess"), type: "multicheck", checkOptions: [
        { value: "read", label: t("globalConfig.sections.permissions.checkOptions.read") },
        { value: "write", label: t("globalConfig.sections.permissions.checkOptions.write") },
        { value: "execute", label: t("globalConfig.sections.permissions.checkOptions.execute") },
      ]},
      { key: "networkAccess", label: s("permissions","networkAccess"), desc: sd("permissions","networkAccess"), type: "switch" },
      { key: "terminalExec", label: s("permissions","terminalExec"), desc: sd("permissions","terminalExec"), type: "switch" },
      { key: "envVars", label: s("permissions","envVars"), desc: sd("permissions","envVars"), type: "kv" },
      { key: "whitelistPaths", label: s("permissions","whitelistPaths"), desc: sd("permissions","whitelistPaths"), type: "tags" },
      { key: "blacklistFiles", label: s("permissions","blacklistFiles"), desc: sd("permissions","blacklistFiles"), type: "tags" },
    ],
  },
  {
    id: "notifications", label: t("globalConfig.sections.notifications.label"), desc: t("globalConfig.sections.notifications.desc"),
    icon: Bell, color: "#f97316",
    fields: [
      { key: "emailEnabled", label: s("notifications","emailEnabled"), desc: sd("notifications","emailEnabled"), type: "switch" },
      { key: "email", label: s("notifications","email"), desc: sd("notifications","email"), type: "text", placeholder: "user@example.com" },
      { key: "slackWebhook", label: s("notifications","slackWebhook"), desc: sd("notifications","slackWebhook"), type: "text", placeholder: "https://hooks.slack.com/..." },
      { key: "discordWebhook", label: s("notifications","discordWebhook"), desc: sd("notifications","discordWebhook"), type: "text", placeholder: "https://discord.com/api/webhooks/..." },
      { key: "notifyLevel", label: s("notifications","notifyLevel"), desc: sd("notifications","notifyLevel"), type: "select", options: [
        { value: "all", label: t("globalConfig.sections.notifications.levelOptions.all") },
        { value: "warn", label: t("globalConfig.sections.notifications.levelOptions.warn") },
        { value: "error", label: t("globalConfig.sections.notifications.levelOptions.error") },
      ]},
    ],
  },
  {
    id: "monitoring", label: t("globalConfig.sections.monitoring.label"), desc: t("globalConfig.sections.monitoring.desc"),
    icon: Activity, color: "#10b981",
    fields: [
      { key: "enabled", label: s("monitoring","enabled"), desc: sd("monitoring","enabled"), type: "switch" },
      { key: "sampleRate", label: s("monitoring","sampleRate"), desc: sd("monitoring","sampleRate"), type: "slider", min: 0, max: 100, step: 5, unit: "%" },
      { key: "alertThresholdMs", label: s("monitoring","alertThresholdMs"), desc: sd("monitoring","alertThresholdMs"), type: "number", min: 100, max: 60000, unit: "ms", placeholder: "2000" },
      { key: "dataRetentionDays", label: s("monitoring","dataRetentionDays"), desc: sd("monitoring","dataRetentionDays"), type: "number", min: 1, max: 365, unit: t("globalConfig.sections.advanced.units.days"), placeholder: "30" },
    ],
  },
  {
    id: "integrations", label: t("globalConfig.sections.integrations.label"), desc: t("globalConfig.sections.integrations.desc"),
    icon: GitBranch, color: "#a855f7",
    fields: [
      { key: "gitAutoCommit", label: s("integrations","gitAutoCommit"), desc: sd("integrations","gitAutoCommit"), type: "switch" },
      { key: "jiraUrl", label: s("integrations","jiraUrl"), desc: sd("integrations","jiraUrl"), type: "text", placeholder: "https://your-org.atlassian.net" },
      { key: "jiraToken", label: s("integrations","jiraToken"), desc: sd("integrations","jiraToken"), type: "password", placeholder: "jira-api-token" },
      { key: "githubToken", label: s("integrations","githubToken"), desc: sd("integrations","githubToken"), type: "password", placeholder: "ghp_..." },
      { key: "slackBotToken", label: s("integrations","slackBotToken"), desc: sd("integrations","slackBotToken"), type: "password", placeholder: "xoxb-..." },
    ],
  },
  {
    id: "ui", label: t("globalConfig.sections.ui.label"), desc: t("globalConfig.sections.ui.desc"),
    icon: Palette, color: "#ec4899",
    fields: [
      { key: "theme", label: s("ui","theme"), desc: sd("ui","theme"), type: "select", options: [
        { value: "system", label: t("globalConfig.sections.ui.themeOptions.system") },
        { value: "dark", label: t("globalConfig.sections.ui.themeOptions.dark") },
        { value: "light", label: t("globalConfig.sections.ui.themeOptions.light") },
      ]},
      { key: "fontSize", label: s("ui","fontSize"), desc: sd("ui","fontSize"), type: "select", options: [
        { value: "small", label: t("globalConfig.sections.ui.fontSizeOptions.small") },
        { value: "medium", label: t("globalConfig.sections.ui.fontSizeOptions.medium") },
        { value: "large", label: t("globalConfig.sections.ui.fontSizeOptions.large") },
      ]},
      { key: "codeHighlight", label: s("ui","codeHighlight"), desc: sd("ui","codeHighlight"), type: "switch" },
      { key: "autoSave", label: s("ui","autoSave"), desc: sd("ui","autoSave"), type: "switch" },
    ],
  },

  // ── CLI 命令行配置 ──────────────────────────────────────────────────

  {
    id: "cli_basic", label: t("globalConfig.cli.basic.label"), desc: t("globalConfig.cli.basic.desc"),
    icon: Terminal, color: "#34d399",
    fields: [
      { key: "mode", label: t("globalConfig.cli.basic.fields.mode.label"), desc: t("globalConfig.cli.basic.fields.mode.desc"), type: "select", options: [
        { value: "interactive", label: t("globalConfig.cli.basic.modeOptions.interactive") },
        { value: "batch", label: t("globalConfig.cli.basic.modeOptions.batch") },
        { value: "daemon", label: t("globalConfig.cli.basic.modeOptions.daemon") },
      ]},
      { key: "configPath", label: t("globalConfig.cli.basic.fields.configPath.label"), desc: t("globalConfig.cli.basic.fields.configPath.desc"), type: "text", placeholder: "~/.claude/config.json" },
      { key: "workspace", label: t("globalConfig.cli.basic.fields.workspace.label"), desc: t("globalConfig.cli.basic.fields.workspace.desc"), type: "text", placeholder: "./my-project" },
      { key: "init", label: t("globalConfig.cli.basic.fields.init.label"), desc: t("globalConfig.cli.basic.fields.init.desc"), type: "switch" },
    ],
  },
  {
    id: "cli_conversation", label: t("globalConfig.cli.conversation.label"), desc: t("globalConfig.cli.conversation.desc"),
    icon: MessageSquare, color: "#60a5fa",
    fields: [
      { key: "newConversation", label: t("globalConfig.cli.conversation.fields.newConversation.label"), desc: t("globalConfig.cli.conversation.fields.newConversation.desc"), type: "switch" },
      { key: "continueSession", label: t("globalConfig.cli.conversation.fields.continueSession.label"), desc: t("globalConfig.cli.conversation.fields.continueSession.desc"), type: "text", placeholder: "session_123" },
      { key: "sessionId", label: t("globalConfig.cli.conversation.fields.sessionId.label"), desc: t("globalConfig.cli.conversation.fields.sessionId.desc"), type: "text", placeholder: "sess_abc123" },
      { key: "contextWindow", label: t("globalConfig.cli.conversation.fields.contextWindow.label"), desc: t("globalConfig.cli.conversation.fields.contextWindow.desc"), type: "number", min: 1, max: 1000, placeholder: "100" },
      { key: "history", label: t("globalConfig.cli.conversation.fields.history.label"), desc: t("globalConfig.cli.conversation.fields.history.desc"), type: "number", min: 1, max: 100, placeholder: "20" },
    ],
  },
  {
    id: "cli_files", label: t("globalConfig.cli.files.label"), desc: t("globalConfig.cli.files.desc"),
    icon: FileSearch, color: "#fbbf24",
    fields: [
      { key: "addFiles", label: t("globalConfig.cli.files.fields.addFiles.label"), desc: t("globalConfig.cli.files.fields.addFiles.desc"), type: "text", placeholder: "src/*.js" },
      { key: "excludeFiles", label: t("globalConfig.cli.files.fields.excludeFiles.label"), desc: t("globalConfig.cli.files.fields.excludeFiles.desc"), type: "text", placeholder: "node_modules" },
      { key: "watchFiles", label: t("globalConfig.cli.files.fields.watchFiles.label"), desc: t("globalConfig.cli.files.fields.watchFiles.desc"), type: "text", placeholder: "src/**/*" },
      { key: "batchFile", label: t("globalConfig.cli.files.fields.batchFile.label"), desc: t("globalConfig.cli.files.fields.batchFile.desc"), type: "text", placeholder: "files.txt" },
      { key: "outputFile", label: t("globalConfig.cli.files.fields.outputFile.label"), desc: t("globalConfig.cli.files.fields.outputFile.desc"), type: "text", placeholder: "result.md" },
      { key: "maxFiles", label: t("globalConfig.cli.files.fields.maxFiles.label"), desc: t("globalConfig.cli.files.fields.maxFiles.desc"), type: "number", min: 1, max: 10000, placeholder: "100" },
    ],
  },
  {
    id: "cli_code", label: t("globalConfig.cli.code.label"), desc: t("globalConfig.cli.code.desc"),
    icon: Code2, color: "#c084fc",
    fields: [
      { key: "review", label: t("globalConfig.cli.code.fields.review.label"), desc: t("globalConfig.cli.code.fields.review.desc"), type: "select", options: [
        { value: "", label: t("globalConfig.cli.code.reviewOptions.off") },
        { value: "normal", label: t("globalConfig.cli.code.reviewOptions.normal") },
        { value: "strict", label: t("globalConfig.cli.code.reviewOptions.strict") },
      ]},
      { key: "refactor", label: t("globalConfig.cli.code.fields.refactor.label"), desc: t("globalConfig.cli.code.fields.refactor.desc"), type: "switch" },
      { key: "deps", label: t("globalConfig.cli.code.fields.deps.label"), desc: t("globalConfig.cli.code.fields.deps.desc"), type: "select", options: [
        { value: "", label: t("globalConfig.cli.code.depsOptions.off") },
        { value: "list", label: t("globalConfig.cli.code.depsOptions.list") },
        { value: "tree", label: t("globalConfig.cli.code.depsOptions.tree") },
      ]},
      { key: "complexity", label: t("globalConfig.cli.code.fields.complexity.label"), desc: t("globalConfig.cli.code.fields.complexity.desc"), type: "number", min: 1, max: 50, placeholder: "10" },
      { key: "stats", label: t("globalConfig.cli.code.fields.stats.label"), desc: t("globalConfig.cli.code.fields.stats.desc"), type: "select", options: [
        { value: "", label: t("globalConfig.cli.code.statsOptions.off") },
        { value: "lines", label: t("globalConfig.cli.code.statsOptions.lines") },
        { value: "functions", label: t("globalConfig.cli.code.statsOptions.functions") },
        { value: "all", label: t("globalConfig.cli.code.statsOptions.all") },
      ]},
      { key: "generateTests", label: t("globalConfig.cli.code.fields.generateTests.label"), desc: t("globalConfig.cli.code.fields.generateTests.desc"), type: "select", options: [
        { value: "", label: t("globalConfig.cli.code.reviewOptions.off") },
        { value: "jest", label: "Jest" },
        { value: "mocha", label: "Mocha" },
        { value: "pytest", label: "Pytest" },
        { value: "vitest", label: "Vitest" },
      ]},
    ],
  },
  {
    id: "cli_search", label: t("globalConfig.cli.search.label"), desc: t("globalConfig.cli.search.desc"),
    icon: Search, color: "#2dd4bf",
    fields: [
      { key: "search", label: t("globalConfig.cli.search.fields.search.label"), desc: t("globalConfig.cli.search.fields.search.desc"), type: "text", placeholder: "find bug in auth module" },
      { key: "query", label: t("globalConfig.cli.search.fields.query.label"), desc: t("globalConfig.cli.search.fields.query.desc"), type: "text", placeholder: "functions>10行" },
      { key: "grep", label: t("globalConfig.cli.search.fields.grep.label"), desc: t("globalConfig.cli.search.fields.grep.desc"), type: "text", placeholder: "TODO.*" },
      { key: "replace", label: t("globalConfig.cli.search.fields.replace.label"), desc: t("globalConfig.cli.search.fields.replace.desc"), type: "text", placeholder: "oldName:newName" },
      { key: "similar", label: t("globalConfig.cli.search.fields.similar.label"), desc: t("globalConfig.cli.search.fields.similar.desc"), type: "text", placeholder: "function_name" },
    ],
  },
  {
    id: "cli_git", label: t("globalConfig.cli.git.label"), desc: t("globalConfig.cli.git.desc"),
    icon: GitMerge, color: "#f472b6",
    fields: [
      { key: "commitMsg", label: t("globalConfig.cli.git.fields.commitMsg.label"), desc: t("globalConfig.cli.git.fields.commitMsg.desc"), type: "switch" },
      { key: "prReview", label: t("globalConfig.cli.git.fields.prReview.label"), desc: t("globalConfig.cli.git.fields.prReview.desc"), type: "text", placeholder: "PR#123" },
      { key: "diff", label: t("globalConfig.cli.git.fields.diff.label"), desc: t("globalConfig.cli.git.fields.diff.desc"), type: "text", placeholder: "HEAD~3" },
      { key: "merge", label: t("globalConfig.cli.git.fields.merge.label"), desc: t("globalConfig.cli.git.fields.merge.desc"), type: "switch" },
      { key: "logAnalysis", label: t("globalConfig.cli.git.fields.logAnalysis.label"), desc: t("globalConfig.cli.git.fields.logAnalysis.desc"), type: "text", placeholder: "30d" },
    ],
  },
  {
    id: "cli_debug", label: t("globalConfig.cli.debug.label"), desc: t("globalConfig.cli.debug.desc"),
    icon: Bug, color: "#fb923c",
    fields: [
      { key: "debug", label: t("globalConfig.cli.debug.fields.debug.label"), desc: t("globalConfig.cli.debug.fields.debug.desc"), type: "select", options: [
        { value: "", label: t("globalConfig.cli.debug.debugOptions.off") },
        { value: "minimal", label: t("globalConfig.cli.debug.debugOptions.minimal") },
        { value: "verbose", label: t("globalConfig.cli.debug.debugOptions.verbose") },
      ]},
      { key: "test", label: t("globalConfig.cli.debug.fields.test.label"), desc: t("globalConfig.cli.debug.fields.test.desc"), type: "text", placeholder: "./tests" },
      { key: "coverage", label: t("globalConfig.cli.debug.fields.coverage.label"), desc: t("globalConfig.cli.debug.fields.coverage.desc"), type: "slider", min: 0, max: 100, step: 5, unit: "%" },
      { key: "breakpoint", label: t("globalConfig.cli.debug.fields.breakpoint.label"), desc: t("globalConfig.cli.debug.fields.breakpoint.desc"), type: "text", placeholder: "file:line" },
      { key: "watchVar", label: t("globalConfig.cli.debug.fields.watchVar.label"), desc: t("globalConfig.cli.debug.fields.watchVar.desc"), type: "text", placeholder: "user.name" },
    ],
  },
  {
    id: "cli_perf", label: t("globalConfig.cli.perf.label"), desc: t("globalConfig.cli.perf.desc"),
    icon: Gauge, color: "#e879f9",
    fields: [
      { key: "profile", label: t("globalConfig.cli.perf.fields.profile.label"), desc: t("globalConfig.cli.perf.fields.profile.desc"), type: "select", options: [
        { value: "", label: t("globalConfig.cli.perf.profileOptions.off") },
        { value: "cpu", label: t("globalConfig.cli.perf.profileOptions.cpu") },
        { value: "memory", label: t("globalConfig.cli.perf.profileOptions.memory") },
        { value: "both", label: t("globalConfig.cli.perf.profileOptions.both") },
      ]},
      { key: "bottleneck", label: t("globalConfig.cli.perf.fields.bottleneck.label"), desc: t("globalConfig.cli.perf.fields.bottleneck.desc"), type: "switch" },
      { key: "optimize", label: t("globalConfig.cli.perf.fields.optimize.label"), desc: t("globalConfig.cli.perf.fields.optimize.desc"), type: "text", placeholder: "query / render / all" },
      { key: "benchmark", label: t("globalConfig.cli.perf.fields.benchmark.label"), desc: t("globalConfig.cli.perf.fields.benchmark.desc"), type: "number", min: 1, max: 100000, placeholder: "1000" },
      { key: "memoryLimit", label: t("globalConfig.cli.perf.fields.memoryLimit.label"), desc: t("globalConfig.cli.perf.fields.memoryLimit.desc"), type: "text", placeholder: "4GB" },
    ],
  },
  {
    id: "cli_security", label: t("globalConfig.cli.security.label"), desc: t("globalConfig.cli.security.desc"),
    icon: Lock, color: "#f43f5e",
    fields: [
      { key: "security", label: t("globalConfig.cli.security.fields.security.label"), desc: t("globalConfig.cli.security.fields.security.desc"), type: "select", options: [
        { value: "", label: t("globalConfig.cli.security.securityOptions.off") },
        { value: "low", label: t("globalConfig.cli.security.securityOptions.low") },
        { value: "medium", label: t("globalConfig.cli.security.securityOptions.medium") },
        { value: "high", label: t("globalConfig.cli.security.securityOptions.high") },
      ]},
      { key: "scanSecrets", label: t("globalConfig.cli.security.fields.scanSecrets.label"), desc: t("globalConfig.cli.security.fields.scanSecrets.desc"), type: "switch" },
      { key: "audit", label: t("globalConfig.cli.security.fields.audit.label"), desc: t("globalConfig.cli.security.fields.audit.desc"), type: "select", options: [
        { value: "", label: t("globalConfig.cli.security.auditOptions.off") },
        { value: "npm", label: "npm" },
        { value: "pip", label: "pip" },
        { value: "cargo", label: "cargo" },
        { value: "all", label: t("globalConfig.cli.security.auditOptions.all") },
      ]},
      { key: "permissionsAnalysis", label: t("globalConfig.cli.security.fields.permissionsAnalysis.label"), desc: t("globalConfig.cli.security.fields.permissionsAnalysis.desc"), type: "switch" },
      { key: "encrypt", label: t("globalConfig.cli.security.fields.encrypt.label"), desc: t("globalConfig.cli.security.fields.encrypt.desc"), type: "text", placeholder: "key.pub" },
    ],
  },
  {
    id: "cli_output", label: t("globalConfig.cli.output.label"), desc: t("globalConfig.cli.output.desc"),
    icon: FileOutput, color: "#38bdf8",
    fields: [
      { key: "format", label: t("globalConfig.cli.output.fields.format.label"), desc: t("globalConfig.cli.output.fields.format.desc"), type: "select", options: [
        { value: "text", label: t("globalConfig.cli.output.formatOptions.text") },
        { value: "json", label: "JSON" },
        { value: "yaml", label: "YAML" },
        { value: "markdown", label: "Markdown" },
        { value: "stream-json", label: t("globalConfig.cli.output.formatOptions.stream") },
      ]},
      { key: "color", label: t("globalConfig.cli.output.fields.color.label"), desc: t("globalConfig.cli.output.fields.color.desc"), type: "select", options: [
        { value: "auto", label: t("globalConfig.cli.output.colorOptions.auto") },
        { value: "always", label: t("globalConfig.cli.output.colorOptions.always") },
        { value: "never", label: t("globalConfig.cli.output.colorOptions.never") },
      ]},
      { key: "verbose", label: t("globalConfig.cli.output.fields.verbose.label"), desc: t("globalConfig.cli.output.fields.verbose.desc"), type: "slider", min: 0, max: 3, step: 1 },
      { key: "silent", label: t("globalConfig.cli.output.fields.silent.label"), desc: t("globalConfig.cli.output.fields.silent.desc"), type: "switch" },
      { key: "progress", label: t("globalConfig.cli.output.fields.progress.label"), desc: t("globalConfig.cli.output.fields.progress.desc"), type: "switch" },
    ],
  },
  {
    id: "cli_network", label: t("globalConfig.cli.network.label"), desc: t("globalConfig.cli.network.desc"),
    icon: Wifi, color: "#818cf8",
    fields: [
      { key: "proxy", label: t("globalConfig.cli.network.fields.proxy.label"), desc: t("globalConfig.cli.network.fields.proxy.desc"), type: "text", placeholder: "http://proxy:8080" },
      { key: "timeout", label: t("globalConfig.cli.network.fields.timeout.label"), desc: t("globalConfig.cli.network.fields.timeout.desc"), type: "text", placeholder: "60s" },
      { key: "retry", label: t("globalConfig.cli.network.fields.retry.label"), desc: t("globalConfig.cli.network.fields.retry.desc"), type: "text", placeholder: "3,exponential" },
      { key: "concurrency", label: t("globalConfig.cli.network.fields.concurrency.label"), desc: t("globalConfig.cli.network.fields.concurrency.desc"), type: "number", min: 1, max: 50, placeholder: "5" },
      { key: "rateLimit", label: t("globalConfig.cli.network.fields.rateLimit.label"), desc: t("globalConfig.cli.network.fields.rateLimit.desc"), type: "text", placeholder: "100/min" },
    ],
  },
  {
    id: "cli_batch", label: t("globalConfig.cli.batch.label"), desc: t("globalConfig.cli.batch.desc"),
    icon: Layers, color: "#a3e635",
    fields: [
      { key: "batchFile", label: t("globalConfig.cli.batch.fields.batchFile.label"), desc: t("globalConfig.cli.batch.fields.batchFile.desc"), type: "text", placeholder: "commands.txt" },
      { key: "parallel", label: t("globalConfig.cli.batch.fields.parallel.label"), desc: t("globalConfig.cli.batch.fields.parallel.desc"), type: "number", min: 1, max: 32, placeholder: "4" },
      { key: "queue", label: t("globalConfig.cli.batch.fields.queue.label"), desc: t("globalConfig.cli.batch.fields.queue.desc"), type: "select", options: [
        { value: "fifo", label: t("globalConfig.cli.batch.queueOptions.fifo") },
        { value: "priority", label: t("globalConfig.cli.batch.queueOptions.priority") },
        { value: "round-robin", label: t("globalConfig.cli.batch.queueOptions.roundRobin") },
      ]},
      { key: "schedule", label: t("globalConfig.cli.batch.fields.schedule.label"), desc: t("globalConfig.cli.batch.fields.schedule.desc"), type: "text", placeholder: "0 2 * * *" },
      { key: "aggregate", label: t("globalConfig.cli.batch.fields.aggregate.label"), desc: t("globalConfig.cli.batch.fields.aggregate.desc"), type: "select", options: [
        { value: "", label: t("globalConfig.cli.batch.aggregateOptions.off") },
        { value: "summary", label: t("globalConfig.cli.batch.aggregateOptions.summary") },
        { value: "detailed", label: t("globalConfig.cli.batch.aggregateOptions.detailed") },
      ]},
    ],
  },
  {
    id: "cli_cache", label: t("globalConfig.cli.cache.label"), desc: t("globalConfig.cli.cache.desc"),
    icon: Database, color: "#fcd34d",
    fields: [
      { key: "cache", label: t("globalConfig.cli.cache.fields.cache.label"), desc: t("globalConfig.cli.cache.fields.cache.desc"), type: "select", options: [
        { value: "read-write", label: t("globalConfig.cli.cache.cacheOptions.readWrite") },
        { value: "read-only", label: t("globalConfig.cli.cache.cacheOptions.readOnly") },
        { value: "write-only", label: t("globalConfig.cli.cache.cacheOptions.writeOnly") },
        { value: "off", label: t("globalConfig.cli.cache.cacheOptions.off") },
      ]},
      { key: "clearCache", label: t("globalConfig.cli.cache.fields.clearCache.label"), desc: t("globalConfig.cli.cache.fields.clearCache.desc"), type: "switch" },
      { key: "warmCache", label: t("globalConfig.cli.cache.fields.warmCache.label"), desc: t("globalConfig.cli.cache.fields.warmCache.desc"), type: "switch" },
      { key: "cacheStats", label: t("globalConfig.cli.cache.fields.cacheStats.label"), desc: t("globalConfig.cli.cache.fields.cacheStats.desc"), type: "switch" },
    ],
  },
  {
    id: "cli_plugins", label: t("globalConfig.cli.plugins.label"), desc: t("globalConfig.cli.plugins.desc"),
    icon: Puzzle, color: "#4ade80",
    fields: [
      { key: "install", label: t("globalConfig.cli.plugins.fields.install.label"), desc: t("globalConfig.cli.plugins.fields.install.desc"), type: "text", placeholder: "@claude/analyzer" },
      { key: "uninstall", label: t("globalConfig.cli.plugins.fields.uninstall.label"), desc: t("globalConfig.cli.plugins.fields.uninstall.desc"), type: "text", placeholder: "plugin-name" },
      { key: "pluginsList", label: t("globalConfig.cli.plugins.fields.pluginsList.label"), desc: t("globalConfig.cli.plugins.fields.pluginsList.desc"), type: "switch" },
      { key: "pluginConfig", label: t("globalConfig.cli.plugins.fields.pluginConfig.label"), desc: t("globalConfig.cli.plugins.fields.pluginConfig.desc"), type: "text", placeholder: "plugin:key=value" },
    ],
  },
  {
    id: "cli_diag", label: t("globalConfig.cli.diag.label"), desc: t("globalConfig.cli.diag.desc"),
    icon: Stethoscope, color: "#14b8a6",
    fields: [
      { key: "health", label: t("globalConfig.cli.diag.fields.health.label"), desc: t("globalConfig.cli.diag.fields.health.desc"), type: "switch" },
      { key: "metrics", label: t("globalConfig.cli.diag.fields.metrics.label"), desc: t("globalConfig.cli.diag.fields.metrics.desc"), type: "select", options: [
        { value: "", label: t("globalConfig.cli.diag.errorReportOptions.off") },
        { value: "json", label: "JSON" },
        { value: "prometheus", label: "Prometheus" },
      ]},
      { key: "trace", label: t("globalConfig.cli.diag.fields.trace.label"), desc: t("globalConfig.cli.diag.fields.trace.desc"), type: "switch" },
      { key: "errorReport", label: t("globalConfig.cli.diag.fields.errorReport.label"), desc: t("globalConfig.cli.diag.fields.errorReport.desc"), type: "select", options: [
        { value: "", label: t("globalConfig.cli.diag.errorReportOptions.off") },
        { value: "brief", label: t("globalConfig.cli.diag.errorReportOptions.brief") },
        { value: "detailed", label: t("globalConfig.cli.diag.errorReportOptions.detailed") },
      ]},
      { key: "info", label: t("globalConfig.cli.diag.fields.info.label"), desc: t("globalConfig.cli.diag.fields.info.desc"), type: "select", options: [
        { value: "", label: t("globalConfig.cli.diag.infoOptions.off") },
        { value: "version", label: t("globalConfig.cli.diag.infoOptions.version") },
        { value: "env", label: t("globalConfig.cli.diag.infoOptions.env") },
        { value: "all", label: t("globalConfig.cli.diag.infoOptions.all") },
      ]},
    ],
  },
  {
    id: "cli_shortcuts", label: t("globalConfig.cli.shortcuts.label"), desc: t("globalConfig.cli.shortcuts.desc"),
    icon: Command, color: "#fb7185",
    fields: [
      { key: "aliases", label: t("globalConfig.cli.shortcuts.fields.aliases.label"), desc: t("globalConfig.cli.shortcuts.fields.aliases.desc"), type: "kv" },
      { key: "shortcuts", label: t("globalConfig.cli.shortcuts.fields.shortcuts.label"), desc: t("globalConfig.cli.shortcuts.fields.shortcuts.desc"), type: "kv" },
      { key: "template", label: t("globalConfig.cli.shortcuts.fields.template.label"), desc: t("globalConfig.cli.shortcuts.fields.template.desc"), type: "text", placeholder: "code-review" },
      { key: "recent", label: t("globalConfig.cli.shortcuts.fields.recent.label"), desc: t("globalConfig.cli.shortcuts.fields.recent.desc"), type: "number", min: 1, max: 50, placeholder: "10" },
    ],
  },
  {
    id: "cli_slash", label: t("globalConfig.cli.slash.label"), desc: t("globalConfig.cli.slash.desc"),
    icon: Zap, color: "#facc15",
    fields: [
      { key: "slashHelp", label: t("globalConfig.cli.slash.fields.help.label"), desc: t("globalConfig.cli.slash.fields.help.desc"), type: "switch" },
      { key: "slashClear", label: t("globalConfig.cli.slash.fields.clear.label"), desc: t("globalConfig.cli.slash.fields.clear.desc"), type: "switch" },
      { key: "slashSave", label: t("globalConfig.cli.slash.fields.save.label"), desc: t("globalConfig.cli.slash.fields.save.desc"), type: "text", placeholder: "session_name" },
      { key: "slashLoad", label: t("globalConfig.cli.slash.fields.load.label"), desc: t("globalConfig.cli.slash.fields.load.desc"), type: "text", placeholder: "session_id" },
      { key: "slashExport", label: t("globalConfig.cli.slash.fields.export.label"), desc: t("globalConfig.cli.slash.fields.export.desc"), type: "select", options: [
        { value: "markdown", label: "Markdown" },
        { value: "json", label: "JSON" },
        { value: "text", label: t("globalConfig.cli.slash.exportOptions.text") },
      ]},
      { key: "slashExplain", label: t("globalConfig.cli.slash.fields.explain.label"), desc: t("globalConfig.cli.slash.fields.explain.desc"), type: "switch" },
      { key: "slashFix", label: t("globalConfig.cli.slash.fields.fix.label"), desc: t("globalConfig.cli.slash.fields.fix.desc"), type: "switch" },
      { key: "slashDocs", label: t("globalConfig.cli.slash.fields.docs.label"), desc: t("globalConfig.cli.slash.fields.docs.desc"), type: "switch" },
      { key: "slashTest", label: t("globalConfig.cli.slash.fields.test.label"), desc: t("globalConfig.cli.slash.fields.test.desc"), type: "switch" },
      { key: "slashRefactor", label: t("globalConfig.cli.slash.fields.refactor.label"), desc: t("globalConfig.cli.slash.fields.refactor.desc"), type: "switch" },
      { key: "slashOptimize", label: t("globalConfig.cli.slash.fields.optimize.label"), desc: t("globalConfig.cli.slash.fields.optimize.desc"), type: "switch" },
      { key: "slashSecurity", label: t("globalConfig.cli.slash.fields.security.label"), desc: t("globalConfig.cli.slash.fields.security.desc"), type: "switch" },
    ],
  },
  {
    id: "envVars", label: t("globalConfig.cli.envVars.label"), desc: t("globalConfig.cli.envVars.desc"),
    icon: Variable, color: "#a78bfa",
    fields: [
      { key: "CLAUDE_API_KEY", label: t("globalConfig.cli.envVars.fields.apiKey.label"), desc: t("globalConfig.cli.envVars.fields.apiKey.desc"), type: "password", placeholder: "sk-ant-..." },
      { key: "CLAUDE_CONFIG_DIR", label: t("globalConfig.cli.envVars.fields.configDir.label"), desc: t("globalConfig.cli.envVars.fields.configDir.desc"), type: "text", placeholder: "~/.claude" },
      { key: "CLAUDE_CACHE_DIR", label: t("globalConfig.cli.envVars.fields.cacheDir.label"), desc: t("globalConfig.cli.envVars.fields.cacheDir.desc"), type: "text", placeholder: "~/.cache/claude" },
      { key: "CLAUDE_LOG_LEVEL", label: t("globalConfig.cli.envVars.fields.logLevel.label"), desc: t("globalConfig.cli.envVars.fields.logLevel.desc"), type: "select", options: [
        { value: "debug", label: "debug" },
        { value: "info", label: "info" },
        { value: "warn", label: "warn" },
        { value: "error", label: "error" },
      ]},
      { key: "CLAUDE_MAX_TOKENS", label: t("globalConfig.cli.envVars.fields.maxTokens.label"), desc: t("globalConfig.cli.envVars.fields.maxTokens.desc"), type: "number", min: 256, max: 200000, placeholder: "4096" },
      { key: "CLAUDE_MODEL", label: t("globalConfig.cli.envVars.fields.model.label"), desc: t("globalConfig.cli.envVars.fields.model.desc"), type: "text", placeholder: "claude-sonnet-4-6" },
      { key: "CLAUDE_TEMPERATURE", label: t("globalConfig.cli.envVars.fields.temperature.label"), desc: t("globalConfig.cli.envVars.fields.temperature.desc"), type: "slider", min: 0, max: 1, step: 0.05 },
      { key: "CLAUDE_NO_COLOR", label: t("globalConfig.cli.envVars.fields.noColor.label"), desc: t("globalConfig.cli.envVars.fields.noColor.desc"), type: "switch" },
      { key: "CLAUDE_EDITOR", label: t("globalConfig.cli.envVars.fields.editor.label"), desc: t("globalConfig.cli.envVars.fields.editor.desc"), type: "select", options: [
        { value: "vscode", label: "VS Code" },
        { value: "vim", label: "Vim" },
        { value: "nvim", label: "Neovim" },
        { value: "emacs", label: "Emacs" },
        { value: "nano", label: "Nano" },
        { value: "sublime", label: "Sublime Text" },
      ]},
    ],
  },
  ];
}

// ── 字段渲染器 ───────────────────────────────────────────────────────

function FieldRenderer({ field, value, onChange }: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [kvKey, setKvKey] = useState("");
  const [kvVal, setKvVal] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState("");
  const jsonInit = useRef(false);

  // JSON 字段初始化
  useEffect(() => {
    if (field.type === "json" && !jsonInit.current) {
      setJsonText(typeof value === "object" ? JSON.stringify(value, null, 2) : "{}");
      jsonInit.current = true;
    }
  }, [field.type, value]);

  const inputCls = "w-full bg-app border border-app rounded-lg px-3 py-2 text-[11px] font-mono text-app outline-none focus:border-accent/60 placeholder:text-app-tertiary";

  switch (field.type) {
    case "text":
      return (
        <input value={typeof value === "string" ? value : ""}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder} spellCheck={false}
          className={inputCls} />
      );

    case "password":
      return (
        <div className="relative">
          <input type={showPassword ? "text" : "password"}
            value={typeof value === "string" ? value : ""}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder} spellCheck={false}
            className={cn(inputCls, "pr-8")} />
          <button onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-app-tertiary hover:text-app transition-colors">
            {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>
      );

    case "number":
      return (
        <div className="flex items-center gap-2">
          <input type="number" value={typeof value === "number" ? value : ""}
            onChange={e => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
            min={field.min} max={field.max}
            placeholder={field.placeholder}
            className={cn(inputCls, "flex-1")} />
          {field.unit && <span className="text-[10px] text-app-tertiary shrink-0">{field.unit}</span>}
        </div>
      );

    case "select":
      return (
        <select value={typeof value === "string" ? value : String(value ?? "")}
          onChange={e => onChange(e.target.value)}
          className={cn(inputCls, "cursor-pointer")}>
          {field.options?.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );

    case "switch": {
      const on = value === true;
      return (
        <div className="flex items-center gap-3">
          <button onClick={() => onChange(!on)}
            className={cn("w-10 h-[22px] rounded-full transition-colors relative shrink-0",
              on ? "bg-accent" : "bg-app-tertiary/40")}>
            <div className={cn("absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform",
              on ? "translate-x-[22px]" : "translate-x-[3px]")} />
          </button>
          <span className={cn("text-[11px] font-medium", on ? "text-accent" : "text-app-tertiary")}>
            {on ? t("globalConfig.fieldRenderer.on") : t("globalConfig.fieldRenderer.off")}
          </span>
        </div>
      );
    }

    case "slider": {
      const num = typeof value === "number" ? value : field.min ?? 0;
      const pct = ((num - (field.min ?? 0)) / ((field.max ?? 1) - (field.min ?? 0))) * 100;
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative h-2 bg-app-tertiary/20 rounded-full">
              <div className="absolute h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
              <input type="range" min={field.min} max={field.max} step={field.step}
                value={num}
                onChange={e => onChange(Number(e.target.value))}
                className="absolute inset-0 w-full opacity-0 cursor-pointer" />
            </div>
            <span className="text-[11px] font-mono text-app tabular-nums w-12 text-right">
              {num}{field.unit || ""}
            </span>
          </div>
          <div className="flex justify-between text-[9px] text-app-tertiary font-mono">
            <span>{field.min}{field.unit || ""}</span>
            <span>{field.max}{field.unit || ""}</span>
          </div>
        </div>
      );
    }

    case "textarea":
      return (
        <textarea value={typeof value === "string" ? value : ""}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder} spellCheck={false}
          rows={3}
          className={cn(inputCls, "resize-y")} />
      );

    case "json": {
      return (
        <div className="space-y-1.5">
          <textarea value={jsonText}
            onChange={e => {
              setJsonText(e.target.value);
              setJsonError("");
              try { onChange(JSON.parse(e.target.value)); }
              catch { setJsonError(t("globalConfig.fieldRenderer.jsonError")); }
            }}
            spellCheck={false} rows={4}
            className={cn(inputCls, "resize-y", jsonError && "border-red-500/40")} />
          {jsonError && <p className="text-[10px] text-red-400">{jsonError}</p>}
        </div>
      );
    }

    case "tags": {
      const tags = Array.isArray(value) ? value as string[] : [];
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-accent/10 text-accent font-mono">
                {t}
                <button onClick={() => onChange(tags.filter((_, j) => j !== i))}
                  className="hover:text-red-400 transition-colors">
                  <Trash2 size={9} />
                </button>
              </span>
            ))}
            {tags.length === 0 && <span className="text-[10px] text-app-tertiary">{t("globalConfig.fieldRenderer.none")}</span>}
          </div>
          <div className="flex gap-1.5">
            <input value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && tagInput.trim()) {
                  onChange([...tags, tagInput.trim()]);
                  setTagInput("");
                }
              }}
              placeholder={t("globalConfig.fieldRenderer.addHint")} spellCheck={false}
              className={cn(inputCls, "flex-1")} />
            <button onClick={() => {
              if (tagInput.trim()) { onChange([...tags, tagInput.trim()]); setTagInput(""); }
            }}
              className="text-[10px] px-2 py-1.5 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
              <Plus size={11} />
            </button>
          </div>
        </div>
      );
    }

    case "kv": {
      const obj = (typeof value === "object" && value !== null && !Array.isArray(value)) ? value as Record<string, string> : {};
      const entries = Object.entries(obj);
      return (
        <div className="space-y-2">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-accent bg-accent/10 px-2 py-1 rounded">{k}</span>
              <span className="text-[10px] text-app-tertiary">=</span>
              <span className="text-[10px] font-mono text-app flex-1 truncate">{v}</span>
              <button onClick={() => {
                const next = { ...obj };
                delete next[k];
                onChange(next);
              }} className="text-app-tertiary hover:text-red-400 transition-colors">
                <Trash2 size={10} />
              </button>
            </div>
          ))}
          {entries.length === 0 && <span className="text-[10px] text-app-tertiary">暂无</span>}
          <div className="flex gap-1.5">
            <input value={kvKey} onChange={e => setKvKey(e.target.value)}
              placeholder="KEY" spellCheck={false}
              className={cn(inputCls, "w-28")} />
            <input value={kvVal} onChange={e => setKvVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && kvKey.trim()) {
                  onChange({ ...obj, [kvKey.trim()]: kvVal });
                  setKvKey(""); setKvVal("");
                }
              }}
              placeholder="VALUE" spellCheck={false}
              className={cn(inputCls, "flex-1")} />
            <button onClick={() => {
              if (kvKey.trim()) { onChange({ ...obj, [kvKey.trim()]: kvVal }); setKvKey(""); setKvVal(""); }
            }}
              className="text-[10px] px-2 py-1.5 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
              <Plus size={11} />
            </button>
          </div>
        </div>
      );
    }

    case "multicheck": {
      const selected = Array.isArray(value) ? value as string[] : [];
      return (
        <div className="flex flex-wrap gap-2">
          {field.checkOptions?.map(o => {
            const checked = selected.includes(o.value);
            return (
              <button key={o.value}
                onClick={() => {
                  if (checked) onChange(selected.filter(v => v !== o.value));
                  else onChange([...selected, o.value]);
                }}
                className={cn(
                  "flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border transition-all",
                  checked
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-app bg-app text-app-tertiary hover:border-app-secondary"
                )}>
                <div className={cn("w-3.5 h-3.5 rounded border flex items-center justify-center",
                  checked ? "border-accent bg-accent" : "border-app-tertiary/60")}>
                  {checked && <Check size={9} className="text-white" />}
                </div>
                {o.label}
              </button>
            );
          })}
        </div>
      );
    }
  }
}

// ── 分区面板 ─────────────────────────────────────────────────────────

function SectionPanel({ section, data, onChange }: {
  section: SectionDef;
  data: AnyObj;
  onChange: (key: string, value: unknown) => void;
}) {
  const Icon = section.icon;
  const filledCount = section.fields.filter(f => {
    const v = data[f.key];
    if (v === undefined || v === null || v === "") return false;
    if (f.type === "switch") return v === true;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return true;
  }).length;

  return (
    <div className="rounded-xl border border-app bg-app-secondary">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${section.color}15`, border: `1px solid ${section.color}30` }}>
          <Icon size={15} style={{ color: section.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-app">{section.label}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-app-tertiary/20 text-app-tertiary font-mono">
              {filledCount}/{section.fields.length}
            </span>
          </div>
          <p className="text-[10px] text-app-tertiary mt-0.5">{section.desc}</p>
        </div>
      </div>

      {/* Fields — always visible */}
      <div className="border-t border-app px-4 py-4 space-y-4">
        {section.fields.map(field => (
          <div key={field.key} className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-[11px] font-medium text-app">{field.label}</span>
                <span className="text-[10px] text-app-tertiary ml-2">{field.desc}</span>
              </div>
              <span className="text-[9px] font-mono text-app-tertiary/60">{section.id}.{field.key}</span>
            </div>
            <FieldRenderer field={field} value={data[field.key]} onChange={v => onChange(field.key, v)} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 状态指示器 ───────────────────────────────────────────────────────

function StatusBar({ config, lastSaved, saving, dirty }: {
  config: AnyObj | null;
  lastSaved: string | null;
  saving: boolean;
  dirty: boolean;
}) {
  const apiOk = !!(config?.api?.apiKey);
  const modelName = config?.model?.model || "未设置";
  const monitorOn = config?.monitoring?.enabled !== false;

  return (
    <div className="flex items-center gap-4 flex-wrap text-[10px]">
      {/* API 状态 */}
      <div className="flex items-center gap-1.5">
        <div className={cn("w-2 h-2 rounded-full", apiOk ? "bg-green-400" : "bg-yellow-400")} />
        <span className="text-app-tertiary">API</span>
        <span className={cn("font-medium", apiOk ? "text-green-400" : "text-yellow-400")}>
          {apiOk ? "已配置" : "未配置"}
        </span>
      </div>
      {/* 模型 */}
      <div className="flex items-center gap-1.5">
        <Cpu size={10} className="text-app-tertiary" />
        <span className="text-app-tertiary">模型</span>
        <span className="font-mono text-app-secondary">{modelName.replace("claude-", "").slice(0, 15)}</span>
      </div>
      {/* 监控 */}
      <div className="flex items-center gap-1.5">
        <Activity size={10} className="text-app-tertiary" />
        <span className={cn("font-medium", monitorOn ? "text-green-400" : "text-app-tertiary")}>
          {monitorOn ? "监控中" : "监控关"}
        </span>
      </div>
      {/* 保存状态 */}
      <div className="ml-auto flex items-center gap-1.5">
        {saving && <span className="text-accent animate-pulse">保存中...</span>}
        {dirty && !saving && <span className="text-yellow-400">有未保存的更改</span>}
        {!dirty && !saving && lastSaved && (
          <span className="text-app-tertiary">
            最后保存: {lastSaved}
          </span>
        )}
      </div>
    </div>
  );
}

// ── 主组件 ───────────────────────────────────────────────────────────

export default function GlobalConfigPanel() {
  const [config, setConfig] = useState<AnyObj | null>(null);
  const [savedConfig, setSavedConfig] = useState<AnyObj | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "ok" | "error">("idle");
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await api.tcConfig.get();
      setConfig(data);
      setSavedConfig(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const dirty = config && savedConfig && JSON.stringify(config) !== JSON.stringify(savedConfig);

  const handleFieldChange = (section: string, key: string, value: unknown) => {
    if (!config) return;
    setConfig(prev => ({
      ...prev!,
      [section]: { ...(prev![section] || {}), [key]: value },
    }));
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true); setSaveStatus("idle");
    try {
      const updated = await api.tcConfig.update(config);
      setConfig(updated);
      setSavedConfig(updated);
      setSaveStatus("ok");
      setLastSaved(new Date().toLocaleTimeString());
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    } finally { setSaving(false); }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      const defaults = await api.tcConfig.reset();
      setConfig(defaults);
      setSavedConfig(defaults);
      setLastSaved(new Date().toLocaleTimeString());
    } finally { setSaving(false); }
  };

  const handleExport = () => {
    if (!config) return;
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tc-global-config.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result as string);
        setSaving(true);
        const updated = await api.tcConfig.import(data);
        setConfig(updated);
        setSavedConfig(updated);
        setLastSaved(new Date().toLocaleTimeString());
      } catch {
        setError("导入失败：JSON 格式错误");
      } finally { setSaving(false); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  if (loading && !config) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-app-tertiary text-xs animate-pulse">加载全局配置...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 错误提示 */}
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-[11px] text-red-400">
          <AlertTriangle size={13} />
          {error}
        </div>
      )}

      {/* 状态栏 */}
      <div className="bg-app-secondary border border-app rounded-xl px-4 py-3">
        <StatusBar config={config} lastSaved={lastSaved} saving={saving} dirty={!!dirty} />
      </div>

      {/* 分区列表 */}
      <div className="space-y-2">
        {SECTIONS.map(section => (
          <SectionPanel
            key={section.id}
            section={section}
            data={config?.[section.id] || {}}
            onChange={(key, value) => handleFieldChange(section.id, key, value)}
          />
        ))}
      </div>

      {/* 操作按钮栏 */}
      <div className="flex items-center gap-2 pt-2 pb-4 sticky bottom-0 bg-app/80 backdrop-blur-sm rounded-xl px-1">
        <button onClick={handleSave} disabled={saving || !dirty}
          className={cn(
            "flex items-center gap-1.5 text-[11px] px-4 py-2 rounded-lg font-medium transition-all",
            dirty
              ? "bg-accent hover:bg-accent-hover text-white shadow-lg shadow-accent/20"
              : "bg-app-tertiary/20 text-app-tertiary cursor-not-allowed"
          )}>
          {saveStatus === "ok" ? <Check size={12} /> : <Save size={12} />}
          {saving ? "保存中..." : saveStatus === "ok" ? "已保存" : "保存配置"}
        </button>

        <button onClick={handleReset} disabled={saving}
          className="flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">
          <RotateCcw size={11} />
          重置默认
        </button>

        <div className="flex-1" />

        <button onClick={handleExport}
          className="flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-lg border border-app text-app-secondary hover:text-app transition-colors">
          <Download size={11} />
          导出
        </button>

        <button onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-lg border border-app text-app-secondary hover:text-app transition-colors">
          <Upload size={11} />
          导入
        </button>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />

        <button onClick={load} disabled={saving}
          className="flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-lg border border-app text-app-secondary hover:text-app transition-colors">
          <Zap size={11} />
          刷新
        </button>
      </div>
    </div>
  );
}
