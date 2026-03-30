import type { HookStatusEntry } from '../../../lib/api/types'
import styles from '../settings.module.css'

const HOOK_PHASE: Record<string, { label: string; color: string }> = {
  PreToolUse:         { label: '调用前',    color: '#f59e0b' },
  PostToolUse:        { label: '调用后',    color: '#10b981' },
  PostToolUseFailure: { label: '调用失败',  color: '#ef4444' },
  SessionStart:       { label: '会话启动',  color: '#6366f1' },
  SessionEnd:         { label: '会话结束',  color: '#6366f1' },
  Stop:               { label: '停止',      color: '#8b5cf6' },
  SubagentStart:      { label: '子代理启动', color: '#0ea5e9' },
  SubagentStop:       { label: '子代理结束', color: '#0ea5e9' },
  Notification:       { label: '通知',      color: '#ec4899' },
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

export function HooksGrid({ projectId: _projectId, hooks }: HooksGridProps) {
  // 以脚本为 key，收集它注册的所有阶段
  const scriptMap = new Map<string, { fullCmd: string; scope: 'global' | 'project'; phases: string[] }>()

  for (const h of hooks) {
    const entries = [
      ...(h.global?.commands ?? []).map((c) => ({ cmd: c, scope: 'global' as const })),
      ...(h.project?.commands ?? []).map((c) => ({ cmd: c, scope: 'project' as const })),
    ]
    for (const { cmd, scope } of entries) {
      const name = cmdName(cmd)
      if (!scriptMap.has(name)) {
        scriptMap.set(name, { fullCmd: cmd, scope, phases: [] })
      }
      scriptMap.get(name)!.phases.push(h.event)
    }
  }

  if (scriptMap.size === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)' }}>
        暂未配置任何 Hook 脚本
      </div>
    )
  }

  return (
    <div className={styles.hookList}>
      {[...scriptMap.entries()].map(([name, { fullCmd, scope, phases }]) => {
        const desc = KNOWN_SCRIPTS[name]
        return (
          <div key={name} className={styles.hookListRow}>
            {/* 脚本名 + 描述 */}
            <div className={styles.hookScriptInfo}>
              <span className={styles.hookScriptName} title={fullCmd}>{name}</span>
              {desc && <span className={styles.hookScriptDesc}>{desc}</span>}
              <span
                className={styles.hookScopeTag}
                style={{ color: scope === 'global' ? '#4a80cc' : '#3aaa60' }}
              >
                {scope === 'global' ? '全局' : '项目级'}
              </span>
            </div>

            {/* 阶段标签列表 */}
            <div className={styles.hookPhaseList}>
              {phases.map((event) => {
                const phase = HOOK_PHASE[event] ?? { label: event, color: '#6b7280' }
                return (
                  <span
                    key={event}
                    className={styles.hookPhaseTag}
                    style={{ background: `${phase.color}20`, color: phase.color, border: `1px solid ${phase.color}40` }}
                    title={event}
                  >
                    {phase.label}
                  </span>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
