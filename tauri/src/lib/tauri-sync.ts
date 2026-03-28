import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './tauri';

export interface ArchivedSession {
  session_id: string;
  summary: string;
  cwd: string;
  started_at: string;
  last_event_at: string;
  event_count: number;
  enc_path: string;
  transcript: string;
  synced_at: string;
  is_favorite: number;   // 0 | 1
  is_deleted: number;    // 0 | 1
}

export interface SyncPullParams {
  master_key_hex: string;
  github_repo: string;
  github_pat: string;
}

export async function getArchivedSessions(): Promise<ArchivedSession[]> {
  if (!isTauri()) return [];
  return invoke<ArchivedSession[]>('get_archived_sessions_cmd');
}

export async function syncPull(params: SyncPullParams): Promise<number> {
  if (!isTauri()) return 0;
  return invoke<number>('sync_pull', {
    masterKeyHex: params.master_key_hex,
    githubRepo: params.github_repo,
    githubPat: params.github_pat,
  });
}

export async function toggleFavorite(sessionId: string): Promise<void> {
  if (!isTauri()) return;
  return invoke('toggle_favorite', { sessionId });
}

export async function deleteArchived(sessionId: string): Promise<void> {
  if (!isTauri()) return;
  return invoke('delete_archived', { sessionId });
}
