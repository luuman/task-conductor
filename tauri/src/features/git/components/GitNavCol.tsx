// tauri/src/features/git/components/GitNavCol.tsx
import { useQuery } from '@tanstack/react-query'
import { useGitStore } from '@/lib/store/git'
import { useGitStatus } from '../hooks/useGitStatus'
import { useGitStashList } from '../hooks/useGitLog'
import { useAppStore } from '@/lib/store/app'
import { api } from '@/lib/api'
import css from './GitNavCol.module.css'

interface Props {
  onConfigClick: () => void
}

function ChevronIcon() {
  return (
    <svg width="7" height="7" viewBox="0 0 8 8" fill="currentColor">
      <path d="M1.5 1l4 3-4 3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
    </svg>
  )
}

function DotIcon({ cls }: { cls: string }) {
  return <span className={`${css.tdot} ${cls}`} />
}

export function GitNavCol({ onConfigClick }: Props) {
  const { navSections, setNavSection, setSelectedTask } = useGitStore()
  const projectId = useAppStore((s) => s.activeProjectId)

  const { data: status } = useGitStatus()
  const currentBranch = status?.branch ?? ''

  const { data: branches = [] } = useQuery({
    queryKey: ['git-branches', projectId],
    queryFn: () => api.gitBranches(Number(projectId!)),
    enabled: !!projectId,
    staleTime: 10_000,
  })

  const { data: stashes = [] } = useGitStashList()

  const localBranches = branches.filter(b => !b.remote)
  const remoteBranches = branches.filter(b => b.remote)

  // Group local branches by prefix (feat/, fix/, etc.)
  const grouped: Record<string, string[]> = {}
  const ungrouped: string[] = []
  for (const b of localBranches) {
    const slash = b.name.indexOf('/')
    if (slash > 0) {
      const prefix = b.name.slice(0, slash)
      grouped[prefix] ??= []
      grouped[prefix].push(b.name)
    } else {
      ungrouped.push(b.name)
    }
  }

  function toggle(key: string) {
    setNavSection(key, !navSections[key])
  }

  return (
    <aside className={css.nav}>
      <div className={css.repoHdr}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="#4ec9b0">
          <path d="M5 3.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0 2.122a2.25 2.25 0 10-1.5 0v.878A2.25 2.25 0 005.75 8.5h1.5v2.128a2.251 2.251 0 101.5 0V8.5h1.5a2.25 2.25 0 002.25-2.25v-.878a2.25 2.25 0 10-1.5 0v.878a.75.75 0 01-.75.75h-4.5A.75.75 0 015 6.25v-.878zm3.75 7.378a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3-8.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"/>
        </svg>
        <span className={css.repoName}>task-conductor</span>
      </div>

      <div className={css.scroll}>
        {/* 本地分支 */}
        <div className={css.grpHdr} onClick={() => toggle('local')}>
          <span className={`${css.grpChev} ${navSections.local ? css.open : ''}`}><ChevronIcon /></span>
          <span className={css.grpTxt}>本地分支</span>
          <span className={css.grpCnt}>{localBranches.length}</span>
        </div>
        <div className={`${css.grpBody} ${navSections.local ? '' : css.collapsed}`}>
          {Object.entries(grouped).map(([prefix, names]) => (
            <div key={prefix}>
              <div className={`${css.tnode} ${css.child}`}>
                <DotIcon cls={css.dotLoc} />
                <span className={css.tname} style={{ color: 'var(--tc-foreground-disabled,#444)' }}>{prefix}</span>
              </div>
              {names.map(name => (
                <div
                  key={name}
                  className={`${css.tnode} ${css.child2} ${name === currentBranch ? css.current : ''}`}
                  onClick={() => setSelectedTask(null, name)}
                >
                  <DotIcon cls={name === currentBranch ? css.dotCur : css.dotLoc} />
                  <span className={css.tname}>{name.slice(prefix.length + 1)}</span>
                  {name === currentBranch && <span className={css.badgeCur}>当前</span>}
                </div>
              ))}
            </div>
          ))}
          {ungrouped.map(name => (
            <div
              key={name}
              className={`${css.tnode} ${name === currentBranch ? css.current : ''}`}
              onClick={() => setSelectedTask(null, name)}
            >
              <DotIcon cls={name === currentBranch ? css.dotCur : css.dotLoc} />
              <span className={css.tname}>{name}</span>
              {name === currentBranch && <span className={css.badgeCur}>当前</span>}
            </div>
          ))}
        </div>

        {/* 远程 */}
        <div className={css.grpHdr} onClick={() => toggle('remote')}>
          <span className={`${css.grpChev} ${navSections.remote ? css.open : ''}`}><ChevronIcon /></span>
          <span className={css.grpTxt}>远程</span>
          <span className={css.grpCnt}>{remoteBranches.length}</span>
        </div>
        <div className={`${css.grpBody} ${navSections.remote ? '' : css.collapsed}`}>
          {remoteBranches.map(b => (
            <div key={b.name} className={`${css.tnode} ${css.child}`}>
              <DotIcon cls={css.dotRem} />
              <span className={css.tname}>{b.name}</span>
            </div>
          ))}
        </div>

        {/* 标签 */}
        <div className={css.grpHdr} onClick={() => toggle('tags')}>
          <span className={`${css.grpChev} ${navSections.tags ? css.open : ''}`}><ChevronIcon /></span>
          <span className={css.grpTxt}>标签</span>
        </div>
        <div className={`${css.grpBody} ${navSections.tags ? '' : css.collapsed}`} />

        {/* 储藏 */}
        <div className={css.grpHdr} onClick={() => toggle('stash')}>
          <span className={`${css.grpChev} ${navSections.stash ? css.open : ''}`}><ChevronIcon /></span>
          <span className={css.grpTxt}>储藏</span>
          <span className={css.grpCnt}>{stashes.length}</span>
        </div>
        <div className={`${css.grpBody} ${navSections.stash ? '' : css.collapsed}`}>
          {stashes.map((s, i) => (
            <div key={i} className={css.tnode}>
              <DotIcon cls={css.dotStash} />
              <span className={css.tname}>{s.message}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={css.footer}>
        <div className={css.cfgRow} onClick={onConfigClick}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M7.429 1.525a6.593 6.593 0 011.142 0c.036.003.108.036.137.146l.289 1.105c.147.56.55.967.997 1.189.174.086.341.178.502.274.45.262.957.314 1.417.129l1.038-.43c.104-.043.191-.006.243.048a6.809 6.809 0 01.571.99c.023.053.018.14-.048.217l-.733.812c-.37.41-.494.98-.408 1.499.023.137.035.277.035.42s-.012.283-.035.42c-.086.52.038 1.089.408 1.499l.733.81c.066.078.071.165.048.218a6.804 6.804 0 01-.571.99c-.052.054-.139.091-.243.048l-1.038-.43c-.46-.185-.967-.133-1.417.129a6.6 6.6 0 01-.502.274c-.447.222-.85.629-.997 1.188l-.289 1.105c-.029.11-.101.143-.137.146a6.587 6.587 0 01-1.142 0c-.036-.003-.108-.036-.137-.146l-.289-1.105c-.147-.56-.55-.966-.997-1.188a6.6 6.6 0 01-.502-.274c-.45-.262-.957-.314-1.417-.129l-1.038.43c-.104.043-.191.006-.243-.048a6.812 6.812 0 01-.571-.99c-.023-.053-.018-.14.048-.217l.733-.812c.37-.41.494-.98.408-1.499A4.01 4.01 0 013.5 8c0-.143.012-.283.035-.42.086-.519-.038-1.088-.408-1.499l-.733-.81c-.066-.078-.071-.165-.048-.218.13-.344.295-.676.571-.99.052-.054.139-.091.243-.048l1.038.43c.46.185.967.133 1.417-.129a6.6 6.6 0 01.502-.274c.447-.222.85-.628.997-1.189l.289-1.105c.029-.11.101-.143.137-.146zM8 10.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"/>
          </svg>
          仓库配置
        </div>
        <div className={css.branchRow}>
          <div className={css.branchChip}>⎇ {currentBranch}</div>
          <button className={css.branchBtn}>Push</button>
          <button className={css.branchBtn}>Pull</button>
        </div>
      </div>
    </aside>
  )
}
