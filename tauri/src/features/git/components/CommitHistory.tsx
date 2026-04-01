import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useGitStore } from '@/lib/store/git'
import { useAppStore } from '@/lib/store/app'
import { useGitLog } from '../hooks/useGitLog'
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

export function CommitHistory() {
  const {
    historyBranch,
    historySearch,
    selectedCommit,
    setHistoryBranch,
    setHistorySearch,
    setSelectedCommit,
  } = useGitStore()

  const projectId = useAppStore((s) => s.activeProjectId)

  // 获取所有分支
  const { data: branches = [] } = useQuery({
    queryKey: ['git-branches', projectId],
    queryFn: () => api.gitBranches(Number(projectId!)),
    enabled: !!projectId,
    staleTime: 10_000,
  })

  const localBranches = branches.filter(b => !b.remote)

  // 全部提交
  const { data: allCommits = [] } = useGitLog(200)

  // 按分支过滤的提交
  const { data: branchCommits = [] } = useQuery({
    queryKey: ['git-log', projectId, 200, historyBranch],
    queryFn: () => api.gitLog(Number(projectId!), 200, historyBranch!),
    enabled: !!projectId && !!historyBranch,
    staleTime: 5_000,
  })

  const filtered = useMemo(() => {
    let list = historyBranch ? branchCommits : allCommits
    if (historySearch) {
      const q = historySearch.toLowerCase()
      list = list.filter(c =>
        c.message.toLowerCase().includes(q) || c.hash.startsWith(q)
      )
    }
    return list
  }, [allCommits, branchCommits, historySearch, historyBranch])

  const rows = useMemo(() => computeGraphLayout(filtered), [filtered])

  // 下拉状态
  const [dropOpen, setDropOpen] = useState(false)
  const [dropSearch, setDropSearch] = useState('')
  const dropRef = useRef<HTMLDivElement>(null)
  const dropSearchRef = useRef<HTMLInputElement>(null)

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
      setDropOpen(false)
      setDropSearch('')
    }
  }, [])

  useEffect(() => {
    if (dropOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      setTimeout(() => dropSearchRef.current?.focus(), 30)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [dropOpen, handleClickOutside])

  const filteredBranches = dropSearch
    ? localBranches.filter(b => b.name.toLowerCase().includes(dropSearch.toLowerCase()))
    : localBranches

  const displayLabel = historyBranch ?? '全部分支'

  return (
    <div className={css.panel}>
      <div className={css.toolbar}>
        <span className={css.title}>提交历史</span>

        {/* 分支下拉选择器 */}
        <div className={css.branchDropdown} ref={dropRef}>
          <button
            className={`${css.branchTrigger} ${dropOpen ? css.branchTriggerOpen : ''}`}
            onClick={() => setDropOpen(!dropOpen)}
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className={css.branchIcon}>
              <path d="M5 3.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0 2.122a2.25 2.25 0 10-1.5 0v.878A2.25 2.25 0 005.75 8.5h1.5v2.128a2.251 2.251 0 101.5 0V8.5h1.5a2.25 2.25 0 002.25-2.25v-.878a2.25 2.25 0 10-1.5 0v.878a.75.75 0 01-.75.75h-4.5A.75.75 0 015 6.25v-.878zm3.75 7.378a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3-8.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"/>
            </svg>
            <span className={css.branchLabel}>{displayLabel}</span>
            <svg width="8" height="8" viewBox="0 0 12 12" fill="currentColor" className={css.branchChevron}>
              <path d="M3 4.5l3 3 3-3"/>
            </svg>
          </button>

          {dropOpen && (
            <div className={css.branchPopover}>
              <div className={css.branchPopSearch}>
                <input
                  ref={dropSearchRef}
                  className={css.branchPopInput}
                  placeholder="搜索分支..."
                  value={dropSearch}
                  onChange={e => setDropSearch(e.target.value)}
                />
              </div>
              <div className={css.branchPopList}>
                {/* 全部分支选项 */}
                <div
                  className={`${css.branchPopItem} ${!historyBranch ? css.branchPopActive : ''}`}
                  onClick={() => { setHistoryBranch(null); setDropOpen(false); setDropSearch('') }}
                >
                  <span className={css.branchPopName}>全部分支</span>
                  {!historyBranch && <span className={css.branchCheck}>✓</span>}
                </div>

                <div className={css.branchPopDivider} />

                {filteredBranches.map(b => (
                  <div
                    key={b.name}
                    className={`${css.branchPopItem} ${historyBranch === b.name ? css.branchPopActive : ''}`}
                    onClick={() => { setHistoryBranch(b.name); setDropOpen(false); setDropSearch('') }}
                  >
                    <span className={css.branchPopName}>
                      {b.name}
                      {b.current && <span className={css.branchCurTag}>当前</span>}
                    </span>
                    {historyBranch === b.name && <span className={css.branchCheck}>✓</span>}
                  </div>
                ))}

                {filteredBranches.length === 0 && (
                  <div className={css.branchPopEmpty}>无匹配分支</div>
                )}
              </div>
            </div>
          )}
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
                {typeof row.commit.refs === 'string' && row.commit.refs && (
                  row.commit.refs.split(',').map(ref => ref.trim()).filter(Boolean).map(ref => (
                    <span key={ref} className={css.refBadge}>{ref}</span>
                  ))
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
