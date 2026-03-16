import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AiSession } from '../../../../lib/api/types'
import styles from './sessions.module.css'

const WEEK_DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEK_DAYS_ZH = ['\u5468\u4E00', '\u5468\u4E8C', '\u5468\u4E09', '\u5468\u56DB', '\u5468\u4E94', '\u5468\u516D', '\u5468\u65E5']

function getMonthLabel(year: number, month: number, lang: string): string {
  const date = new Date(year, month)
  if (lang.startsWith('zh')) {
    return `${year}\u5E74 ${month + 1}\u6708`
  }
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface CalendarDay {
  date: Date
  dayNum: number
  isCurrentMonth: boolean
  isToday: boolean
  sessionCount: number
}

function buildCalendarDays(year: number, month: number, sessionsByDate: Map<string, number>): CalendarDay[] {
  const today = new Date()
  const firstDay = new Date(year, month, 1)
  // Monday = 0 .. Sunday = 6
  let startDow = firstDay.getDay() - 1
  if (startDow < 0) startDow = 6

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const days: CalendarDay[] = []

  // Previous month fill
  for (let i = startDow - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i
    const date = new Date(year, month - 1, d)
    days.push({
      date,
      dayNum: d,
      isCurrentMonth: false,
      isToday: isSameDay(date, today),
      sessionCount: sessionsByDate.get(toDateKey(date)) ?? 0,
    })
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d)
    days.push({
      date,
      dayNum: d,
      isCurrentMonth: true,
      isToday: isSameDay(date, today),
      sessionCount: sessionsByDate.get(toDateKey(date)) ?? 0,
    })
  }

  // Fill remaining to complete 6 rows (42 cells)
  const remaining = 42 - days.length
  for (let d = 1; d <= remaining; d++) {
    const date = new Date(year, month + 1, d)
    days.push({
      date,
      dayNum: d,
      isCurrentMonth: false,
      isToday: isSameDay(date, today),
      sessionCount: sessionsByDate.get(toDateKey(date)) ?? 0,
    })
  }

  return days
}

interface Props {
  sessions: AiSession[] | null
  selectedDate: string | null
  onSelectDate: (dateKey: string | null) => void
}

export function SessionCalendar({ sessions, selectedDate, onSelectDate }: Props) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language.startsWith('zh')
  const weekDays = isZh ? WEEK_DAYS_ZH : WEEK_DAYS_EN

  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, number>()
    if (!sessions) return map
    for (const s of sessions) {
      const d = new Date(s.started_at)
      const key = toDateKey(d)
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [sessions])

  const days = useMemo(
    () => buildCalendarDays(viewYear, viewMonth, sessionsByDate),
    [viewYear, viewMonth, sessionsByDate],
  )

  const goPrev = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1)
      setViewMonth(11)
    } else {
      setViewMonth(viewMonth - 1)
    }
  }

  const goNext = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1)
      setViewMonth(0)
    } else {
      setViewMonth(viewMonth + 1)
    }
  }

  const handleCellClick = (day: CalendarDay) => {
    if (!day.isCurrentMonth) return
    const key = toDateKey(day.date)
    if (selectedDate === key) {
      onSelectDate(null) // deselect
    } else {
      onSelectDate(key)
    }
  }

  return (
    <div className={styles.calendarContainer}>
      {/* Navigation */}
      <div className={styles.calendarNav}>
        <button className={styles.calendarNavBtn} onClick={goPrev}>&lt;</button>
        <span className={styles.calendarMonthLabel}>
          {getMonthLabel(viewYear, viewMonth, i18n.language)}
        </span>
        <button className={styles.calendarNavBtn} onClick={goNext}>&gt;</button>
      </div>

      {/* Grid */}
      <div className={styles.calendarGrid}>
        <div className={styles.calendarWeekHeader}>
          {weekDays.map(d => (
            <div key={d} className={styles.calendarWeekDay}>{d}</div>
          ))}
        </div>
        <div className={styles.calendarDays}>
          {days.map((day, idx) => {
            const key = toDateKey(day.date)
            const isSelected = selectedDate === key
            const cellClasses = [
              day.isCurrentMonth ? styles.calendarCell : styles.calendarCellEmpty,
              day.isToday ? styles.calendarCellToday : '',
              isSelected ? styles.calendarCellSelected : '',
            ].filter(Boolean).join(' ')

            return (
              <div
                key={idx}
                className={cellClasses}
                onClick={() => handleCellClick(day)}
              >
                <span className={day.isCurrentMonth ? styles.calendarDayNum : styles.calendarDayNumOther}>
                  {day.dayNum}
                </span>
                {day.sessionCount > 0 && day.isCurrentMonth && (
                  day.sessionCount === 1
                    ? <span className={styles.calendarDot} />
                    : <span className={styles.calendarCount}>{day.sessionCount}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className={styles.statusBar}>
        <span>
          {selectedDate
            ? `${t('admin.sessions.showing_date')}: ${selectedDate}`
            : t('admin.sessions.all_dates')}
        </span>
        {selectedDate && (
          <button
            onClick={() => onSelectDate(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--tc-border-active)',
              cursor: 'pointer',
              fontSize: 10,
              fontFamily: 'inherit',
            }}
          >
            {t('admin.sessions.clear_filter')}
          </button>
        )}
      </div>
    </div>
  )
}
