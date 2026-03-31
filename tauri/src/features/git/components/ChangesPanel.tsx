import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useGitStore } from '@/lib/store/git'
import { useGitStatus } from '../hooks/useGitStatus'
import { useAppStore } from '@/lib/store/app'
import { api } from '@/lib/api'
import css from './ChangesPanel.module.css'

function statusClass(s: string): string {
  if (s === 'M') return css.stM
  if (s === 'A') return css.stA
  if (s === 'D') return css.stD
  return css.stU
}

function ChevronSvg() {
  return (
    <svg width="6" height="6" viewBox="0 0 8 8" fill="currentColor">
      <path d="M1.5 1l4 3-4 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
    </svg>
  )
}

export function ChangesPanel() {
  const { selectedFile, setSelectedFile, changesCollapsed, setChangesCollapsed } = useGitStore()
  const projectId = useAppStore((s) => s.activeProjectId)
  const { data: status } = useGitStatus()
  const qc = useQueryClient()

  const [commitMsg, setCommitMsg] = useState('')
  const [stagedOpen, setStagedOpen] = useState(true)
  const [unstagedOpen, setUnstagedOpen] = useState(true)
  const [untrackedOpen, setUntrackedOpen] = useState(true)

  const staged = status?.staged ?? []
  const unstaged = status?.unstaged ?? []
  const untracked = status?.untracked ?? []
  const totalCount = staged.length + unstaged.length + untracked.length

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['git-status', projectId] })
    qc.invalidateQueries({ queryKey: ['git-log', projectId] })
  }

  const pid = projectId ? Number(projectId) : null

  async function handleStage(files: string[]) {
    if (!pid) return
    await api.gitStage(pid, files)
    invalidate()
  }

  async function handleUnstage(files: string[]) {
    if (!pid) return
    await api.gitUnstage(pid, files)
    invalidate()
  }

  async function handleCommit() {
    if (!commitMsg.trim() || !pid) return
    await api.gitCommit(pid, commitMsg)
    setCommitMsg('')
    invalidate()
  }

  const currentBranch = status?.branch ?? ''

  return (
    <div className={css.panel}>
      {/* Header */}
      <div className={css.hdr} onClick={() => setChangesCollapsed(!changesCollapsed)}>
        <span className={`${css.hdrChev} ${changesCollapsed ? '' : css.open}`}><ChevronSvg /></span>
        <span className={css.hdrTitle}>变更</span>
        <span className={css.hdrCount}>{totalCount}</span>
      </div>

      {!changesCollapsed && (
        <div className={css.body}>
          {/* Staged */}
          <div className={`${css.subHdr} ${css.staged}`} onClick={() => setStagedOpen(v => !v)}>
            <span className={`${css.subChev} ${stagedOpen ? css.open : ''}`}><ChevronSvg /></span>
            <span className={css.subTitle}>已暂存</span>
            <span className={css.cntGreen}>{staged.length}</span>
          </div>
          {stagedOpen && staged.map(f => {
            const name = f.path.split('/').pop() ?? f.path
            const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/') + 1) : ''
            return (
              <div
                key={f.path}
                className={`${css.fileRow} ${css.stagedBg} ${selectedFile === f.path ? css.selected : ''}`}
                onClick={() => setSelectedFile(f.path)}
              >
                <input
                  type="checkbox"
                  className={`${css.chk} ${css.staged}`}
                  checked
                  readOnly
                  onClick={e => { e.stopPropagation(); handleUnstage([f.path]) }}
                />
                <div className={css.filePath}>
                  <div className={css.fileDir}>{dir}</div>
                  <div className={css.fileName}>{name}</div>
                </div>
                <div className={`${css.statusBadge} ${statusClass(f.status)}`}>{f.status}</div>
              </div>
            )
          })}

          {/* Unstaged */}
          <div className={`${css.subHdr} ${css.unstaged}`} onClick={() => setUnstagedOpen(v => !v)}>
            <span className={`${css.subChev} ${unstagedOpen ? css.open : ''}`}><ChevronSvg /></span>
            <span className={css.subTitle}>未暂存</span>
            <span className={css.cntRed}>{unstaged.length}</span>
          </div>
          {unstagedOpen && unstaged.map(f => {
            const name = f.path.split('/').pop() ?? f.path
            const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/') + 1) : ''
            return (
              <div
                key={f.path}
                className={`${css.fileRow} ${css.unstagedBg} ${selectedFile === f.path ? css.selected : ''}`}
                onClick={() => setSelectedFile(f.path)}
              >
                <input
                  type="checkbox"
                  className={css.chk}
                  onChange={() => handleStage([f.path])}
                />
                <div className={css.filePath}>
                  <div className={css.fileDir}>{dir}</div>
                  <div className={css.fileName}>{name}</div>
                </div>
                <div className={`${css.statusBadge} ${statusClass(f.status)}`}>{f.status}</div>
              </div>
            )
          })}

          {/* Untracked */}
          <div className={`${css.subHdr} ${css.untracked}`} onClick={() => setUntrackedOpen(v => !v)}>
            <span className={`${css.subChev} ${untrackedOpen ? css.open : ''}`}><ChevronSvg /></span>
            <span className={css.subTitle}>未追踪</span>
            <span className={css.cntGray}>{untracked.length}</span>
          </div>
          {untrackedOpen && untracked.map(f => {
            const name = f.path.split('/').pop() ?? f.path
            const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/') + 1) : ''
            return (
              <div
                key={f.path}
                className={`${css.fileRow} ${selectedFile === f.path ? css.selected : ''}`}
                onClick={() => setSelectedFile(f.path)}
              >
                <input
                  type="checkbox"
                  className={css.chk}
                  onChange={() => handleStage([f.path])}
                />
                <div className={css.filePath}>
                  <div className={css.fileDir}>{dir}</div>
                  <div className={css.fileName}>{name}</div>
                </div>
                <div className={`${css.statusBadge} ${css.stU}`}>U</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Commit area */}
      <div className={css.commitSection}>
        <div className={css.commitInputRow}>
          <div className={css.avatar}>S</div>
          <input
            className={css.msgInput}
            placeholder="提交摘要（必填）"
            value={commitMsg}
            onChange={e => setCommitMsg(e.target.value)}
          />
        </div>
        <div className={css.commitFoot}>
          <span className={css.coAuthors}>⊕ Co-authors</span>
          <button
            className={css.commitBtn}
            disabled={!commitMsg.trim() || staged.length === 0}
            onClick={handleCommit}
          >
            提交到 {currentBranch}
          </button>
        </div>
      </div>

      {/* Branch footer */}
      <div className={css.branchFooter}>
        <div className={css.branchName}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="var(--tc-success)">
            <path d="M5 3.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0 2.122a2.25 2.25 0 10-1.5 0v.878A2.25 2.25 0 005.75 8.5h1.5v2.128a2.251 2.251 0 101.5 0V8.5h1.5a2.25 2.25 0 002.25-2.25v-.878a2.25 2.25 0 10-1.5 0v.878a.75.75 0 01-.75.75h-4.5A.75.75 0 015 6.25v-.878zm3.75 7.378a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3-8.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"/>
          </svg>
          <span className={css.branchLabel}>{currentBranch}</span>
        </div>
        <button
          className={`${css.footBtn} ${css.primary}`}
          onClick={() => { if (pid) api.gitPush(pid) }}
        >
          Push
        </button>
        <button
          className={css.footBtn}
          onClick={() => { if (pid) { api.gitPull(pid); invalidate() } }}
        >
          Pull
        </button>
      </div>
    </div>
  )
}
