# Claude 配置中心完整实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 frontend 项目的 ClaudeConfig 全部 14 个 section 完整搬运到 tauri 管理后台，组件参考 Ant Design 自建（CSS Modules），所有内容支持可视化编辑。

**Architecture:** 主页面采用左侧分组导航 + 右侧滚动内容区，各 section 拆为独立组件文件。共享 UI 组件（TagInput、JsonEditor、DetailPanel、ActivityChart 等）放入 `ui/` 目录。API 层补全所有 claude-config 端点。

**Tech Stack:** React 19 + TypeScript 5.8 + CSS Modules + i18next

---

## 文件结构

```
tauri/src/
├── lib/api/
│   ├── types.ts                    ← 修改：补全 SkillDetail, AgentInfo, CommandInfo, RuleInfo, DisabledItem, ClaudeSystemInfo, PresetItem, ProjectDetails
│   └── http.ts                     ← 修改：补全 30+ API 方法
│
├── ui/
│   ├── tag-input/                  ← 新建：标签输入组件
│   │   ├── TagInput.tsx
│   │   └── tag-input.module.css
│   ├── json-editor/                ← 新建：JSON 编辑器
│   │   ├── JsonEditor.tsx
│   │   └── json-editor.module.css
│   └── index.ts                    ← 修改：导出新组件
│
├── features/admin/
│   ├── claude-config/              ← 新建：配置中心模块
│   │   ├── ClaudeConfigPage.tsx    ← 主页面：左侧导航 + 右侧滚动区 + 搜索
│   │   ├── claude-config.module.css
│   │   ├── sections/
│   │   │   ├── SecOverview.tsx     ← 概览：统计 + 活动图 + CLAUDE.md 编辑器
│   │   │   ├── SecSettings.tsx     ← 常用设置：17 个参数分组编辑
│   │   │   ├── SecSkills.tsx       ← Skills：列表 + 启用/禁用
│   │   │   ├── SecAgents.tsx       ← Agents：CRUD + 预设库
│   │   │   ├── SecCommands.tsx     ← Commands：CRUD + 预设库
│   │   │   ├── SecMcp.tsx          ← MCP 服务器：列表 + 添加/删除
│   │   │   ├── SecHooks.tsx        ← Hook 事件：规则编辑 + 保存
│   │   │   ├── SecRules.tsx        ← Rules：CRUD + 预设库
│   │   │   ├── SecPermissions.tsx  ← 权限：JSON 编辑器
│   │   │   ├── SecEnvVars.tsx      ← 环境变量：只读展示
│   │   │   ├── SecPlugins.tsx      ← 插件：启用/禁用/删除
│   │   │   ├── SecMonitoring.tsx   ← 监控：项目网格 + 活动图
│   │   │   ├── SecTrash.tsx        ← 回收站：恢复/永久删除
│   │   │   └── SecAbout.tsx        ← 关于：系统信息 + 版本检查
│   │   └── shared.tsx              ← 共享子组件：DetailPanel, PresetGallery, ActivityChart, SectionHeader
│   │
│   └── pages/
│       └── AdminClaudeConfig.tsx   ← 修改：改为导入 ClaudeConfigPage
│
├── i18n/
│   ├── zh.json                     ← 修改：补全 claudeConfig.* 翻译键
│   └── en.json                     ← 修改：补全 claudeConfig.* 翻译键
│
└── app/Router.tsx                  ← 不变
```

---

## Chunk 1: API 基础设施

### Task 1: 补全 API 类型定义
**Files:** Modify: `tauri/src/lib/api/types.ts`

- [ ] 新增类型：SkillDetail, AgentInfo, CommandInfo, RuleInfo, DisabledItem, ClaudeSystemInfo, PresetItem, ProjectDetails, ProjectComponents
- [ ] 扩展 ApiAdapter 接口：补全 30+ 方法签名

### Task 2: 补全 HTTP 适配器
**Files:** Modify: `tauri/src/lib/api/http.ts`

- [ ] 实现所有 claude-config API 方法（get/overview/hookEvents/updateHooks/deleteHookEvent/togglePlugin/removePlugin/updateOther/deleteOther/updatePermissions/listMcp/addMcp/removeMcp/listSkills/toggleSkill/listCommands/toggleCommand/createCommand/deleteCommand/listRules/toggleRule/createRule/deleteRule/listAgents/toggleAgent/createAgent/deleteAgent/presetAgents/presetCommands/presetRules/systemInfo/getClaudeMd/updateClaudeMd/disabledItems/restoreDisabledItem/deleteDisabledItem/projectDetails）
- [ ] TypeScript 编译通过

---

## Chunk 2: 共享 UI 组件

### Task 3: TagInput 组件
**Files:** Create: `tauri/src/ui/tag-input/TagInput.tsx`, `tag-input.module.css`

- [ ] Props: `{ tags: string[], onChange, placeholder, disabled }`
- [ ] 功能：输入 + Enter 添加，x 删除，样式参考 Ant Design Tag

### Task 4: JsonEditor 组件
**Files:** Create: `tauri/src/ui/json-editor/JsonEditor.tsx`, `json-editor.module.css`

- [ ] Props: `{ value: unknown, onChange, readonly?, label? }`
- [ ] 功能：textarea 编辑 JSON，实时校验，错误提示

### Task 5: 导出新组件
**Files:** Modify: `tauri/src/ui/index.ts`

---

## Chunk 3: 配置中心主框架

### Task 6: 主页面 + CSS
**Files:** Create: `tauri/src/features/admin/claude-config/ClaudeConfigPage.tsx`, `claude-config.module.css`

- [ ] 左侧分组导航（4 组 14 项）+ 搜索过滤 + scroll-spy
- [ ] 右侧滚动内容区 + section refs
- [ ] 顶层数据加载（config + overview + 详细列表）
- [ ] Toast 通知

### Task 7: 共享子组件
**Files:** Create: `tauri/src/features/admin/claude-config/shared.tsx`

- [ ] SectionHeader: 图标 + 标题 + 描述 + 右侧插槽
- [ ] DetailPanel: 标题 + 路径 + metadata + 内容预览
- [ ] PresetGallery: 预设卡片网格 + 安装按钮
- [ ] ActivityChart: SVG 条形图（60 天活动）
- [ ] MdPreview: Markdown 简易渲染

### Task 8: 路由入口
**Files:** Modify: `tauri/src/features/admin/pages/AdminClaudeConfig.tsx`

- [ ] 改为简单导入 ClaudeConfigPage

---

## Chunk 4: Core Sections（概览 + 设置）

### Task 9: SecOverview
- [ ] 5 个统计卡片（CLI 版本、消息、工具调用、会话、活跃天数）
- [ ] ActivityChart（60 天活动图）
- [ ] CLAUDE.md 编辑器（预览/编辑切换 + 保存）

### Task 10: SecSettings
- [ ] 17 个常用设置分组显示（model/behavior/session/security/ui/advanced）
- [ ] 动态输入类型：select / boolean toggle / string input / number
- [ ] 保存到 settings.json（updateOther / deleteOther）
- [ ] Other Fields：动态 key-value 网格（增删改）

---

## Chunk 5: Extension Sections（Skills/Agents/Commands/Rules）

### Task 11: SecSkills
- [ ] Skills 列表 + 启用/禁用 Toggle + 详情面板

### Task 12: SecAgents
- [ ] Agents CRUD + PresetGallery + 详情面板

### Task 13: SecCommands
- [ ] Commands CRUD + PresetGallery + "/" 前缀显示

### Task 14: SecRules
- [ ] Rules CRUD + PresetGallery

---

## Chunk 6: Security Sections（Hooks/Permissions/Env）

### Task 15: SecHooks
- [ ] 10 种事件类型 + 规则编辑器（matcher + command + timeout）
- [ ] 添加规则/Hook + 保存/清空 + dirty 状态跟踪

### Task 16: SecPermissions
- [ ] JSON 编辑器（textarea + 校验 + 保存）

### Task 17: SecEnvVars
- [ ] 13 个环境变量只读展示网格

---

## Chunk 7: System Sections（MCP/Plugins/Monitoring/Trash/About）

### Task 18: SecMcp
- [ ] MCP 列表 + 状态指示器 + 添加表单（name/url/transport/scope）+ 删除

### Task 19: SecPlugins
- [ ] 插件列表 + 启用/禁用 Toggle + 删除 + 版本/作用域信息

### Task 20: SecMonitoring
- [ ] 统计卡片 + 活动图 + 项目网格（异步加载详情）

### Task 21: SecTrash
- [ ] 已禁用项列表 + 类型标签 + 恢复/永久删除 + 批量操作

### Task 22: SecAbout
- [ ] 系统信息网格 + CLI 版本 + npm 更新检查

---

## Chunk 8: i18n + 集成测试

### Task 23: 国际化
**Files:** Modify: `tauri/src/i18n/zh.json`, `en.json`

- [ ] 补全所有 claudeConfig.* 翻译键（参考 frontend 的 i18n 文件）

### Task 24: TypeScript 编译验证
- [ ] `npx tsc --noEmit` 通过
- [ ] 所有页面在浏览器中可访问
