import { z } from 'zod';
import { DEFAULT_CATEGORY, DEFAULT_DIFFICULTY } from './constants';
import { WORD_MARK_VALUES } from './types';
import type { ImportIssue, Word, WordInput, WordState } from './types';

const stringArray = (message: string) =>
  z.preprocess(
    (value) => {
      if (typeof value === 'string') return value.trim() ? [value] : [];
      return value;
    },
    z.array(z.string().trim().min(1, message)).min(1, message),
  );

const optionalStringArray = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return [];
    if (typeof value === 'string') return value.trim() ? [value] : [];
    return value;
  },
  z.array(z.string().trim()).default([]),
);

const difficultySchema = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? DEFAULT_DIFFICULTY : value),
  z.coerce.number().int('难度必须是 1–5 的整数').min(1, '难度必须为 1–5').max(5, '难度必须为 1–5'),
);

export const wordContentSchema = z.object({
  word: z.string().trim().min(1, '英文单词不能为空'),
  meanings: stringArray('至少填写一个中文释义'),
  acceptedAnswers: optionalStringArray.optional().default([]),
  phonetic: z.string().trim().nullable().optional(),
  exampleSentence: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
  category: z.string().trim().default(DEFAULT_CATEGORY),
  tags: optionalStringArray.optional().default([]),
  difficulty: difficultySchema.default(DEFAULT_DIFFICULTY),
});

export type ParsedWordContent = z.infer<typeof wordContentSchema>;

export const seedWordSchema = wordContentSchema;

const optionalStateNumber = z.number().finite().optional();

export const wordStateSchema = z.object({
  weight: optionalStateNumber,
  stabilityDays: optionalStateNumber,
  intervalDays: optionalStateNumber,
  easeFactor: optionalStateNumber,
  repetitions: z.number().int().nonnegative().optional(),
  consecutiveCorrect: z.number().int().nonnegative().optional(),
  attemptCount: z.number().int().nonnegative().optional(),
  correctCount: z.number().int().nonnegative().optional(),
  wrongCount: z.number().int().nonnegative().optional(),
  hintCount: z.number().int().nonnegative().optional(),
  lastReviewedAt: z.number().nullable().optional(),
  lastResult: z.enum(['correct', 'correct_with_hint', 'wrong', 'skipped']).nullable().optional(),
  nextReviewAt: z.number().optional(),
});

export const importWordSchema = wordContentSchema.extend({
  id: z.string().optional(),
  enabled: z.boolean().optional(),
  dictationEnabled: z.boolean().optional(),
  studyEnabled: z.boolean().optional(),
  mark: z.enum(WORD_MARK_VALUES).optional(),
  state: wordStateSchema.optional(),
  dictationState: wordStateSchema.optional(),
  weight: optionalStateNumber,
  stabilityDays: optionalStateNumber,
  intervalDays: optionalStateNumber,
  easeFactor: optionalStateNumber,
  repetitions: z.number().int().nonnegative().optional(),
  consecutiveCorrect: z.number().int().nonnegative().optional(),
  attemptCount: z.number().int().nonnegative().optional(),
  correctCount: z.number().int().nonnegative().optional(),
  wrongCount: z.number().int().nonnegative().optional(),
  hintCount: z.number().int().nonnegative().optional(),
  lastReviewedAt: z.number().nullable().optional(),
  lastResult: z.enum(['correct', 'correct_with_hint', 'wrong', 'skipped']).nullable().optional(),
  nextReviewAt: z.number().optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
});

export type ParsedImportWord = z.infer<typeof importWordSchema>;

export const wordFormSchema = z.object({
  word: z.string().trim().min(1, '请输入英文单词'),
  meaningsText: z
    .string()
    .refine((value) => splitAnswerLines(value).length > 0, '至少填写一个中文释义'),
  acceptedAnswersText: z.string().default(''),
  phonetic: z.string().default(''),
  exampleSentence: z.string().default(''),
  notes: z.string().default(''),
  category: z.string().trim().default(DEFAULT_CATEGORY),
  groupId: z.string().default(''),
  tagsText: z.string().default(''),
  difficulty: z.coerce.number().int('难度必须是 1–5 的整数').min(1, '难度必须为 1–5').max(5, '难度必须为 1–5'),
});

export type WordFormValues = z.infer<typeof wordFormSchema>;

export function splitAnswerLines(value: string): string[] {
  return value
    .split(/[\n；;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function splitTagText(value: string): string[] {
  return value
    .split(/[,，、\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formValuesToWordInput(values: WordFormValues): WordInput {
  return {
    word: values.word,
    meanings: splitAnswerLines(values.meaningsText),
    acceptedAnswers: splitAnswerLines(values.acceptedAnswersText),
    phonetic: values.phonetic || null,
    exampleSentence: values.exampleSentence || null,
    notes: values.notes || null,
    category: values.category,
    groupId: values.groupId || null,
    tags: splitTagText(values.tagsText),
    difficulty: values.difficulty,
  };
}

export interface ParsedImport {
  records: ParsedImportWord[];
  issues: ImportIssue[];
  hasProgressState: boolean;
}

export function parseImportJson(raw: unknown): ParsedImport {
  const records: ParsedImportWord[] = [];
  const issues: ImportIssue[] = [];
  let list: unknown;

  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === 'object' && Array.isArray((raw as { words?: unknown }).words)) {
    list = (raw as { words: unknown[] }).words;
  } else {
    return {
      records: [],
      issues: [{ index: -1, word: '', message: '文件必须是单词数组，或包含 words 数组的对象' }],
      hasProgressState: false,
    };
  }

  (list as unknown[]).forEach((item, index) => {
    const parsed = importWordSchema.safeParse(item);
    if (!parsed.success) {
      const rawWord =
        item && typeof item === 'object' && 'word' in item
          ? String((item as { word: unknown }).word ?? '')
          : '';
      issues.push({
        index,
        word: rawWord,
        message: parsed.error.issues.map((issue) => issue.message).join('；'),
      });
      return;
    }
    records.push(parsed.data);
  });

  const hasProgressState = records.some(
    (record) =>
      record.weight !== undefined ||
      record.state?.weight !== undefined ||
      record.dictationState !== undefined ||
      record.nextReviewAt !== undefined,
  );

  return { records, issues, hasProgressState };
}

export function parseSeedJson(raw: unknown): { records: ParsedWordContent[]; issues: ImportIssue[] } {
  if (!Array.isArray(raw)) {
    return {
      records: [],
      issues: [{ index: -1, word: '', message: 'seed_words.json 根节点必须是数组' }],
    };
  }

  const records: ParsedWordContent[] = [];
  const issues: ImportIssue[] = [];

  raw.forEach((item, index) => {
    const parsed = seedWordSchema.safeParse(item);
    if (!parsed.success) {
      issues.push({
        index,
        word: item && typeof item === 'object' ? String((item as { word?: unknown }).word ?? '') : '',
        message: parsed.error.issues.map((issue) => issue.message).join('；'),
      });
      return;
    }
    records.push(parsed.data);
  });

  return { records, issues };
}

export function extractState(record: ParsedImportWord): Partial<WordState> | null {
  const source = record.state ?? record;
  const hasAny =
    source.weight !== undefined ||
    source.stabilityDays !== undefined ||
    source.nextReviewAt !== undefined;

  if (!hasAny) return null;

  const state: Partial<WordState> = {};
  if (source.weight !== undefined) state.weight = source.weight;
  if (source.stabilityDays !== undefined) state.stabilityDays = source.stabilityDays;
  if (source.intervalDays !== undefined) state.intervalDays = source.intervalDays;
  if (source.easeFactor !== undefined) state.easeFactor = source.easeFactor;
  if (source.repetitions !== undefined) state.repetitions = source.repetitions;
  if (source.consecutiveCorrect !== undefined) state.consecutiveCorrect = source.consecutiveCorrect;
  if (source.attemptCount !== undefined) state.attemptCount = source.attemptCount;
  if (source.correctCount !== undefined) state.correctCount = source.correctCount;
  if (source.wrongCount !== undefined) state.wrongCount = source.wrongCount;
  if (source.hintCount !== undefined) state.hintCount = source.hintCount;
  if (source.lastReviewedAt !== undefined) state.lastReviewedAt = source.lastReviewedAt;
  if (source.lastResult !== undefined) state.lastResult = source.lastResult;
  if (source.nextReviewAt !== undefined) state.nextReviewAt = source.nextReviewAt;
  return state;
}

export function stateFromWord(word: Word): Partial<WordState> {
  return {
    weight: word.weight,
    stabilityDays: word.stabilityDays,
    intervalDays: word.intervalDays,
    easeFactor: word.easeFactor,
    repetitions: word.repetitions,
    consecutiveCorrect: word.consecutiveCorrect,
    attemptCount: word.attemptCount,
    correctCount: word.correctCount,
    wrongCount: word.wrongCount,
    hintCount: word.hintCount,
    lastReviewedAt: word.lastReviewedAt,
    lastResult: word.lastResult,
    nextReviewAt: word.nextReviewAt,
  };
}
