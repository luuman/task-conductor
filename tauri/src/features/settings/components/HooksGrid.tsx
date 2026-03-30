import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Toggle } from '../../../ui/toggle'
import { api } from '../../../lib/api'
import type { HookStatusEntry } from '../../../lib/api/types'
import styles from '../settings.module.css'

const HOOK_PHASE: Record<string, { label: string; color: string }> = {
  PreToolUse:         { label: '调用前',  color: '#f59e0b' },
  PostToolUse:        { label: '调用后',  color: '#10b981' },
  PostToolUseFailure: { label: '失败',    color: '#ef4444' },
  SessionStart:       { label: '会话启动', color: '#6366f1' },
  SessionEnd:         { label: '会话结束', color: '#6366f1' },
  Stop:               { label: '停止',    color: '#8b5cf6' },
  SubagentStart:      { label: '子代理启动', color: '#0ea5e9' },
  SubagentStop:       { label: '子代理结束', color: '#0ea5e9' },
  Notification:       { label: '通知',    color: '#ec4899' },
}

const KNOWN_SCRIPTS: Record<string, string> = {
  'tc-hook.sh':  'TaskConductor 观测',
  'tc-hook':     'TaskConductor 观测',
  'notify.sh':   '通知推送',
  'tts.sh':      '语音播报',
  'speak.sh':    '语音播报',
  'logger.sh':   '日志记录',
  'audit.sh':    '安全审计',
  'format.sh':   '代码格式化',
  'lint.sh':     '代码检查',
}

function cmdName(cmd: string) {
  const bin = cmd.trim().split(/\s+/)[0]
  return bin.includes('/') ? bin.split('/').pop()! : bin
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-hooks', projectId] }),
  })

  // 只显示有实际命令的 hooks
  const activeHooks = hooks.filter(
    (h) => (h.global?.commands?.length ?? 0) + (h.project?.commands?.length ?? 0) > 0
  )

  if (activeHooks.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)' }}>
        暂未配置任何 Hook 命令
      </div>
    )
  }

  return (
    <div className={styles.hookList}>
      {activeHooks.map((h) => {
        const phase = HOOK_PHASE[h.event] ?? { label: h.event, color: '#6b7280' }
        const projectEnabled = h.project?.enabled ?? false
        const allCmds = [
          ...(h.global?.commands ?? []).map((c) => ({ cmd: c, scope: 'global' as const })),
          ...(h.project?.commands ?? []).map((c) => ({ cmd: c, scope: 'project' as const })),
        ]

        return (
          <div key={h.event} className={styles.hookListRow}>
            {/* 阶段标签 */}
            <span
              className={styles.hookPhaseTag}
              style={{ background: `${phase.color}20`, color: phase.color, border: `1px solid ${phase.color}40`, flexShrink: 0 }}
            >
              {phase.label}
            </span>

            {/* 事件名 */}
            <span className={styles.hookEventName} style={{ flexShrink: 0 }}>{h.event}</span>

            {/* 命令列表 */}
            <div className={styles.hookCmdInline}>
              {allCmds.map(({ cmd, scope }, i) => {
                const name = cmdName(cmd)
                const desc = KNOWN_SCRIPTS[name]
                return (
                  <span key={i} className={styles.hookCmdChip} title={cmd}>
                    <span style={{ color: scope === 'global' ? '#4a80cc' : '#3aaa60', fontSize: 8, fontWeight: 700 }}>
                      {scope === 'global' ? 'G' : 'P'}
                    </span>
                    <span className={styles.hookCmdChipName}>{name}</span>
                    {desc && <span className={styles.hookCmdChipDesc}>{desc}</span>}
                  </span>
                )
              })}
            </div>

            {/* 项目级开关 */}
            <div style={{ flexShrink: 0 }}>
              <Toggle
                checked={projectEnabled}
                onChange={(checked) => mutation.mutate({ event: h.event, scope: 'project', enabled: checked })}
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
