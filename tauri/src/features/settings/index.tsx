import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Toggle } from '../../ui/toggle'
import { api } from '../../lib/api'
import { useAppStore } from '../../lib/store/app'
import styles from './settings.module.css'

// 完整阶段顺序（不含 input/done，由后端 STAGE_ORDER 定义）
const CONFIGURABLE_STAGES = [
  'discovery', 'analysis', 'prd', 'architecture',
  'ui', 'plan', 'dev', 'review', 'test', 'security',
  'staging', 'deploy', 'monitor',
] as const

const STAGE_LABELS: Record<string, string> = {
  discovery:    '市场与用户调研',
  analysis:     '需求分析与方案评估',
  prd:          '产品需求文档',
  architecture: '系统架构设计',
  ui:           'UI/UX 设计',
  plan:         '技术规划与里程碑',
  dev:          '代码实现',
  review:       '代码审查',
  test:         '测试',
  security:     '安全审查',
  staging:      '预发布环境验证',
  deploy:       '生产部署',
  monitor:      '监控与告警',
}

function parseStagesConfig(raw: string | null): Set<string> | null {
  if (!raw) return null // null = 全部启用
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return new Set(arr)
  } catch { /* ignore */ }
  return null
}

export default function SettingsPage() {
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const projectId = activeProjectId ? Number(activeProjectId) : null
  const queryClient = useQueryClient()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.getProjects(),
    staleTime: 30_000,
  })

  const project = projects?.find((p) => p.id === projectId)

  const mutation = useMutation({
    mutationFn: (stages: string[]) => api.updateProjectStagesConfig(projectId!, stages),
    onMutate: () => setSaveStatus('saving'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 1500)
    },
    onError: () => setSaveStatus('idle'),
  })

  // 当前启用的阶段集合（null = 全部）
  const enabledSet = project ? parseStagesConfig(project.stages_config) : null
  const isEnabled = useCallback(
    (stage: string) => enabledSet === null || enabledSet.has(stage),
    [enabledSet]
  )

  const handleToggle = useCallback(
    (stage: string, checked: boolean) => {
      if (!project) return
      // 构建新的启用列表（始终按 CONFIGURABLE_STAGES 顺序）
      const current = enabledSet ?? new Set(CONFIGURABLE_STAGES)
      if (checked) {
        current.add(stage)
      } else {
        current.delete(stage)
      }
      const newConfig = CONFIGURABLE_STAGES.filter((s) => current.has(s))
      mutation.mutate(newConfig)
    },
    [project, enabledSet, mutation]
  )

  if (!project) return null

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>项目设置</div>
        <div className={styles.headerHint}>{project.name} · 流水线阶段配置</div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>流水线阶段</div>
          <div className={styles.sectionHint}>
            关闭不需要的阶段，流水线执行时将自动跳过；input 和 done 始终保留
          </div>
        </div>

        {/* 固定阶段：input */}
        <div className={`${styles.actionRow}`}>
          <div className={styles.actionInfo}>
            <div className={styles.actionLabel} style={{ fontFamily: 'monospace' }}>input</div>
            <div className={styles.actionHint}>需求输入（始终启用）</div>
          </div>
          <Toggle checked disabled onChange={() => {}} />
        </div>

        {CONFIGURABLE_STAGES.map((stage, i) => (
          <div key={stage}>
            {i > 0 && <div style={{ height: 1, background: 'var(--tc-border)', margin: '0 16px' }} />}
            <div className={styles.actionRow}>
              <div className={styles.actionInfo}>
                <div className={styles.actionLabel} style={{ fontFamily: 'monospace' }}>{stage}</div>
                <div className={styles.actionHint}>{STAGE_LABELS[stage]}</div>
              </div>
              <Toggle
                checked={isEnabled(stage)}
                onChange={(checked) => handleToggle(stage, checked)}
                disabled={mutation.isPending}
              />
            </div>
          </div>
        ))}

        {/* 固定阶段：done */}
        <div style={{ height: 1, background: 'var(--tc-border)', margin: '0 16px' }} />
        <div className={styles.actionRow}>
          <div className={styles.actionInfo}>
            <div className={styles.actionLabel} style={{ fontFamily: 'monospace' }}>done</div>
            <div className={styles.actionHint}>完成（始终启用）</div>
          </div>
          <Toggle checked disabled onChange={() => {}} />
        </div>
      </div>

      {saveStatus !== 'idle' && (
        <div className={styles.actionHint} style={{ marginTop: 8, maxWidth: 640, textAlign: 'right' }}>
          {saveStatus === 'saving' ? '保存中...' : '✓ 已保存'}
        </div>
      )}
    </div>
  )
}
