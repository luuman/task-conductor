import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNotificationStore, type NotificationItem } from '../../lib/store/notifications'
import { IconX } from '../../ui/icon'
import styles from './notification-panel.module.css'

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin}分钟前`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}小时前`
  return d.toLocaleDateString()
}

const LEVEL_CLASS: Record<string, string> = {
  critical: styles.levelCritical,
  warning: styles.levelWarning,
  info: styles.levelInfo,
}

export function NotificationPanel() {
  const { t } = useTranslation()
  const { items, panelOpen, setPanel, markRead, markAllRead, remove, clearAll } = useNotificationStore()

  const unreadCount = items.filter(n => !n.read).length

  const handleItemClick = useCallback((item: NotificationItem) => {
    if (!item.read) markRead(item.id)
  }, [markRead])

  if (!panelOpen) return null

  return (
    <>
      <div className={styles.overlay} onClick={() => setPanel(false)} />
      <aside className={styles.panel}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.title}>{t('notification.title')}</span>
            {unreadCount > 0 && (
              <span className={styles.badge}>{unreadCount}</span>
            )}
          </div>
          <div className={styles.headerActions}>
            {unreadCount > 0 && (
              <button className={styles.headerBtn} onClick={markAllRead}>
                {t('notification.markAllRead')}
              </button>
            )}
            {items.length > 0 && (
              <button className={styles.headerBtn} onClick={clearAll}>
                {t('notification.clearAll')}
              </button>
            )}
            <button className={styles.closeBtn} onClick={() => setPanel(false)}>
              <IconX size={16} />
            </button>
          </div>
        </div>

        {/* List */}
        <div className={styles.list}>
          {items.length === 0 ? (
            <div className={styles.empty}>{t('notification.empty')}</div>
          ) : (
            items.map(item => (
              <div key={item.id} className={styles.itemWrap}>
                <div
                  className={item.read ? styles.item : styles.itemUnread}
                  onClick={() => handleItemClick(item)}
                >
                  <span className={LEVEL_CLASS[item.level] ?? styles.levelInfo} />
                  <div className={styles.content}>
                    <div className={styles.itemHeader}>
                      <span className={styles.itemTitle}>{item.title}</span>
                      <span className={styles.itemTime}>{formatTime(item.ts)}</span>
                    </div>
                    <p className={styles.itemMessage}>{item.message}</p>
                    {(item.stage || item.taskId || item.sessionId) && (
                      <div className={styles.itemMeta}>
                        {item.stage && <span className={styles.metaTag}>{item.stage}</span>}
                        {item.taskId && <span className={styles.metaTag}>Task #{item.taskId}</span>}
                        {item.sessionId && (
                          <span className={styles.metaTag}>{item.sessionId.slice(0, 8)}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <button className={styles.removeBtn} onClick={() => remove(item.id)}>
                  <IconX size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  )
}
