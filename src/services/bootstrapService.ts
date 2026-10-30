import type { ImportIssue } from '../domain/types';
import { repository } from './repository';
import { loadSeedWords } from './seedService';

export interface BootstrapResult {
  seedWarning: string | null;
  seedIssues: ImportIssue[];
  firstRun: boolean;
}

export async function bootstrapDatabase(now: number = Date.now()): Promise<BootstrapResult> {
  const settings = await repository.getSettings();
  const alreadyImported = settings.seed_imported === 'true';

  if (alreadyImported) {
    return { seedWarning: null, seedIssues: [], firstRun: false };
  }

  try {
    const { words, issues } = await loadSeedWords(now);
    await repository.seedImport(words, now);
    return {
      seedWarning:
        issues.length > 0
          ? `初始词库有 ${issues.length} 条记录未通过校验，已跳过。`
          : null,
      seedIssues: issues,
      firstRun: true,
    };
  } catch (error) {
    return {
      seedWarning:
        error instanceof Error
          ? `${error.message}。可手动添加单词，或检查 public/seed_words.json。`
          : '初始词库导入失败，可手动添加单词。',
      seedIssues: [],
      firstRun: true,
    };
  }
}
