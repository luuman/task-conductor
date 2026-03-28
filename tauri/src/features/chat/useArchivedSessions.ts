import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getArchivedSessions,
  toggleFavorite,
  deleteArchived,
} from '../../lib/tauri-sync';

export function useArchivedSessions() {
  return useQuery({
    queryKey: ['archivedSessions'],
    queryFn: getArchivedSessions,
    staleTime: 5 * 60 * 1000,
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => toggleFavorite(sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['archivedSessions'] }),
  });
}

export function useDeleteArchived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => deleteArchived(sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['archivedSessions'] }),
  });
}
