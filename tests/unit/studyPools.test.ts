import { describe, expect, it } from 'vitest';
import {
  mergePoolReview,
  poolFlag,
  stateForPool,
  wordWithPoolState,
} from '../../src/domain/studyPools';
import { applyReview } from '../../src/domain/weightCalculator';
import { makeWord, NOW } from './helpers';

describe('studyPools', () => {
  it('练习池读取顶层状态，听写池读取独立状态', () => {
    const word = makeWord({
      weight: 1.5,
      attemptCount: 4,
      dictationState: {
        ...makeWord().dictationState,
        weight: 6.2,
        attemptCount: 2,
        correctCount: 1,
        nextReviewAt: NOW + 5000,
      },
    });

    expect(stateForPool(word, 'practice').weight).toBe(1.5);
    expect(stateForPool(word, 'practice').attemptCount).toBe(4);
    expect(stateForPool(word, 'dictation').weight).toBe(6.2);
    expect(stateForPool(word, 'dictation').attemptCount).toBe(2);
    expect(stateForPool(word, 'dictation').nextReviewAt).toBe(NOW + 5000);
  });

  it('池的勾选标记彼此独立', () => {
    const word = makeWord({ enabled: false, dictationEnabled: true });
    expect(poolFlag(word, 'practice')).toBe(false);
    expect(poolFlag(word, 'dictation')).toBe(true);
  });

  it('wordWithPoolState 用听写状态覆盖顶层字段但不改原对象', () => {
    const word = makeWord({
      weight: 2.1,
      dictationState: { ...makeWord().dictationState, weight: 4.4 },
    });

    const projected = wordWithPoolState(word, 'dictation');
    expect(projected.weight).toBe(4.4);
    expect(projected.dictationState.weight).toBe(4.4);
    expect(word.weight).toBe(2.1);
    expect(wordWithPoolState(word, 'practice')).toBe(word);
  });

  it('听写答题只写回 dictationState，练习权重与调度保持不变', () => {
    const original = makeWord({
      weight: 2.1,
      attemptCount: 3,
      nextReviewAt: NOW - 1000,
      dictationState: { ...makeWord().dictationState, weight: 2.1 },
    });
    const application = applyReview(wordWithPoolState(original, 'dictation'), 'wrong', NOW);
    const merged = mergePoolReview(original, application.word, 'dictation');

    expect(merged.weight).toBe(2.1);
    expect(merged.attemptCount).toBe(3);
    expect(merged.nextReviewAt).toBe(original.nextReviewAt);
    expect(merged.dictationState.weight).toBeCloseTo(2.1 * 2.2, 6);
    expect(merged.dictationState.attemptCount).toBe(1);
    expect(merged.dictationState.wrongCount).toBe(1);
    expect(merged.dictationState.lastResult).toBe('wrong');
    expect(merged.dictationState.nextReviewAt).toBe(application.nextReviewAt);
    expect(merged.updatedAt).toBe(NOW);
  });

  it('练习答题仍按原逻辑覆盖顶层状态', () => {
    const original = makeWord();
    const application = applyReview(wordWithPoolState(original, 'practice'), 'correct', NOW);
    const merged = mergePoolReview(original, application.word, 'practice');

    expect(merged).toBe(application.word);
    expect(merged.weight).toBe(application.weightAfter);
    expect(merged.attemptCount).toBe(1);
  });
});
