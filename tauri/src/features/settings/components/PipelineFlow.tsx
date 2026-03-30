import { useCallback } from 'react'
import styles from '../settings.module.css'

const ALL_STAGES = [
  'input', 'discovery', 'analysis', 'prd', 'architecture',
  'ui', 'plan', 'dev', 'review', 'test', 'security',
  'staging', 'deploy', 'monitor', 'done',
] as const

const FIXED_STAGES = new Set(['input', 'done'])
const APPROVAL_STAGES = new Set(['analysis', 'prd', 'ui', 'plan', 'test', 'deploy'])

const STAGE_LABELS: Record<string, string> = {
  input:        '需求输入',
  discovery:    '市场调研',
  analysis:     '需求分析',
  prd:          '产品文档',
  architecture: '架构设计',
  ui:           'UI/UX',
  plan:         '技术规划',
  dev:          '代码实现',
  review:       '代码审查',
  test:         '测试',
  security:     '安全审查',
  staging:      '预发布',
  deploy:       '部署',
  monitor:      '监控',
  done:         '完成',
}

interface PipelineFlowProps {
  enabledStages: Set<string> | null  // null = 全部启用
  onToggle: (stage: string, enabled: boolean) => void
  disabled?: boolean
}

export function PipelineFlow({ enabledStages, onToggle, disabled }: PipelineFlowProps) {
  const isEnabled = useCallback(
    (stage: string) => enabledStages === null || enabledStages.has(stage),
    [enabledStages]
  )

  const handleClick = (stage: string) => {
    if (disabled || FIXED_STAGES.has(stage)) return
    onToggle(stage, !isEnabled(stage))
  }

  return (
    <div className={styles.pipelineScroll}>
      <div className={styles.pipelineFlow}>
        {ALL_STAGES.map((stage, index) => {
          const fixed = FIXED_STAGES.has(stage)
          const enabled = isEnabled(stage)
          const approval = APPROVAL_STAGES.has(stage)
          const nodeClass = fixed
            ? styles.pipelineNodeFixed
            : enabled
              ? styles.pipelineNodeEnabled
              : styles.pipelineNodeDisabled

          return (
            <div key={stage} className={styles.pipelineItem}>
              {index > 0 && <div className={styles.pipelineArrow}>›</div>}
              <div
                className={`${styles.pipelineNode} ${nodeClass}`}
                onClick={() => handleClick(stage)}
                title={`${STAGE_LABELS[stage]}${approval ? '（需审批）' : ''}`}
              >
                <span className={`${styles.pipelineNodeCode} ${!enabled ? styles.pipelineNodeStrike : ''}`}>
                  {stage}
                </span>
                <span className={styles.pipelineNodeLabel}>
                  {STAGE_LABELS[stage]}
                </span>
                {approval && <span className={styles.pipelineApprovalDot} />}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
