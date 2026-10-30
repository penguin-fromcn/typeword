import type {
  BackupInfo,
  ImportResult,
  ReviewLog,
  Word,
  WordGroup,
  WordMark,
} from '../../domain/types';

export interface Repository {
  readonly kind: 'tauri' | 'web';
  listWords(): Promise<Word[]>;
  insertWord(word: Word): Promise<void>;
  updateWord(word: Word): Promise<void>;
  setWordsEnabled(ids: string[], enabled: boolean): Promise<void>;
  setWordsDictationEnabled(ids: string[], enabled: boolean): Promise<void>;
  setWordsStudyEnabled(ids: string[], enabled: boolean): Promise<void>;
  setStudySelection(enableIds: string[], disableIds: string[]): Promise<void>;
  setWordsGroup(ids: string[], groupId: string | null, now: number): Promise<void>;
  setWordMark(id: string, mark: WordMark, now: number): Promise<void>;
  deleteWord(id: string): Promise<void>;
  listGroups(): Promise<WordGroup[]>;
  insertGroup(group: WordGroup): Promise<void>;
  updateGroup(group: WordGroup): Promise<void>;
  deleteGroup(id: string): Promise<void>;
  submitReview(word: Word, log: ReviewLog): Promise<void>;
  undoReview(logId: string, restoredWord: Word, skipLog: ReviewLog): Promise<void>;
  listReviewLogs(since?: number): Promise<ReviewLog[]>;
  getSettings(): Promise<Record<string, string>>;
  setSetting(key: string, value: string, now: number): Promise<void>;
  importWords(words: Word[], replaceState: boolean): Promise<ImportResult>;
  seedImport(words: Word[], now: number): Promise<ImportResult>;
  restoreSeed(words: Word[], now: number): Promise<ImportResult>;
  resetProgress(now: number): Promise<void>;
  getDatabasePath(): Promise<string>;
  saveJsonFile(defaultName: string, content: string): Promise<string | null>;
  createBackup(dayKey: string, now: number, manual: boolean): Promise<BackupInfo>;
  listBackups(): Promise<BackupInfo[]>;
  getBackupDir(): Promise<string>;
  restoreBackup(fileName: string, dayKey: string, now: number): Promise<BackupInfo>;
}
