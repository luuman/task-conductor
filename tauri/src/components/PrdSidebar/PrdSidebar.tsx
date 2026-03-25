import { useCallback, useMemo, useState } from 'react'
import { useChatStore } from '../../lib/store/chat'
import { IconX } from '../../ui/icon'
import styles from './PrdSidebar.module.css'

interface PrdData {
  title?: string
  background?: string
  goals?: string[]
  requirements?: string[]
  non_requirements?: string[]
  stages?: string[]
}

export function PrdSidebar() {
  const { prdContent, prdSidebarOpen, closePrdSidebar, activeTaskId } = useChatStore()
  const [confirming, setConfirming] = useState(false)
  const [selectedStages, setSelectedStages] = useState<string[]>([])

  const prd = useMemo<PrdData | null>(() => {
    if (!prdContent) return null
    try {
      const data = JSON.parse(prdContent) as PrdData
      return data
    } catch {
      return null
    }
  }, [prdContent])

  // 同步推荐阶段到 selectedStages
  useMemo(() => {
    if (prd?.stages) {
      setSelectedStages([...prd.stages])
    }
  }, [prd?.stages])

  const toggleStage = useCallback((stage: string) => {
    setSelectedStages((prev) =>
      prev.includes(stage) ? prev.filter((s) => s !== stage) : [...prev, stage]
    )
  }, [])

  const handleConfirm = useCallback(async () => {
    if (!prdContent || !activeTaskId) return
    setConfirming(true)
    try {
      const { HttpAdapter } = await import('../../lib/api/http')
      const api = new HttpAdapter('local-http')
      await api.completeInterview(activeTaskId, {
        prd: prdContent,
        stages: selectedStages,
      })
      closePrdSidebar()
    } catch (e) {
      console.error('Confirm PRD failed:', e)
    } finally {
      setConfirming(false)
    }
  }, [prdContent, activeTaskId, selectedStages, closePrdSidebar])

  return (
    <>
      {prdSidebarOpen && <div className={styles.overlay} onClick={closePrdSidebar} />}
      <div className={`${styles.sidebar} ${prdSidebarOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.header}>
          <span className={styles.title}>PRD 文档</span>
          <button className={styles.closeBtn} onClick={closePrdSidebar}><IconX size={14} /></button>
        </div>

        <div className={styles.content}>
          {!prd ? (
            <div className={styles.emptyState}>等待 AI 生成 PRD...</div>
          ) : (
            <>
              {prd.title && (
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>标题</div>
                  <div className={styles.fieldValue}>{prd.title}</div>
                </div>
              )}

              {prd.background && (
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>背景</div>
                  <div className={styles.fieldValue}>{prd.background}</div>
                </div>
              )}

              {prd.goals && prd.goals.length > 0 && (
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>目标</div>
                  <ul className={styles.list}>
                    {prd.goals.map((g, i) => (
                      <li key={i} className={styles.listItem}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}

              {prd.requirements && prd.requirements.length > 0 && (
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>需求</div>
                  <ul className={styles.list}>
                    {prd.requirements.map((r, i) => (
                      <li key={i} className={styles.listItem}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {prd.non_requirements && prd.non_requirements.length > 0 && (
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>不做的事</div>
                  <ul className={styles.list}>
                    {prd.non_requirements.map((r, i) => (
                      <li key={i} className={styles.listItem}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {prd.stages && prd.stages.length > 0 && (
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>推荐阶段</div>
                  <ul className={styles.stageList}>
                    {prd.stages.map((s) => (
                      <li key={s} className={styles.stageItem}>
                        <input
                          type="checkbox"
                          className={styles.stageCheck}
                          checked={selectedStages.includes(s)}
                          onChange={() => toggleStage(s)}
                        />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {prd && activeTaskId && (
          <div className={styles.footer}>
            <button
              className={styles.confirmBtn}
              onClick={handleConfirm}
              disabled={confirming || selectedStages.length === 0}
            >
              {confirming ? '确认中...' : '确认 PRD 并设置阶段'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
