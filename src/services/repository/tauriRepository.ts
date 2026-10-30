import { invoke } from '@tauri-apps/api/core';
import type {
  BackupInfo,
  ImportResult,
  ReviewLog,
  Word,
  WordGroup,
  WordMark,
} from '../../domain/types';
import type { Repository } from './types';

interface DbImportOutcome {
  inserted: number;
  updated: number;
  skipped: number;
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);
  return new Error('数据库操作失败');
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw normalizeError(error);
  }
}

function toImportResult(outcome: DbImportOutcome): ImportResult {
  return { ...outcome, issues: [] };
}

export class TauriRepository implements Repository {
  readonly kind = 'tauri' as const;

  listWords(): Promise<Word[]> {
    return call<Word[]>('list_words');
  }

  insertWord(word: Word): Promise<void> {
    return call<void>('insert_word', { word });
  }

  updateWord(word: Word): Promise<void> {
    return call<void>('update_word', { word });
  }

  setWordsEnabled(ids: string[], enabled: boolean): Promise<void> {
    return call<void>('set_words_enabled', { ids, enabled });
  }

  setWordsDictationEnabled(ids: string[], enabled: boolean): Promise<void> {
    return call<void>('set_words_dictation_enabled', { ids, enabled });
  }

  setWordsStudyEnabled(ids: string[], enabled: boolean): Promise<void> {
    return call<void>('set_words_study_enabled', { ids, enabled });
  }

  setStudySelection(enableIds: string[], disableIds: string[]): Promise<void> {
    return call<void>('set_study_selection', { enableIds, disableIds });
  }

  setWordsGroup(ids: string[], groupId: string | null, now: number): Promise<void> {
    return call<void>('set_words_group', { ids, groupId, now });
  }

  setWordMark(id: string, mark: WordMark, now: number): Promise<void> {
    return call<void>('set_word_mark', { id, mark, now });
  }

  deleteWord(id: string): Promise<void> {
    return call<void>('delete_word', { id });
  }

  listGroups(): Promise<WordGroup[]> {
    return call<WordGroup[]>('list_groups');
  }

  insertGroup(group: WordGroup): Promise<void> {
    return call<void>('insert_group', { group });
  }

  updateGroup(group: WordGroup): Promise<void> {
    return call<void>('update_group', { group });
  }

  deleteGroup(id: string): Promise<void> {
    return call<void>('delete_group', { id });
  }

  submitReview(word: Word, log: ReviewLog): Promise<void> {
    return call<void>('submit_review', { word, log });
  }

  undoReview(logId: string, restoredWord: Word, skipLog: ReviewLog): Promise<void> {
    return call<void>('undo_review', { logId, restoredWord, skipLog });
  }

  listReviewLogs(since?: number): Promise<ReviewLog[]> {
    return call<ReviewLog[]>('list_review_logs', { since: since ?? null });
  }

  getSettings(): Promise<Record<string, string>> {
    return call<Record<string, string>>('get_settings');
  }

  setSetting(key: string, value: string, now: number): Promise<void> {
    return call<void>('set_setting', { key, value, now });
  }

  async importWords(words: Word[], replaceState: boolean): Promise<ImportResult> {
    const outcome = await call<DbImportOutcome>('import_words', { words, replaceState });
    return toImportResult(outcome);
  }

  async seedImport(words: Word[], now: number): Promise<ImportResult> {
    const outcome = await call<DbImportOutcome>('seed_import', { words, now });
    return toImportResult(outcome);
  }

  async restoreSeed(words: Word[], now: number): Promise<ImportResult> {
    const outcome = await call<DbImportOutcome>('restore_seed', { words, now });
    return toImportResult(outcome);
  }

  resetProgress(now: number): Promise<void> {
    return call<void>('reset_progress', { now });
  }

  getDatabasePath(): Promise<string> {
    return call<string>('get_database_path');
  }

  saveJsonFile(defaultName: string, content: string): Promise<string | null> {
    return call<string | null>('export_json_file', { defaultName, content });
  }

  createBackup(dayKey: string, now: number, manual: boolean): Promise<BackupInfo> {
    return call<BackupInfo>('create_backup', { dayKey, now, manual });
  }

  listBackups(): Promise<BackupInfo[]> {
    return call<BackupInfo[]>('list_backups');
  }

  getBackupDir(): Promise<string> {
    return call<string>('get_backup_dir');
  }

  restoreBackup(fileName: string, dayKey: string, now: number): Promise<BackupInfo> {
    return call<BackupInfo>('restore_backup', { fileName, dayKey, now });
  }
}
