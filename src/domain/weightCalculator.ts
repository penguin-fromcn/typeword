import {
  DAY_MS,
  EFFECTIVE_WEIGHT_MAX,
  EFFECTIVE_WEIGHT_MIN,
  MAX_INTERVAL_DAYS,
  WORD_WEIGHT_MAX,
  WORD_WEIGHT_MIN,
  WRONG_INTERVAL_DAYS,
} from './constants';
import type {
  EffectiveWeightBreakdown,
  ReviewApplication,
  ReviewOutcome,
  Word,
  WordState,
} from './types';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function calculateRetention(word: Pick<Word, 'lastReviewedAt' | 'stabilityDays'>, now: number): number {
  if (word.lastReviewedAt === null) return 1;
  const stability = Math.max(word.stabilityDays, 0.05);
  const elapsedDays = Math.max(0, now - word.lastReviewedAt) / DAY_MS;
  return Math.exp(-elapsedDays / stability);
}

export function calculateEffectiveWeight(
  word: WordState,
  now: number,
): EffectiveWeightBreakdown {
  const retention = calculateRetention(word, now);
  const forgettingFactor = 1 + (1 - retention);

  const overdueFactor =
    now >= word.nextReviewAt
      ? 1 + Math.min(2, (now - word.nextReviewAt) / DAY_MS / Math.max(word.intervalDays, 0.25))
      : 0.65;

  const newWordFactor = word.repetitions === 0 ? 1.4 : 1.0;
  const raw = word.weight * forgettingFactor * overdueFactor * newWordFactor;

  return {
    retention,
    forgettingFactor,
    overdueFactor,
    newWordFactor,
    effectiveWeight: clamp(raw, EFFECTIVE_WEIGHT_MIN, EFFECTIVE_WEIGHT_MAX),
  };
}

function nextCorrectInterval(
  repetitions: number,
  stabilityDays: number,
  easeFactor: number,
  hinted: boolean,
): number {
  if (hinted) {
    return repetitions === 1 ? 0.5 : Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(stabilityDays)));
  }
  return repetitions === 1
    ? 1
    : Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(stabilityDays * easeFactor)));
}

/**
 * 答题后的纯状态转移：不读取时钟、不触碰数据库、不修改入参。
 */
export function applyReview(
  word: Word,
  result: ReviewOutcome,
  now: number,
): ReviewApplication {
  const weightBefore = word.weight;
  const intervalBefore = word.intervalDays;

  if (result === 'wrong') {
    const weightAfter = clamp(weightBefore * 2.2, WORD_WEIGHT_MIN, WORD_WEIGHT_MAX);
    const nextReviewAt = now + WRONG_INTERVAL_DAYS * DAY_MS;

    return {
      result,
      weightBefore,
      weightAfter,
      intervalBefore,
      intervalAfter: WRONG_INTERVAL_DAYS,
      nextReviewAt,
      word: {
        ...word,
        attemptCount: word.attemptCount + 1,
        wrongCount: word.wrongCount + 1,
        consecutiveCorrect: 0,
        repetitions: 0,
        lastResult: 'wrong',
        easeFactor: Math.max(word.easeFactor - 0.2, 1.3),
        weight: weightAfter,
        stabilityDays: Math.max(0.25, word.stabilityDays * 0.35),
        intervalDays: WRONG_INTERVAL_DAYS,
        lastReviewedAt: now,
        nextReviewAt,
        updatedAt: now,
      },
    };
  }

  const hinted = result === 'correct_with_hint';
  const repetitions = word.repetitions + 1;
  const easeFactor = hinted
    ? Math.max(word.easeFactor - 0.05, 1.3)
    : Math.min(word.easeFactor + 0.05, 2.8);
  const weightAfter = clamp(
    weightBefore * (hinted ? 0.82 : 0.65),
    WORD_WEIGHT_MIN,
    WORD_WEIGHT_MAX,
  );
  const stabilityDays = hinted
    ? Math.max(0.5, word.stabilityDays * 1.4)
    : Math.max(1, word.stabilityDays * 2);
  const intervalDays = nextCorrectInterval(repetitions, stabilityDays, easeFactor, hinted);
  const nextReviewAt = now + intervalDays * DAY_MS;

  return {
    result,
    weightBefore,
    weightAfter,
    intervalBefore,
    intervalAfter: intervalDays,
    nextReviewAt,
    word: {
      ...word,
      attemptCount: word.attemptCount + 1,
      correctCount: word.correctCount + 1,
      hintCount: word.hintCount + (hinted ? 1 : 0),
      consecutiveCorrect: word.consecutiveCorrect + 1,
      repetitions,
      lastResult: result,
      easeFactor,
      weight: weightAfter,
      stabilityDays,
      intervalDays,
      lastReviewedAt: now,
      nextReviewAt,
      updatedAt: now,
    },
  };
}

export function calculateAccuracy(correct: number, attempt: number): number {
  if (attempt <= 0) return 0;
  return Math.round((correct / attempt) * 100);
}
