import { useState } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../lib/store/auth'
import { IconLogo } from '../../ui/icon'
import styles from './auth.module.css'

export default function AuthPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { token, login } = useAuthStore()

  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // 已登录则跳转回来源页或首页
  if (token) {
    const from = (location.state as { from?: string })?.from ?? '/'
    return <Navigate to={from} replace />
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/auth/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })

      if (!res.ok) {
        setError(t('auth.error_invalid_pin'))
        return
      }

      const data = await res.json()
      login(data.token)

      const from = (location.state as { from?: string })?.from ?? '/'
      navigate(from, { replace: true })
    } catch {
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <IconLogo size={32} className={styles.logoIcon} />
          <h1 className={styles.title}>{t('auth.title')}</h1>
        </div>
        <p className={styles.subtitle}>{t('auth.subtitle')}</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div>
            <label className={styles.label}>{t('auth.pin_label')}</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder={t('auth.pin_placeholder')}
              className={styles.input}
              autoFocus
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button
            type="submit"
            disabled={loading || pin.length < 6}
            className={styles.submitBtn}
          >
            {loading ? t('auth.connecting') : t('auth.login_btn')}
          </button>
        </form>
      </div>
    </div>
  )
}
