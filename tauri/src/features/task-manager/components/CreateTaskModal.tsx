import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../../../ui/modal'
import { Button } from '../../../ui/button'
import styles from './CreateTaskModal.module.css'

interface CreateTaskModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: { title: string; description?: string }) => void
  loading?: boolean
}

export function CreateTaskModal({ open, onClose, onSubmit, loading }: CreateTaskModalProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onSubmit({ title: title.trim(), description: description.trim() || undefined })
    setTitle('')
    setDescription('')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('task_manager.create_title', '新建任务')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || loading}>
            {loading ? t('common.loading') : t('common.create')}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.label}>
          {t('task_manager.field_title', '标题')} *
          <input
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('task_manager.title_placeholder', '输入任务标题')}
            autoFocus
          />
        </label>
        <label className={styles.label}>
          {t('task_manager.field_desc', '描述')}
          <textarea
            className={styles.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('task_manager.desc_placeholder', '可选的任务描述')}
            rows={3}
          />
        </label>
      </form>
    </Modal>
  )
}
