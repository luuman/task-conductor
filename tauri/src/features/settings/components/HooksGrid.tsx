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

// 已知 hook 脚本名 → 简短描述
const KNOWN_SCRIPTS: Record<string, string> = {
  'tc-hook.sh':       'TaskConductor 观测',
  'tc-hook':          'TaskConductor 观测',
  'pre-commit':       '提交前检查',
  'post-commit':      '提交后处理',
  'notify.sh':        '通知推送',
  'tts.sh':           '语音播报',
  'speak.sh':         '语音播报',
  'logger.sh':        '日志记录',
  'audit.sh':         '安全审计',
  'format.sh':        '代码格式化',
  'lint.sh':          '代码检查',
  'test.sh':          '运行测试',
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

        const globalCmds = h.global?.commands ?? []
        const projectCmds = h.project?.commands ?? []
        const allCmds = [
          ...globalCmds.map((c) => ({ cmd: c, scope: 'global' as const })),
          ...projectCmds.map((c) => ({ cmd: c, scope: 'project' as const })),
        ]

        return (
          <div key={h.event} className={styles.hookCard}>
            <div className={styles.hookCardHeader}>
              <span className={styles.hookEventName}>{h.event}</span>
              <div className={styles.hookScopeDots}>
                <span
                  className={`${styles.scopeDot} ${globalEnabled ? styles.scopeDotActive : ''}`}
                  style={{ color: '#4a80cc', background: '#4a80cc' }}
                  title={`全局: ${globalEnabled ? '启用' : '未配置'}${globalCmds.length ? `（${globalCmds.length} 条命令）` : ''}`}
                />
                <span
                  className={`${styles.scopeDot} ${projectEnabled ? styles.scopeDotActive : ''}`}
                  style={{ color: '#3aaa60', background: '#3aaa60' }}
                  title={`项目级: ${projectEnabled ? '启用' : '未配置'}${projectCmds.length ? `（${projectCmds.length} 条命令）` : ''}`}
                />
              </div>
            </div>
            <div className={styles.hookDesc}>{meta.desc}</div>

            {/* 已配置的命令列表 */}
            {allCmds.length > 0 && (
              <div className={styles.hookCmdList}>
                {allCmds.map(({ cmd, scope }, i) => {
                  // 提取命令名：去掉路径，只保留文件名
                  const parts = cmd.trim().split(/\s+/)
                  const bin = parts[0]
                  const name = bin.includes('/') ? bin.split('/').pop()! : bin
                  const args = parts.slice(1).join(' ')
                  return (
                    <div key={i} className={styles.hookCmdRow}>
                      <span
                        className={styles.hookCmdScope}
                        style={{ color: scope === 'global' ? '#4a80cc' : '#3aaa60' }}
                        title={scope === 'global' ? '全局' : '项目级'}
                      >
                        {scope === 'global' ? 'G' : 'P'}
                      </span>
                      <span className={styles.hookCmdText} title={cmd}>
                        {name}{args ? ` ${args}` : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

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
