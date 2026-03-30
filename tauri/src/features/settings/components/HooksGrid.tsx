import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Toggle } from '../../../ui/toggle'
import { api } from '../../../lib/api'
import type { HookStatusEntry } from '../../../lib/api/types'
import styles from '../settings.module.css'

interface HookMeta {
  desc: string
  phase: string
  phaseColor: string
}

const HOOK_META: Record<string, HookMeta> = {
  PreToolUse:          { desc: '工具调用前，可阻断或修改输入',   phase: '调用前',  phaseColor: '#f59e0b' },
  PostToolUse:         { desc: '工具调用成功后执行',             phase: '调用后',  phaseColor: '#10b981' },
  PostToolUseFailure:  { desc: '工具调用失败后执行',             phase: '失败',    phaseColor: '#ef4444' },
  SessionStart:        { desc: '会话启动时执行一次',             phase: '会话',    phaseColor: '#6366f1' },
  SessionEnd:          { desc: '会话正常结束时执行',             phase: '会话',    phaseColor: '#6366f1' },
  Stop:                { desc: 'Claude 停止输出前执行',          phase: '停止',    phaseColor: '#8b5cf6' },
  SubagentStart:       { desc: '子代理（Task tool）启动时',      phase: '代理',    phaseColor: '#0ea5e9' },
  SubagentStop:        { desc: '子代理执行结束时',               phase: '代理',    phaseColor: '#0ea5e9' },
  Notification:        { desc: '需要发送通知时（如等待输入）',   phase: '通知',    phaseColor: '#ec4899' },
}

interface HooksGridProps {
  projectId: number
  hooks: HookStatusEntry[]
}

export function HooksGrid({ projectId, hooks }: HooksGridProps) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: ({ event, scope, enabled }: { event: string; scope: 'global' | 'project'; enabled: boolean }) =>
      api.toggleProjectHook(projectId, event, scope, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-hooks', projectId] })
    },
  })

  return (
    <div className={styles.hooksGrid}>
      {hooks.map((h) => {
        const meta = HOOK_META[h.event] ?? { desc: '', phase: '其他', phaseColor: '#6b7280' }
        const globalEnabled = h.global?.enabled ?? false
        const projectEnabled = h.project?.enabled ?? false

        return (
          <div key={h.event} className={styles.hookCard}>
            <div className={styles.hookCardHeader}>
              <span className={styles.hookEventName}>{h.event}</span>
              <div className={styles.hookScopeDots}>
                <span
                  className={`${styles.scopeDot} ${globalEnabled ? styles.scopeDotActive : ''}`}
                  style={{ color: '#4a80cc', background: '#4a80cc' }}
                  title={`全局: ${globalEnabled ? '启用' : '未配置'}`}
                />
                <span
                  className={`${styles.scopeDot} ${projectEnabled ? styles.scopeDotActive : ''}`}
                  style={{ color: '#3aaa60', background: '#3aaa60' }}
                  title={`项目级: ${projectEnabled ? '启用' : '未配置'}`}
                />
              </div>
            </div>
            <div className={styles.hookDesc}>{meta.desc}</div>
            <div className={styles.hookCardFooter}>
              <span
                className={styles.hookPhaseTag}
                style={{
                  background: `${meta.phaseColor}20`,
                  color: meta.phaseColor,
                  border: `1px solid ${meta.phaseColor}40`,
                }}
              >
                {meta.phase}
              </span>
              <Toggle
                checked={projectEnabled}
                onChange={(checked) =>
                  mutation.mutate({ event: h.event, scope: 'project', enabled: checked })
                }
                disabled={mutation.isPending}
                title="控制项目级 hook"
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
