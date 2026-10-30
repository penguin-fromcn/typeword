import {
  DEFAULT_CATEGORY,
  DEFAULT_DIFFICULTY,
  INITIAL_EASE_FACTOR,
  INITIAL_INTERVAL_DAYS,
  INITIAL_STABILITY_DAYS,
  INITIAL_WEIGHT,
} from './constants';
import type { Word, WordInput, WordState } from './types';
import { normalizeWord } from './wordNormalizer';

let fallbackCounter = 0;

export function createInitialState(now: number): WordState {
  return {
    weight: INITIAL_WEIGHT,
    stabilityDays: INITIAL_STABILITY_DAYS,
    intervalDays: INITIAL_INTERVAL_DAYS,
    easeFactor: INITIAL_EASE_FACTOR,
    repetitions: 0,
    consecutiveCorrect: 0,
    attemptCount: 0,
    correctCount: 0,
    wrongCount: 0,
    hintCount: 0,
    lastReviewedAt: null,
    lastResult: null,
    nextReviewAt: now,
  };
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nonNegativeInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : fallback;
}

const REVIEW_RESULTS = new Set(['correct', 'correct_with_hint', 'wrong', 'skipped']);

/** 读取旧数据或外部文件时补齐缺失的听写状态。 */
export function normalizeWordState(
  state: Partial<WordState> | null | undefined,
  fallbackAt: number,
): WordState {
  const base = createInitialState(fallbackAt);
  if (!state || typeof state !== 'object') return base;

  const lastResult =
    typeof state.lastResult === 'string' && REVIEW_RESULTS.has(state.lastResult)
      ? (state.lastResult as WordState['lastResult'])
      : state.lastResult === null
        ? null
        : base.lastResult;

  return {
    weight: Math.min(Math.max(finite(state.weight, base.weight), 0.25), 8),
    stabilityDays: Math.max(finite(state.stabilityDays, base.stabilityDays), 0.05),
    intervalDays: Math.max(finite(state.intervalDays, base.intervalDays), 0),
    easeFactor: Math.min(Math.max(finite(state.easeFactor, base.easeFactor), 1.3), 2.8),
    repetitions: nonNegativeInt(state.repetitions, base.repetitions),
    consecutiveCorrect: nonNegativeInt(state.consecutiveCorrect, base.consecutiveCorrect),
    attemptCount: nonNegativeInt(state.attemptCount, base.attemptCount),
    correctCount: nonNegativeInt(state.correctCount, base.correctCount),
    wrongCount: nonNegativeInt(state.wrongCount, base.wrongCount),
    hintCount: nonNegativeInt(state.hintCount, base.hintCount),
    lastReviewedAt:
      state.lastReviewedAt === null
        ? null
        : finite(state.lastReviewedAt, base.nextReviewAt),
    lastResult,
    nextReviewAt: finite(state.nextReviewAt, base.nextReviewAt),
  };
}

export function createId(prefix = ''): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `${prefix}${cryptoApi.randomUUID()}`;
  }
  fallbackCounter += 1;
  return `${prefix}${Date.now().toString(36)}-${fallbackCounter.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function createInitialWord(
  input: WordInput,
  now: number,
  id: string = createId('w_'),
): Word {
  const displayWord = input.word.replace(/\s+/g, ' ').trim();
  return {
    id,
    word: displayWord,
    normalizedWord: normalizeWord(displayWord),
    meanings: input.meanings.map((meaning) => meaning.trim()).filter(Boolean),
    acceptedAnswers: (input.acceptedAnswers ?? [])
      .map((answer) => answer.replace(/\s+/g, ' ').trim())
      .filter(Boolean),
    phonetic: input.phonetic?.trim() || null,
    exampleSentence: input.exampleSentence?.trim() || null,
    notes: input.notes?.trim() || null,
    category: input.category?.trim() || DEFAULT_CATEGORY,
    tags: (input.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
    difficulty: input.difficulty ?? DEFAULT_DIFFICULTY,
    ...createInitialState(now),
    enabled: true,
    dictationEnabled: true,
    dictationState: createInitialState(now),
    studyEnabled: true,
    groupId: input.groupId ?? null,
    mark: 'none',
    createdAt: now,
    updatedAt: now,
  };
}

export function applyWordInput(word: Word, input: WordInput, now: number): Word {
  const displayWord = input.word.replace(/\s+/g, ' ').trim();
  return {
    ...word,
    word: displayWord,
    normalizedWord: normalizeWord(displayWord),
    meanings: input.meanings.map((meaning) => meaning.trim()).filter(Boolean),
    acceptedAnswers: (input.acceptedAnswers ?? [])
      .map((answer) => answer.replace(/\s+/g, ' ').trim())
      .filter(Boolean),
    phonetic: input.phonetic?.trim() || null,
    exampleSentence: input.exampleSentence?.trim() || null,
    notes: input.notes?.trim() || null,
    category: input.category?.trim() || DEFAULT_CATEGORY,
    tags: (input.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
    difficulty: input.difficulty ?? DEFAULT_DIFFICULTY,
    groupId: input.groupId === undefined ? word.groupId : input.groupId,
    updatedAt: now,
  };
}
