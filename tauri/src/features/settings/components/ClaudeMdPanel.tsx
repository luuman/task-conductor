import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ClaudeConfigResponse } from '../../../lib/api/types'
import styles from '../settings.module.css'
import mdStyles from '../../../styles/markdown.module.css'

const MD_COMPONENTS = {
  p:          ({ children }: { children?: React.ReactNode }) => <p className={mdStyles.mdP}>{children}</p>,
  h1:         ({ children }: { children?: React.ReactNode }) => <h1 className={mdStyles.mdH1}>{children}</h1>,
  h2:         ({ children }: { children?: React.ReactNode }) => <h2 className={mdStyles.mdH2}>{children}</h2>,
  h3:         ({ children }: { children?: React.ReactNode }) => <h3 className={mdStyles.mdH3}>{children}</h3>,
  ul:         ({ children }: { children?: React.ReactNode }) => <ul className={mdStyles.mdUl}>{children}</ul>,
  ol:         ({ children }: { children?: React.ReactNode }) => <ol className={mdStyles.mdOl}>{children}</ol>,
  li:         ({ children }: { children?: React.ReactNode }) => <li className={mdStyles.mdLi}>{children}</li>,
  strong:     ({ children }: { children?: React.ReactNode }) => <strong className={mdStyles.mdStrong}>{children}</strong>,
  em:         ({ children }: { children?: React.ReactNode }) => <em className={mdStyles.mdEm}>{children}</em>,
  blockquote: ({ children }: { children?: React.ReactNode }) => <blockquote className={mdStyles.mdBlockquote}>{children}</blockquote>,
  hr:         () => <hr className={mdStyles.mdHr} />,
  a:          ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className={mdStyles.mdLink}>{children}</a>
  ),
  code:       ({ inline, children }: { inline?: boolean; children?: React.ReactNode }) =>
    inline
      ? <code className={mdStyles.mdInlineCode}>{children}</code>
      : <code className={mdStyles.mdCodeBlockPlain}>{children}</code>,
  pre:        ({ children }: { children?: React.ReactNode }) => <pre className={mdStyles.mdPre}>{children}</pre>,
  table:      ({ children }: { children?: React.ReactNode }) => (
    <div className={mdStyles.mdTableWrap}><table className={mdStyles.mdTable}>{children}</table></div>
  ),
  th:         ({ children }: { children?: React.ReactNode }) => <th className={mdStyles.mdTh}>{children}</th>,
  td:         ({ children }: { children?: React.ReactNode }) => <td className={mdStyles.mdTd}>{children}</td>,
}

interface MdCardProps {
  label: string
  sizeKb: string
  content: string
}

function MdCard({ label, sizeKb, content }: MdCardProps) {
  return (
    <div className={styles.mdSourceCard}>
      <div className={styles.mdSourceCardHeader}>
        <span className={styles.mdSourceLabel}>{label}</span>
        <span className={styles.mdSourceSize}>{sizeKb} KB</span>
      </div>
      <div className={`${styles.mdSourceBody} ${mdStyles.mdContent}`}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS as never}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  )
}

interface ClaudeMdPanelProps {
  data: ClaudeConfigResponse | undefined
  isLoading: boolean
}

export function ClaudeMdPanel({ data, isLoading }: ClaudeMdPanelProps) {
  if (isLoading) {
    return <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)' }}>加载中...</div>
  }
  if (!data || (!data.project_root && !data.project_dot && !data.global)) {
    return <div style={{ fontSize: 12, color: 'var(--tc-foreground-secondary)' }}>无 CLAUDE.md 文件</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {data.project_root?.content && (
        <MdCard
          label="项目根目录 CLAUDE.md"
          sizeKb={(data.project_root.size / 1024).toFixed(1)}
          content={data.project_root.content}
        />
      )}
      {data.project_dot?.content && (
        <MdCard
          label=".claude/CLAUDE.md"
          sizeKb={(data.project_dot.size / 1024).toFixed(1)}
          content={data.project_dot.content}
        />
      )}
      {data.global?.content && (
        <MdCard
          label="全局 ~/.claude/CLAUDE.md"
          sizeKb={(data.global.size / 1024).toFixed(1)}
          content={data.global.content}
        />
      )}
    </div>
  )
}
