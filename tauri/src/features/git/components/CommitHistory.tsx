import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useGitStore } from '@/lib/store/git'
import { useAppStore } from '@/lib/store/app'
import { useGitLog } from '../hooks/useGitLog'
import { useGitStatus } from '../hooks/useGitStatus'
import { api } from '@/lib/api'
import { computeGraphLayout } from '../lib/graph-layout'
import { CommitGraph } from './CommitGraph'
import css from './CommitHistory.module.css'

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

const SCOPES = [
  { key: 'all' as const,     label: '全部' },
  { key: 'current' as const, label: '当前分支' },
  { key: 'other' as const,   label: '其他分支' },
]

export function CommitHistory() {
  const {
    historyScope,
    historySearch,
    selectedCommit,
    setHistoryScope,
    setHistorySearch,
    setSelectedCommit,
  } = useGitStore()

  const { data: allCommits = [] } = useGitLog(200)

  const filtered = useMemo(() => {
    let list = allCommits
    if (historySearch) {
      const q = historySearch.toLowerCase()
      list = list.filter(c =>
        c.message.toLowerCase().includes(q) || c.hash.startsWith(q)
      )
    }
    return list
  }, [allCommits, historySearch])

  const rows = useMemo(() => computeGraphLayout(filtered), [filtered])

  return (
    <div className={css.panel}>
      <div className={css.toolbar}>
        <span className={css.title}>提交历史</span>
        <div className={css.scopeTabs}>
          {SCOPES.map(s => (
            <button
              key={s.key}
              className={`${css.scopeTab} ${historyScope === s.key ? css.active : ''}`}
              onClick={() => setHistoryScope(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <input
          className={css.search}
          placeholder="搜索提交..."
          value={historySearch}
          onChange={e => setHistorySearch(e.target.value)}
        />
      </div>

      <div className={css.list}>
        {rows.map(row => (
          <div
            key={row.commit.hash}
            className={`${css.row} ${row.commit.hash === selectedCommit ? css.selected : ''}`}
            onClick={() => setSelectedCommit(row.commit.hash)}
          >
            <div className={css.graphCell}>
              <CommitGraph row={row} />
            </div>
            <div className={css.meta}>
              <div className={css.message}>{row.commit.message}</div>
              <div className={css.metaRow}>
                <span className={css.sha}>{row.commit.hash.slice(0, 7)}</span>
                <span className={css.author}>{row.commit.author}</span>
                {row.commit.refs && (
                  <span className={css.taskBadge}>{row.commit.refs.split(',')[0].trim()}</span>
                )}
                <span className={css.date}>{relativeTime(row.commit.date)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
