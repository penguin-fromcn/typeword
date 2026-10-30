import type { StudyPool, Word, WordState } from './types';

export function stateForPool(word: Word, pool: StudyPool): WordState {
  return pool === 'dictation' ? word.dictationState : word;
}

export function poolFlag(word: Word, pool: StudyPool): boolean {
  return pool === 'dictation' ? word.dictationEnabled : word.enabled;
}

export function wordWithPoolState(word: Word, pool: StudyPool): Word {
  if (pool === 'practice') return word;
  return { ...word, ...word.dictationState };
}

function stateFromWord(word: Word): WordState {
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

export function mergePoolReview(
  original: Word,
  reviewed: Word,
  pool: StudyPool,
): Word {
  if (pool === 'practice') return reviewed;
  return {
    ...original,
    dictationState: stateFromWord(reviewed),
    updatedAt: reviewed.updatedAt,
  };
}
