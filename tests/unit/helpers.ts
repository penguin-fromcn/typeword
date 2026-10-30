import {
  DAY_MS,
  INITIAL_EASE_FACTOR,
  INITIAL_STABILITY_DAYS,
  INITIAL_WEIGHT,
} from '../../src/domain/constants';
import type { ReviewLog, ReviewLogResult, Word } from '../../src/domain/types';

export const NOW = Date.UTC(2026, 9, 28, 9, 30, 0);

export function makeWord(overrides: Partial<Word> = {}): Word {
  return {
    id: 'w_test',
    word: 'reflect',
    normalizedWord: 'reflect',
    meanings: ['反射'],
    acceptedAnswers: [],
    phonetic: null,
    exampleSentence: null,
    notes: null,
    category: '核心词汇',
    tags: [],
    difficulty: 2,
    enabled: true,
    dictationEnabled: true,
    dictationState: {
      weight: INITIAL_WEIGHT,
      stabilityDays: INITIAL_STABILITY_DAYS,
      intervalDays: 0,
      easeFactor: INITIAL_EASE_FACTOR,
      repetitions: 0,
      consecutiveCorrect: 0,
      attemptCount: 0,
      correctCount: 0,
      wrongCount: 0,
      hintCount: 0,
      lastReviewedAt: null,
      lastResult: null,
      nextReviewAt: NOW,
    },
    studyEnabled: true,
    groupId: null,
    mark: 'none',
    weight: INITIAL_WEIGHT,
    stabilityDays: INITIAL_STABILITY_DAYS,
    intervalDays: 0,
    easeFactor: INITIAL_EASE_FACTOR,
    repetitions: 0,
    consecutiveCorrect: 0,
    attemptCount: 0,
    correctCount: 0,
    wrongCount: 0,
    hintCount: 0,
    lastReviewedAt: null,
    lastResult: null,
    nextReviewAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function makeLog(
  wordId: string,
  result: ReviewLogResult,
  reviewedAt: number,
  overrides: Partial<ReviewLog> = {},
): ReviewLog {
  return {
    id: `log_${wordId}_${reviewedAt}_${result}`,
    wordId,
    result,
    hintUsed: result === 'correct_with_hint',
    answerText: 'answer',
    expectedAnswer: 'reflect',
    weightBefore: 3,
    weightAfter: result === 'wrong' ? 6.6 : 1.95,
    intervalBefore: 0,
    intervalAfter: result === 'wrong' ? 10 / (24 * 60) : 1,
    reviewedAt,
    ...overrides,
  };
}

export function days(value: number): number {
  return value * DAY_MS;
}
