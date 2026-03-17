import { useQuery } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'
import { api } from '../../../lib/api'
import { useAppStore } from '../../../lib/store/app'
import { isTauri } from '../../../lib/tauri'
import type { FileItem } from '../../../lib/api/types'

/**
 * 获取项目根文件列表（初始加载）
 */
export function useFileTree() {
  const projectId = useAppStore((s) => s.activeProjectId)
  return useQuery({
    queryKey: ['files', projectId],
    queryFn: () => api.getProjectFiles(Number(projectId!)),
    enabled: !!projectId,
    staleTime: 30_000,
  })
}

/**
 * Lazy loading：按需获取子目录内容
 * - Tauri 桌面模式：调用 Rust IPC（list_dir），零 HTTP 开销
 * - Web 模式：调用 HTTP API（/api/projects/{id}/files?path=...）
 */
export function useDirExpander(projectRoot?: string) {
  const projectId = useAppStore((s) => s.activeProjectId)
  const cacheRef = useRef<Map<string, FileItem[]>>(new Map())

  const expandDir = useCallback(
    async (dirPath: string): Promise<FileItem[]> => {
      // 查本地缓存
      const cached = cacheRef.current.get(dirPath)
      if (cached) return cached

      let items: FileItem[]

      if (isTauri() && projectRoot) {
        // Rust IPC 路径
        const { invoke } = await import('@tauri-apps/api/core')
        items = await invoke<FileItem[]>('list_dir', {
          root: projectRoot,
          relPath: dirPath,
        })
      } else if (projectId) {
        // HTTP API 路径
        const result = await api.listDir(Number(projectId), dirPath)
        items = result.items
      } else {
        return []
      }

      cacheRef.current.set(dirPath, items)
      return items
    },
    [projectId, projectRoot],
  )

  const invalidate = useCallback(
    (dirPath?: string) => {
      if (dirPath) {
        cacheRef.current.delete(dirPath)
      } else {
        cacheRef.current.clear()
      }
    },
    [],
  )

  return { expandDir, invalidate }
}
