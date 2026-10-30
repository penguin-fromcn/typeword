import { parseSeedJson } from '../domain/schemas';
import type { ImportIssue, Word } from '../domain/types';
import { createInitialWord } from '../domain/wordFactory';

export interface SeedLoadResult {
  words: Word[];
  issues: ImportIssue[];
}

export async function loadSeedWords(now: number): Promise<SeedLoadResult> {
  const base = import.meta.env.BASE_URL ?? '/';
  const response = await fetch(`${base}seed_words.json`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`无法读取初始词库（HTTP ${response.status}）`);
  }

  const raw = await response.json();
  const { records, issues } = parseSeedJson(raw);
  if (records.length === 0) {
    const detail = issues[0]?.message ? `：${issues[0].message}` : '';
    throw new Error(`初始词库没有有效词条${detail}`);
  }

  return {
    words: records.map((record) =>
      createInitialWord(
        {
          word: record.word,
          meanings: record.meanings,
          acceptedAnswers: record.acceptedAnswers,
          phonetic: record.phonetic,
          exampleSentence: record.exampleSentence,
          notes: record.notes,
          category: record.category,
          tags: record.tags,
          difficulty: record.difficulty,
        },
        now,
      ),
    ),
    issues,
  };
}
