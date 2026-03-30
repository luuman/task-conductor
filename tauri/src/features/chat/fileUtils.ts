/**
 * fileUtils — 共享文件图标颜色与 SVG 组件
 * 同时用于 ChatTimeline 和 PromptInput
 */
import React from 'react'

export const FILE_COLOR_MAP: Record<string, string> = {
  pdf: '#ef4444',
  doc: '#2563eb', docx: '#2563eb',
  xls: '#16a34a', xlsx: '#16a34a', csv: '#16a34a',
  ppt: '#ea580c', pptx: '#ea580c',
  txt: '#9ca3af', md: '#8b5cf6', mdx: '#8b5cf6',
  json: '#f59e0b', yaml: '#f59e0b', yml: '#f59e0b',
  js: '#f59e0b', jsx: '#60a5fa', ts: '#60a5fa', tsx: '#60a5fa',
  py: '#3b82f6', rb: '#ef4444', go: '#06b6d4', rs: '#ea580c',
  css: '#06b6d4', scss: '#ec4899', html: '#ea580c',
  svg: '#10b981', xml: '#f59e0b',
  zip: '#8b5cf6', tar: '#8b5cf6', gz: '#8b5cf6',
  mp4: '#ec4899', mov: '#ec4899', mp3: '#ec4899', wav: '#ec4899',
  sh: '#71717a', bash: '#71717a',
}

export function getFileColor(ext: string): string {
  return FILE_COLOR_MAP[ext.toLowerCase()] ?? '#71717a'
}

/**
 * 文件图标 SVG 组件，支持两种尺寸：
 * - width <= 28（默认）：28×34，用于 ChatTimeline
 * - width > 28：30×36，用于 PromptInput
 */
export function FileTypeSvgInline({ ext, width = 28, height: _height = 34 }: {
  ext: string
  width?: number
  height?: number
}) {
  const color = getFileColor(ext)
  const label = (ext || 'FILE').toUpperCase().slice(0, 4)

  if (width <= 28) {
    return (
      <svg width={28} height={34} viewBox="0 0 28 34" fill="none" style={{ flexShrink: 0 }}>
        <path d="M2 0 H17 L26 9 V32 Q26 34 24 34 H4 Q2 34 2 32 Z" fill={color} fillOpacity="0.15" />
        <path d="M2 0 H17 L26 9 V32 Q26 34 24 34 H4 Q2 34 2 32 Z" stroke={color} strokeWidth="1" strokeOpacity="0.6" />
        <path d="M17 0 L17 9 L26 9" stroke={color} strokeWidth="1" strokeOpacity="0.6" fill="none" />
        <text x="14" y="26" textAnchor="middle" fontSize="6.5" fontWeight="800" fill={color} fontFamily="ui-monospace,monospace">{label}</text>
      </svg>
    )
  }

  return (
    <svg width={30} height={36} viewBox="0 0 30 36" fill="none" style={{ flexShrink: 0 }}>
      <path d="M3 0 H18 L27 9 V33 Q27 36 24 36 H6 Q3 36 3 33 Z" fill={color} fillOpacity="0.15" />
      <path d="M3 0 H18 L27 9 V33 Q27 36 24 36 H6 Q3 36 3 33 Z" stroke={color} strokeWidth="1" strokeOpacity="0.6" />
      <path d="M18 0 L18 9 L27 9" stroke={color} strokeWidth="1" strokeOpacity="0.6" fill="none" />
      <text x="15" y="27" textAnchor="middle" fontSize="7" fontWeight="800" fill={color} fontFamily="ui-monospace,monospace">{label}</text>
    </svg>
  )
}

/**
 * 文件夹图标 SVG 组件，支持两种尺寸：
 * - width <= 38（默认）：38×32，用于 ChatTimeline
 * - width > 38：40×34，用于 PromptInput
 */
export function FolderSvgInline({ width = 38, height: _height = 32 }: {
  width?: number
  height?: number
} = {}) {
  if (width <= 38) {
    return (
      <svg width={38} height={32} viewBox="0 0 38 32" fill="none" style={{ flexShrink: 0 }}>
        <path d="M2 12 L2 8 Q2 6 4 6 L13 6 Q16 6 17 9 L18 12 Z" fill="#5ba4f5" />
        <rect x="2" y="11" width="34" height="19" rx="3" fill="#4b96e8" />
        <rect x="2" y="11" width="34" height="7" fill="#5ba4f5" />
        <rect x="2" y="16" width="34" height="2" fill="#4b96e8" />
      </svg>
    )
  }

  return (
    <svg width={40} height={34} viewBox="0 0 40 34" fill="none" style={{ flexShrink: 0 }}>
      <path d="M2 13 L2 9 Q2 7 4 7 L14 7 Q17 7 18 10 L19 13 Z" fill="#5ba4f5" />
      <rect x="2" y="12" width="36" height="20" rx="3" fill="#4b96e8" />
      <rect x="2" y="12" width="36" height="7" fill="#5ba4f5" />
      <rect x="2" y="17" width="36" height="2" fill="#4b96e8" />
    </svg>
  )
}
