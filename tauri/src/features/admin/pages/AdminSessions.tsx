// AdminSessions.tsx — Thin wrapper around shared SessionChat component
import { SessionChat } from '../../../components/SessionChat'
import styles from './sessions/sessions.module.css'

export default function AdminSessions() {
  return (
    <SessionChat
      layout="full"
      className={styles.root}
    />
  )
}
