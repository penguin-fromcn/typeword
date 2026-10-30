import { extractState, parseImportJson } from '../domain/schemas';
import type { ImportIssue, ImportResult, ReviewLogResult, Word, WordState } from '../domain/types';
import { createId, createInitialWord, normalizeWordState } from '../domain/wordFactory';
import { normalizeWord } from '../domain/wordNormalizer';
import { readJsonFile } from './fileService';
import { repository } from './repository';

export interface PreparedImport {
  words: Word[];
  issues: ImportIssue[];
  replaceState: boolean;
}

const finite = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const nonNegativeInt = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;

const VALID_RESULTS: ReviewLogResult[] = ['correct', 'correct_with_hint', 'wrong', 'skipped'];

function applyImportedState(word: Word, state: Partial<WordState>, now: number): Word {
  const next: Word = {
    ...word,
    weight: Math.min(Math.max(finite(state.weight, word.weight), 0.25), 8),
    stabilityDays: Math.max(finite(state.stabilityDays, word.stabilityDays), 0.05),
    intervalDays: Math.max(finite(state.intervalDays, word.intervalDays), 0),
    easeFactor: Math.min(Math.max(finite(state.easeFactor, word.easeFactor), 1.3), 2.8),
    repetitions: nonNegativeInt(state.repetitions ?? word.repetitions),
    consecutiveCorrect: nonNegativeInt(state.consecutiveCorrect ?? word.consecutiveCorrect),
    attemptCount: nonNegativeInt(state.attemptCount ?? word.attemptCount),
    correctCount: nonNegativeInt(state.correctCount ?? word.correctCount),
    wrongCount: nonNegativeInt(state.wrongCount ?? word.wrongCount),
    hintCount: nonNegativeInt(state.hintCount ?? word.hintCount),
    lastReviewedAt:
      state.lastReviewedAt === null
        ? null
        : typeof state.lastReviewedAt === 'number'
          ? state.lastReviewedAt
          : word.lastReviewedAt,
    lastResult:
      state.lastResult && VALID_RESULTS.includes(state.lastResult) ? state.lastResult : word.lastResult,
    nextReviewAt: finite(state.nextReviewAt, now),
  };
  return next;
}

export function prepareImport(raw: unknown, now: number): PreparedImport {
  const { records, issues, hasProgressState } = parseImportJson(raw);
  const words: Word[] = [];
  const seen = new Set<string>();

  records.forEach((record, index) => {
    const normalized = normalizeWord(record.word);
    if (seen.has(normalized)) {
      issues.push({ index, word: record.word, message: '导入文件内存在重复单词，已跳过' });
      return;
    }
    seen.add(normalized);

    const base = createInitialWord(
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
      record.id && record.id.trim() ? record.id : createId('w_'),
    );

    if (record.createdAt) base.createdAt = record.createdAt;
    if (record.updatedAt) base.updatedAt = record.updatedAt;
    if (record.enabled === false) base.enabled = false;
    if (record.dictationEnabled === false) base.dictationEnabled = false;
    else if (record.dictationEnabled === undefined && record.enabled === false) {
      base.dictationEnabled = false;
    }
    if (record.studyEnabled === false) base.studyEnabled = false;
    if (record.mark) base.mark = record.mark;

    if (record.dictationState) {
      base.dictationState = normalizeWordState(record.dictationState, now);
    }

    const state = extractState(record);
    words.push(state ? applyImportedState(base, state, now) : base);
  });

  return { words, issues, replaceState: hasProgressState };
}

export async function readImportFile(file: File, now: number): Promise<PreparedImport> {
  const raw = await readJsonFile(file);
  return prepareImport(raw, now);
}

export async function persistPreparedImport(prepared: PreparedImport): Promise<ImportResult> {
  if (prepared.words.length === 0) {
    return { inserted: 0, updated: 0, skipped: 0, issues: prepared.issues };
  }

  const outcome = await repository.importWords(prepared.words, prepared.replaceState);
  return {
    ...outcome,
    issues: [...prepared.issues, ...outcome.issues],
  };
}

export function buildExportPayload(words: Word[], exportedAt: number): string {
  const payload = words.map((word) => ({
    id: word.id,
    word: word.word,
    meanings: word.meanings,
    acceptedAnswers: word.acceptedAnswers,
    phonetic: word.phonetic,
    exampleSentence: word.exampleSentence,
    notes: word.notes,
    category: word.category,
    tags: word.tags,
    difficulty: word.difficulty,
    enabled: word.enabled,
    dictationEnabled: word.dictationEnabled,
    studyEnabled: word.studyEnabled,
    mark: word.mark,
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
    dictationState: word.dictationState,
    createdAt: word.createdAt,
    updatedAt: word.updatedAt,
  }));

  return `${JSON.stringify(
    {
      app: 'TypeWord',
      version: 1,
      exportedAt,
      words: payload,
    },
    null,
    2,
  )}\n`;
}

export async function exportWordsToFile(words: Word[], now: number): Promise<string | null> {
  const stamp = new Date(now);
  const pad = (value: number) => String(value).padStart(2, '0');
  const name = `typeword-${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}.json`;
  return repository.saveJsonFile(name, buildExportPayload(words, now));
}

export function formatImportSummary(result: ImportResult): string {
  const parts = [
    result.inserted > 0 ? `新增 ${result.inserted}` : '',
    result.updated > 0 ? `更新 ${result.updated}` : '',
    result.skipped > 0 ? `跳过 ${result.skipped}` : '',
    result.issues.length > 0 ? `无效 ${result.issues.length}` : '',
  ].filter(Boolean);

  return parts.length > 0 ? `导入完成：${parts.join('，')}` : '没有可导入的词条';
}
