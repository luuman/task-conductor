import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAppStore } from '../../lib/store/app'
import type { ProjectSettingsUpdate } from '../../lib/api/types'
import { PipelineFlow } from './components/PipelineFlow'
import { HooksGrid } from './components/HooksGrid'
import { ClaudeMdPanel } from './components/ClaudeMdPanel'
import { MemoryPanel } from './components/MemoryPanel'
import { AutomationPanel } from './components/AutomationPanel'
import { ClaudeRuntimePanel } from './components/ClaudeRuntimePanel'
import { NotificationPanel } from './components/NotificationPanel'
import { KnowledgeSettingsPanel } from './components/KnowledgeSettingsPanel'
import { DocsPanel } from './components/DocsPanel'
import { McpPanel } from './components/McpPanel'
import { PermissionsPanel } from './components/PermissionsPanel'
import { EnvPanel } from './components/EnvPanel'
import styles from './settings.module.css'

function parseStagesConfig(raw: string | null): Set<string> | null {
  if (!raw) return null
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return new Set(arr)
  } catch { /* ignore */ }
  return null
}

const CONFIGURABLE_STAGES = [
  'discovery', 'analysis', 'prd', 'architecture',
  'ui', 'plan', 'dev', 'review', 'test', 'security',
  'staging', 'deploy', 'monitor',
] as const

function SectionCard({
  title,
  hint,
  children,
  warning,
}: {
  title: string
  hint?: string
  children: React.ReactNode
  warning?: boolean
}) {
  return (
    <div className={warning ? styles.sectionWarning : styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>{title}</div>
        {hint && <div className={styles.sectionHint}>{hint}</div>}
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </div>
  )
}

export default function SettingsPage() {
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const projectId = activeProjectId ? Number(activeProjectId) : null
  const queryClient = useQueryClient()

  // ── 项目基础数据 ──
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.getProjects(),
    staleTime: 30_000,
  })
  const project = projects?.find((p) => p.id === projectId)

  // ── 文件系统数据（60s 缓存）──
  const { data: claudeConfig, isLoading: claudeConfigLoading } = useQuery({
    queryKey: ['project-claude-config', projectId],
    queryFn: () => api.getProjectClaudeConfig(projectId!),
    enabled: !!projectId,
    staleTime: 60_000,
  })

  const { data: hooksStatus, isLoading: hooksLoading } = useQuery({
    queryKey: ['project-hooks', projectId],
    queryFn: () => api.getProjectHooksStatus(projectId!),
    enabled: !!projectId,
    staleTime: 60_000,
  })

  const { data: memoryData, isLoading: memoryLoading } = useQuery({
    queryKey: ['project-memory', projectId],
    queryFn: () => api.getProjectMemory(projectId!),
    enabled: !!projectId,
    staleTime: 60_000,
  })

  const { data: mcpData, isLoading: mcpLoading } = useQuery({
    queryKey: ['project-mcp', projectId],
    queryFn: () => api.getProjectMcpServers(projectId!),
    enabled: !!projectId,
    staleTime: 60_000,
  })

  const { data: permData, isLoading: permLoading } = useQuery({
    queryKey: ['project-permissions', projectId],
    queryFn: () => api.getProjectPermissions(projectId!),
    enabled: !!projectId,
    staleTime: 60_000,
  })

  // 知识库条目数（复用已有接口）
  const { data: knowledgeItems } = useQuery({
    queryKey: ['project-knowledge', projectId],
    queryFn: () => api.getProjectKnowledge(projectId!),
    enabled: !!projectId,
    staleTime: 60_000,
  })

  // ── 流水线阶段 Mutation ──
  const stagesMutation = useMutation({
    mutationFn: (stages: string[]) => api.updateProjectStagesConfig(projectId!, stages),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })

  const enabledSet = project ? parseStagesConfig(project.stages_config) : null

  const handleStageToggle = useCallback(
    (stage: string, enabled: boolean) => {
      if (!project) return
      const current = enabledSet ?? new Set(CONFIGURABLE_STAGES)
      if (enabled) current.add(stage)
      else current.delete(stage)
      stagesMutation.mutate(CONFIGURABLE_STAGES.filter((s) => current.has(s)))
    },
    [project, enabledSet, stagesMutation]
  )

  // ── 项目设置 Mutation（批量保存 6 个 JSON 字段）──
  const settingsMutation = useMutation({
    mutationFn: (data: ProjectSettingsUpdate) => api.patchProjectSettings(projectId!, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })

  if (!project) return null

  const isSaving = stagesMutation.isPending || settingsMutation.isPending

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>{project.name} · 项目设置</div>
        <div className={styles.headerHint}>
          Claude Code 配置可视化 · {isSaving ? '保存中...' : ''}
        </div>
      </div>

      {/* ── 组一：流水线 ── */}
      <SectionCard
        title="① 流水线阶段"
        hint="点击节点切换启用/禁用；黄色点 = 需人工审批；input/done 始终保留"
      >
        <PipelineFlow
          enabledStages={enabledSet}
          onToggle={handleStageToggle}
          disabled={stagesMutation.isPending}
        />
      </SectionCard>

      {/* ── 组二：Claude 配置文件 ── */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tc-foreground-secondary)', margin: '20px 0 8px', letterSpacing: '0.05em' }}>
        CLAUDE CODE 配置文件
      </div>

      <div className={styles.cardGrid}>
        <SectionCard title="⑤ Hooks 配置" hint="蓝点=全局 / 绿点=项目级；toggle 控制项目级 hook">
          {hooksLoading ? (
            <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)' }}>加载中...</div>
          ) : (
            <HooksGrid projectId={projectId!} hooks={hooksStatus?.hooks ?? []} />
          )}
        </SectionCard>

        <SectionCard title="④ CLAUDE.md 规则" hint="从项目根目录与全局配置文件提取规则条目">
          <ClaudeMdPanel data={claudeConfig} isLoading={claudeConfigLoading} />
        </SectionCard>
      </div>

      <div className={styles.cardGrid}>
        <SectionCard title="⑥ 记忆文件" hint="~/.claude/projects/{project}/memory/">
          <MemoryPanel data={memoryData} isLoading={memoryLoading} />
        </SectionCard>

        <SectionCard title="⑩ MCP 工具" hint=".mcp.json 中的 mcpServers（只读）">
          <McpPanel data={mcpData} isLoading={mcpLoading} />
        </SectionCard>
      </div>

      <SectionCard title="⑪ 权限配置" hint="三层 allow/deny 合并展示（只读）：全局 / 项目 / 本地">
        <PermissionsPanel data={permData} isLoading={permLoading} />
      </SectionCard>

      {/* ── 组三：项目配置 ── */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tc-foreground-secondary)', margin: '20px 0 8px', letterSpacing: '0.05em' }}>
        项目配置
      </div>

      <div className={styles.cardGrid}>
        <SectionCard title="② 自动化调度" hint="设置任务自动执行时间窗口和并发限制">
          <AutomationPanel
            key={projectId}
            value={project.automation_config ?? null}
            onChange={(json) => settingsMutation.mutate({ automation_config: json })}
            disabled={isSaving}
          />
        </SectionCard>

        <SectionCard title="③ Claude 运行时" hint="超时、重试、模型、区域预设">
          <ClaudeRuntimePanel
            key={projectId}
            value={project.claude_runtime_config ?? null}
            onChange={(json) => settingsMutation.mutate({ claude_runtime_config: json })}
            disabled={isSaving}
          />
        </SectionCard>
      </div>

      <div className={styles.cardGrid}>
        <SectionCard title="⑦ 通知配置" hint="语音播报、Webhook、触发时机">
          <NotificationPanel
            key={projectId}
            value={project.notification_config ?? null}
            onChange={(json) => settingsMutation.mutate({ notification_config: json })}
            disabled={isSaving}
          />
        </SectionCard>

        <SectionCard title="⑧ 知识库设置" hint="自动积累 + Prompt 注入 + 清理策略">
          <KnowledgeSettingsPanel
            key={projectId}
            value={project.knowledge_config ?? null}
            knowledgeCount={knowledgeItems?.length ?? 0}
            onChange={(json) => settingsMutation.mutate({ knowledge_config: json })}
            disabled={isSaving}
          />
        </SectionCard>
      </div>

      <div className={styles.cardGrid}>
        <SectionCard title="⑨ 文档配置" hint="项目相关文档与架构文档链接">
          <DocsPanel
            key={projectId}
            value={project.docs_config ?? null}
            onChange={(json) => settingsMutation.mutate({ docs_config: json })}
            disabled={isSaving}
          />
        </SectionCard>

        <SectionCard title="⑫ 环境变量" hint="TC_ 前缀变量（只读，敏感字段脱敏）">
          <EnvPanel envConfig={project.env_config ?? null} />
        </SectionCard>
      </div>
    </div>
  )
}
