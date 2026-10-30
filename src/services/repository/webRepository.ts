import {
  WORD_MARK_VALUES,
  type BackupInfo,
  type ImportResult,
  type ReviewLog,
  type Word,
  type WordGroup,
  type WordMark,
} from '../../domain/types';
import { createInitialState, normalizeWordState } from '../../domain/wordFactory';
import type { Repository } from './types';

const STORAGE_KEY = 'typeword.webdb.v1';
const BACKUP_STORAGE_KEY = 'typeword.webbackups.v1';
const MAX_DAILY_BACKUPS = 12;
const BACKUP_NAME_PATTERN = /^typeword-backup-[\d-]+\.sqlite3$/;
const DAILY_BACKUP_PATTERN = /^typeword-backup-\d{4}-\d{2}-\d{2}\.sqlite3$/;

interface WebDatabase {
  words: Word[];
  groups: WordGroup[];
  logs: ReviewLog[];
  settings: Record<string, string>;
}

interface WebBackupRecord {
  createdAt: number;
  data: string;
}

function emptyDatabase(): WebDatabase {
  return { words: [], groups: [], logs: [], settings: {} };
}

function normalizeMark(value: unknown): WordMark {
  return WORD_MARK_VALUES.includes(value as WordMark) ? (value as WordMark) : 'none';
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * 仅用于浏览器开发预览与 Playwright E2E 的回退实现。
 * 桌面发行版始终使用 Tauri + SQLite，不会走这里。
 * 所有写入一次性替换 localStorage 快照，模拟事务的原子性。
 */
export class WebRepository implements Repository {
  readonly kind = 'web' as const;

  private load(): WebDatabase {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyDatabase();
      const parsed = JSON.parse(raw) as Partial<WebDatabase>;
      return {
        words: Array.isArray(parsed.words)
          ? parsed.words.map((word) => ({
              ...word,
              enabled: word.enabled !== false,
              dictationEnabled:
                typeof word.dictationEnabled === 'boolean'
                  ? word.dictationEnabled
                  : word.enabled !== false,
              dictationState: normalizeWordState(
                word.dictationState,
                typeof word.nextReviewAt === 'number' ? word.nextReviewAt : Date.now(),
              ),
              studyEnabled: word.studyEnabled !== false,
              groupId: word.groupId ?? null,
              mark: normalizeMark(word.mark),
            }))
          : [],
        groups: Array.isArray(parsed.groups) ? parsed.groups : [],
        logs: Array.isArray(parsed.logs) ? parsed.logs : [],
        settings: parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {},
      };
    } catch {
      return emptyDatabase();
    }
  }

  private save(database: WebDatabase): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
  }

  private guardDuplicate(database: WebDatabase, word: Word, ignoredId?: string): void {
    const duplicate = database.words.some(
      (current) =>
        current.normalizedWord === word.normalizedWord && current.id !== ignoredId,
    );
    if (duplicate) throw new Error('词库中已存在同名单词');
  }

  async listWords(): Promise<Word[]> {
    return clone(this.load().words);
  }

  async insertWord(word: Word): Promise<void> {
    const database = this.load();
    this.guardDuplicate(database, word);
    database.words = [...database.words, clone(word)];
    this.save(database);
  }

  async updateWord(word: Word): Promise<void> {
    const database = this.load();
    const index = database.words.findIndex((current) => current.id === word.id);
    if (index === -1) throw new Error('单词不存在或已被删除');
    this.guardDuplicate(database, word, word.id);
    database.words = database.words.map((current) =>
      current.id === word.id ? clone(word) : current,
    );
    this.save(database);
  }

  async setWordsEnabled(ids: string[], enabled: boolean): Promise<void> {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const database = this.load();
    database.words = database.words.map((word) =>
      idSet.has(word.id) ? { ...word, enabled } : word,
    );
    this.save(database);
  }

  async setWordsStudyEnabled(ids: string[], enabled: boolean): Promise<void> {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const database = this.load();
    database.words = database.words.map((word) =>
      idSet.has(word.id) ? { ...word, studyEnabled: enabled } : word,
    );
    this.save(database);
  }

  async setWordsDictationEnabled(ids: string[], enabled: boolean): Promise<void> {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const database = this.load();
    database.words = database.words.map((word) =>
      idSet.has(word.id) ? { ...word, dictationEnabled: enabled } : word,
    );
    this.save(database);
  }

  async setStudySelection(enableIds: string[], disableIds: string[]): Promise<void> {
    if (enableIds.length === 0 && disableIds.length === 0) return;
    const enableSet = new Set(enableIds);
    const disableSet = new Set(disableIds);
    const database = this.load();
    database.words = database.words.map((word) => {
      if (enableSet.has(word.id)) return { ...word, studyEnabled: true };
      if (disableSet.has(word.id)) return { ...word, studyEnabled: false };
      return word;
    });
    this.save(database);
  }

  async setWordsGroup(ids: string[], groupId: string | null, now: number): Promise<void> {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const database = this.load();
    database.words = database.words.map((word) =>
      idSet.has(word.id) ? { ...word, groupId, updatedAt: now } : word,
    );
    this.save(database);
  }

  async setWordMark(id: string, mark: WordMark, now: number): Promise<void> {
    const database = this.load();
    const exists = database.words.some((word) => word.id === id);
    if (!exists) throw new Error('单词不存在或已被删除');
    database.words = database.words.map((word) =>
      word.id === id ? { ...word, mark, updatedAt: now } : word,
    );
    this.save(database);
  }

  async deleteWord(id: string): Promise<void> {
    const database = this.load();
    database.words = database.words.filter((word) => word.id !== id);
    database.logs = database.logs.filter((log) => log.wordId !== id);
    this.save(database);
  }

  private guardGroupName(database: WebDatabase, group: WordGroup, ignoredId?: string): void {
    const duplicate = database.groups.some(
      (current) =>
        current.id !== ignoredId &&
        current.name.toLowerCase() === group.name.toLowerCase(),
    );
    if (duplicate) throw new Error('已存在同名分组');
  }

  async listGroups(): Promise<WordGroup[]> {
    return clone(this.load().groups);
  }

  async insertGroup(group: WordGroup): Promise<void> {
    const database = this.load();
    this.guardGroupName(database, group);
    database.groups = [...database.groups, clone(group)];
    this.save(database);
  }

  async updateGroup(group: WordGroup): Promise<void> {
    const database = this.load();
    const exists = database.groups.some((current) => current.id === group.id);
    if (!exists) throw new Error('分组不存在或已被删除');
    this.guardGroupName(database, group, group.id);
    database.groups = database.groups.map((current) =>
      current.id === group.id ? clone(group) : current,
    );
    this.save(database);
  }

  async deleteGroup(id: string): Promise<void> {
    const database = this.load();
    database.groups = database.groups.filter((group) => group.id !== id);
    database.words = database.words.map((word) =>
      word.groupId === id ? { ...word, groupId: null } : word,
    );
    this.save(database);
  }

  async submitReview(word: Word, log: ReviewLog): Promise<void> {
    const database = this.load();
    const exists = database.words.some((current) => current.id === word.id);
    if (!exists) throw new Error('单词不存在或已被删除');
    const next: WebDatabase = {
      ...database,
      words: database.words.map((current) =>
        current.id === word.id ? clone(word) : current,
      ),
      logs: [...database.logs, clone(log)],
    };
    this.save(next);
  }

  async undoReview(logId: string, restoredWord: Word, skipLog: ReviewLog): Promise<void> {
    const database = this.load();
    const logExists = database.logs.some((log) => log.id === logId);
    if (!logExists) throw new Error('复习记录不存在或已被撤销');
    const wordExists = database.words.some((word) => word.id === restoredWord.id);
    if (!wordExists) throw new Error('单词不存在或已被删除');

    const next: WebDatabase = {
      ...database,
      words: database.words.map((word) =>
        word.id === restoredWord.id ? clone(restoredWord) : word,
      ),
      logs: [
        ...database.logs.filter((log) => log.id !== logId),
        clone(skipLog),
      ],
    };
    this.save(next);
  }

  async listReviewLogs(since?: number): Promise<ReviewLog[]> {
    const logs = this.load().logs;
    return clone(typeof since === 'number' ? logs.filter((log) => log.reviewedAt >= since) : logs);
  }

  async getSettings(): Promise<Record<string, string>> {
    return { ...this.load().settings };
  }

  async setSetting(key: string, value: string, now: number): Promise<void> {
    void now;
    const database = this.load();
    database.settings = { ...database.settings, [key]: value };
    this.save(database);
  }

  private mergeWords(
    database: WebDatabase,
    words: Word[],
    replaceState: boolean,
  ): ImportResult {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const nextWords = [...database.words];

    for (const word of words) {
      const index = nextWords.findIndex(
        (current) => current.normalizedWord === word.normalizedWord,
      );
      if (index === -1) {
        nextWords.push(clone(word));
        inserted += 1;
      } else if (replaceState) {
        nextWords[index] = {
          ...clone(word),
          id: nextWords[index].id,
          createdAt: nextWords[index].createdAt,
          enabled: nextWords[index].enabled,
          dictationEnabled: nextWords[index].dictationEnabled,
          dictationState: nextWords[index].dictationState,
          studyEnabled: nextWords[index].studyEnabled,
          groupId: nextWords[index].groupId,
          mark: nextWords[index].mark,
        };
        updated += 1;
      } else {
        skipped += 1;
      }
    }

    database.words = nextWords;
    return { inserted, updated, skipped, issues: [] };
  }

  async importWords(words: Word[], replaceState: boolean): Promise<ImportResult> {
    const database = this.load();
    const outcome = this.mergeWords(database, words, replaceState);
    this.save(database);
    return outcome;
  }

  async seedImport(words: Word[], now: number): Promise<ImportResult> {
    const database = this.load();
    if (database.settings.seed_imported === 'true') {
      return { inserted: 0, updated: 0, skipped: words.length, issues: [] };
    }
    const outcome = this.mergeWords(database, words, false);
    database.settings = { ...database.settings, seed_imported: 'true' };
    void now;
    this.save(database);
    return outcome;
  }

  async restoreSeed(words: Word[], now: number): Promise<ImportResult> {
    const database = this.load();
    const outcome = this.mergeWords(database, words, false);
    database.settings = { ...database.settings, seed_imported: 'true' };
    void now;
    this.save(database);
    return outcome;
  }

  async resetProgress(now: number): Promise<void> {
    const database = this.load();
    database.words = database.words.map((word) => ({
      ...word,
      ...createInitialState(now),
      dictationState: createInitialState(now),
      updatedAt: now,
    }));
    database.logs = [];
    this.save(database);
  }

  async getDatabasePath(): Promise<string> {
    return '浏览器 localStorage（开发 / E2E 回退存储）';
  }

  async saveJsonFile(defaultName: string, content: string): Promise<string | null> {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = defaultName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
    return defaultName;
  }

  private loadBackupStore(): Record<string, WebBackupRecord> {
    try {
      const raw = localStorage.getItem(BACKUP_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, WebBackupRecord>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private saveBackupStore(store: Record<string, WebBackupRecord>): void {
    localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(store));
  }

  private pruneDailyBackups(store: Record<string, WebBackupRecord>): void {
    const dailies = Object.entries(store)
      .filter(([name]) => DAILY_BACKUP_PATTERN.test(name))
      .sort((left, right) => right[1].createdAt - left[1].createdAt);
    for (const [name] of dailies.slice(MAX_DAILY_BACKUPS)) {
      delete store[name];
    }
  }

  async createBackup(dayKey: string, now: number, manual: boolean): Promise<BackupInfo> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) throw new Error('备份日期格式无效');
    const fileName = manual
      ? `typeword-backup-${dayKey}-${now}.sqlite3`
      : `typeword-backup-${dayKey}.sqlite3`;
    const store = this.loadBackupStore();
    if (!store[fileName]) {
      store[fileName] = { createdAt: now, data: JSON.stringify(this.load()) };
      this.pruneDailyBackups(store);
      this.saveBackupStore(store);
    }
    const record = store[fileName];
    return { fileName, createdAt: record.createdAt, size: byteLength(record.data) };
  }

  async listBackups(): Promise<BackupInfo[]> {
    return Object.entries(this.loadBackupStore())
      .map(([fileName, record]) => ({
        fileName,
        createdAt: record.createdAt,
        size: byteLength(record.data),
      }))
      .sort((left, right) => right.createdAt - left.createdAt);
  }

  async getBackupDir(): Promise<string> {
    return '浏览器 localStorage（开发 / E2E 回退存储）';
  }

  async restoreBackup(fileName: string, dayKey: string, now: number): Promise<BackupInfo> {
    if (!BACKUP_NAME_PATTERN.test(fileName)) throw new Error('备份文件名无效');
    const store = this.loadBackupStore();
    const record = store[fileName];
    if (!record) throw new Error('备份文件不存在或已被清理');
    let parsed: Partial<WebDatabase>;
    try {
      parsed = JSON.parse(record.data) as Partial<WebDatabase>;
    } catch {
      throw new Error('备份内容已损坏');
    }
    if (
      !Array.isArray(parsed.words) ||
      !Array.isArray(parsed.groups) ||
      !Array.isArray(parsed.logs)
    ) {
      throw new Error('备份内容结构无效');
    }
    const safety = await this.createBackup(dayKey, now, true);
    localStorage.setItem(STORAGE_KEY, record.data);
    return safety;
  }
}
