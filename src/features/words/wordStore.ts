import { create } from 'zustand';
import type { ImportResult, StudyPool, Word, WordGroup, WordInput, WordMark } from '../../domain/types';
import { createInitialWord, applyWordInput, createId } from '../../domain/wordFactory';
import {
  exportWordsToFile,
  persistPreparedImport,
  readImportFile,
} from '../../services/importExportService';
import { repository } from '../../services/repository';
import { loadSeedWords } from '../../services/seedService';

export interface ImportFileResult extends ImportResult {
  group: WordGroup | null;
}

export interface ImportFileOptions {
  groupName?: string | null;
}

interface WordStoreState {
  words: Word[];
  groups: WordGroup[];
  loading: boolean;
  error: string | null;
  search: string;
  category: string;
  difficulty: number | null;
  mark: WordMark | '';
  pool: StudyPool;
  load: () => Promise<void>;
  create: (input: WordInput) => Promise<Word>;
  update: (id: string, input: WordInput) => Promise<Word>;
  remove: (id: string) => Promise<void>;
  importFile: (file: File, options?: ImportFileOptions) => Promise<ImportFileResult>;
  exportFile: () => Promise<string | null>;
  restoreSeed: () => Promise<ImportResult>;
  createGroup: (name: string) => Promise<WordGroup>;
  renameGroup: (id: string, name: string) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  setGroupEnabled: (id: string, enabled: boolean) => Promise<void>;
  setWordsEnabled: (ids: string[], enabled: boolean) => Promise<void>;
  setWordsDictationEnabled: (ids: string[], enabled: boolean) => Promise<void>;
  setWordsStudyEnabled: (ids: string[], enabled: boolean) => Promise<void>;
  applyStudySelection: (enableIds: string[], disableIds: string[]) => Promise<void>;
  setWordsGroup: (ids: string[], groupId: string | null) => Promise<void>;
  setWordMark: (id: string, mark: WordMark) => Promise<void>;
  setSearch: (search: string) => void;
  setCategory: (category: string) => void;
  setDifficulty: (difficulty: number | null) => void;
  setMark: (mark: WordMark | '') => void;
  setPool: (pool: StudyPool) => void;
}

export const useWordStore = create<WordStoreState>((set, get) => ({
  words: [],
  groups: [],
  loading: false,
  error: null,
  search: '',
  category: '',
  difficulty: null,
  mark: '',
  pool: 'practice',

  load: async () => {
    set({ loading: true, error: null });
    try {
      const [words, groups] = await Promise.all([
        repository.listWords(),
        repository.listGroups(),
      ]);
      set({ words, groups, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : '词库加载失败',
      });
    }
  },

  create: async (input) => {
    const groupId =
      input.groupId && get().groups.some((group) => group.id === input.groupId)
        ? input.groupId
        : null;
    const word = createInitialWord({ ...input, groupId }, Date.now());
    await repository.insertWord(word);
    set((state) => ({ words: [...state.words, word] }));
    return word;
  },

  update: async (id, input) => {
    const current = get().words.find((word) => word.id === id);
    if (!current) throw new Error('单词不存在或已被删除');
    const groupId =
      input.groupId === undefined
        ? current.groupId
        : input.groupId && get().groups.some((group) => group.id === input.groupId)
          ? input.groupId
          : null;
    const updated = applyWordInput(current, { ...input, groupId }, Date.now());
    await repository.updateWord(updated);
    set((state) => ({
      words: state.words.map((word) => (word.id === id ? updated : word)),
    }));
    return updated;
  },

  remove: async (id) => {
    await repository.deleteWord(id);
    set((state) => ({ words: state.words.filter((word) => word.id !== id) }));
  },

  createGroup: async (name) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('分组名称不能为空');
    const now = Date.now();
    const group: WordGroup = {
      id: createId('g_'),
      name: trimmed,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    await repository.insertGroup(group);
    set((state) => ({ groups: [...state.groups, group] }));
    return group;
  },

  renameGroup: async (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('分组名称不能为空');
    const current = get().groups.find((group) => group.id === id);
    if (!current) throw new Error('分组不存在或已被删除');
    const updated = { ...current, name: trimmed, updatedAt: Date.now() };
    await repository.updateGroup(updated);
    set((state) => ({
      groups: state.groups.map((group) => (group.id === id ? updated : group)),
    }));
  },

  deleteGroup: async (id) => {
    await repository.deleteGroup(id);
    set((state) => ({
      groups: state.groups.filter((group) => group.id !== id),
      words: state.words.map((word) =>
        word.groupId === id ? { ...word, groupId: null } : word,
      ),
    }));
  },

  setGroupEnabled: async (id, enabled) => {
    const current = get().groups.find((group) => group.id === id);
    if (!current) return;
    const updated = { ...current, enabled, updatedAt: Date.now() };
    await repository.updateGroup(updated);
    set((state) => ({
      groups: state.groups.map((group) => (group.id === id ? updated : group)),
    }));
  },

  setWordsEnabled: async (ids, enabled) => {
    const idSet = new Set(ids);
    const targets = get().words.filter(
      (word) => idSet.has(word.id) && word.enabled !== enabled,
    );
    if (targets.length === 0) return;
    await repository.setWordsEnabled(
      targets.map((word) => word.id),
      enabled,
    );
    set((state) => ({
      words: state.words.map((word) => (idSet.has(word.id) ? { ...word, enabled } : word)),
    }));
  },

  setWordsDictationEnabled: async (ids, enabled) => {
    const idSet = new Set(ids);
    const targets = get().words.filter(
      (word) => idSet.has(word.id) && word.dictationEnabled !== enabled,
    );
    if (targets.length === 0) return;
    await repository.setWordsDictationEnabled(
      targets.map((word) => word.id),
      enabled,
    );
    set((state) => ({
      words: state.words.map((word) =>
        idSet.has(word.id) ? { ...word, dictationEnabled: enabled } : word,
      ),
    }));
  },

  setWordsStudyEnabled: async (ids, enabled) => {
    const idSet = new Set(ids);
    const targets = get().words.filter(
      (word) => idSet.has(word.id) && word.studyEnabled !== enabled,
    );
    if (targets.length === 0) return;
    await repository.setWordsStudyEnabled(
      targets.map((word) => word.id),
      enabled,
    );
    set((state) => ({
      words: state.words.map((word) =>
        idSet.has(word.id) ? { ...word, studyEnabled: enabled } : word,
      ),
    }));
  },

  applyStudySelection: async (enableIds, disableIds) => {
    const enableSet = new Set(enableIds);
    const disableSet = new Set(disableIds);
    const toEnable = get()
      .words.filter((word) => enableSet.has(word.id) && !word.studyEnabled)
      .map((word) => word.id);
    const toDisable = get()
      .words.filter((word) => disableSet.has(word.id) && word.studyEnabled)
      .map((word) => word.id);
    if (toEnable.length === 0 && toDisable.length === 0) return;
    await repository.setStudySelection(toEnable, toDisable);
    set((state) => ({
      words: state.words.map((word) => {
        if (enableSet.has(word.id)) return { ...word, studyEnabled: true };
        if (disableSet.has(word.id)) return { ...word, studyEnabled: false };
        return word;
      }),
    }));
  },

  setWordsGroup: async (ids, groupId) => {
    const targetId =
      groupId && get().groups.some((group) => group.id === groupId) ? groupId : null;
    const idSet = new Set(ids);
    const now = Date.now();
    const targets = get().words.filter(
      (word) => idSet.has(word.id) && word.groupId !== targetId,
    );
    if (targets.length === 0) return;

    await repository.setWordsGroup(
      targets.map((word) => word.id),
      targetId,
      now,
    );
    const updatedIds = new Set(targets.map((word) => word.id));
    set((state) => ({
      words: state.words.map((word) =>
        updatedIds.has(word.id) ? { ...word, groupId: targetId, updatedAt: now } : word,
      ),
    }));
  },

  setWordMark: async (id, mark) => {
    const current = get().words.find((word) => word.id === id);
    if (!current || current.mark === mark) return;
    const now = Date.now();
    await repository.setWordMark(id, mark, now);
    set((state) => ({
      words: state.words.map((word) =>
        word.id === id ? { ...word, mark, updatedAt: now } : word,
      ),
    }));
  },

  importFile: async (file, options) => {
    const prepared = await readImportFile(file, Date.now());
    if (prepared.words.length === 0) {
      return { inserted: 0, updated: 0, skipped: 0, issues: prepared.issues, group: null };
    }

    let group: WordGroup | null = null;
    const groupName = options?.groupName?.trim() ?? '';
    if (groupName) {
      group = await get().createGroup(groupName);
      const groupId = group.id;
      prepared.words = prepared.words.map((word) => ({ ...word, groupId }));
    }

    let result: ImportResult;
    try {
      result = await persistPreparedImport(prepared);
    } catch (error) {
      if (group) {
        try {
          await get().deleteGroup(group.id);
        } catch {
          // 清理失败不应掩盖原始导入错误
        }
      }
      throw error;
    }

    if (group && result.inserted === 0) {
      try {
        await get().deleteGroup(group.id);
        group = null;
      } catch {
        // 保留空分组比丢掉导入结果更安全
      }
    }

    await get().load();
    return { ...result, group };
  },

  exportFile: async () => {
    const words = get().words;
    return exportWordsToFile(words, Date.now());
  },

  restoreSeed: async () => {
    const now = Date.now();
    const { words, issues } = await loadSeedWords(now);
    const outcome = await repository.restoreSeed(words, now);
    await get().load();
    return { ...outcome, issues: [...issues, ...outcome.issues] };
  },

  setSearch: (search) => set({ search }),
  setCategory: (category) => set({ category }),
  setDifficulty: (difficulty) => set({ difficulty }),
  setMark: (mark) => set({ mark }),
  setPool: (pool) => set({ pool }),
}));

export function filterWords(
  words: Word[],
  search: string,
  category: string,
  difficulty: number | null,
  mark: WordMark | '' = '',
): Word[] {
  const needle = search.trim().toLowerCase();

  return words.filter((word) => {
    if (category && word.category !== category) return false;
    if (difficulty !== null && word.difficulty !== difficulty) return false;
    if (mark && word.mark !== mark) return false;
    if (!needle) return true;

    return (
      word.word.toLowerCase().includes(needle) ||
      word.meanings.some((meaning) => meaning.toLowerCase().includes(needle)) ||
      word.category.toLowerCase().includes(needle) ||
      word.tags.some((tag) => tag.toLowerCase().includes(needle))
    );
  });
}

export function collectCategories(words: Word[]): string[] {
  return [...new Set(words.map((word) => word.category).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'zh-CN'),
  );
}
