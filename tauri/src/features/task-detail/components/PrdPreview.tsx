import styles from './PrdPreview.module.css'
import { RequirementFields } from '../../../lib/api/types'

interface Props {
  fields: RequirementFields
  title: string
}

function renderList(items: string[] | undefined): string {
  if (!items || items.length === 0) return '*待补充*'
  return items.map(i => `- ${i}`).join('\n')
}

function fieldsToMarkdown(title: string, fields: RequirementFields): string {
  return `## ${title}

### 背景
${fields.background || '*待补充*'}

### 目标用户
${fields.target_users || '*待补充*'}

### 核心功能
${renderList(fields.core_features)}

### 验收标准
${renderList(fields.acceptance_criteria)}

### 技术约束
${fields.tech_constraints || '*无特殊约束*'}
`
}

// 简单 Markdown 渲染（不引入第三方库）
function renderMarkdown(md: string): string {
  return md
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '<br/><br/>')
}

export function PrdPreview({ fields, title }: Props) {
  const markdown = fieldsToMarkdown(title, fields)
  const html = renderMarkdown(markdown)

  return (
    <div className={styles.root}>
      <div className={styles.header}>PRD 预览</div>
      <div
        className={styles.content}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
