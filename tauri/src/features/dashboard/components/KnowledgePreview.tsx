import type { ProjectKnowledge } from '../../../lib/api/types'
import styles from './KnowledgePreview.module.css'

interface Props {
  items: ProjectKnowledge[]
}

export function KnowledgePreview({ items }: Props) {
  const recent = items.slice(0, 5)

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <span className={styles.title}>知识库</span>
        <span className={styles.count}>{items.length}</span>
      </div>
      <div className={styles.body}>
        {recent.length === 0 ? (
          <p className={styles.empty}>暂无知识条目</p>
        ) : (
          recent.map((k) => (
            <div key={k.id} className={styles.item}>
              <span className={styles.itemTitle}>{k.title}</span>
              <span className={styles.meta}>
                <span className={styles.badge}>{k.category}</span>
                <span className={styles.stage}>{k.stage}</span>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
