import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  EFFECTIVE_WEIGHT_MAX,
  EFFECTIVE_WEIGHT_MIN,
  MAX_INTERVAL_DAYS,
  WRONG_INTERVAL_DAYS,
} from '../../src/domain/constants';
import {
  applyReview,
  calculateAccuracy,
  calculateEffectiveWeight,
  calculateRetention,
  clamp,
} from '../../src/domain/weightCalculator';
import { createInitialWord } from '../../src/domain/wordFactory';
import { days, makeWord, NOW } from './helpers';

describe('初始状态', () => {
  it('新词拥有题目规定的默认状态', () => {
    const word = createInitialWord(
      { word: 'reflect', meanings: ['反射'], acceptedAnswers: [] },
      NOW,
      'w1',
    );
    expect(word.weight).toBe(3);
    expect(word.stabilityDays).toBe(0.25);
    expect(word.intervalDays).toBe(0);
    expect(word.easeFactor).toBe(2.5);
    expect(word.repetitions).toBe(0);
    expect(word.consecutiveCorrect).toBe(0);
    expect(word.attemptCount).toBe(0);
    expect(word.lastReviewedAt).toBeNull();
    expect(word.nextReviewAt).toBe(NOW);
    expect(word.normalizedWord).toBe('reflect');
  });
});

describe('applyReview - 无提示答对', () => {
  it('第一次答对遵循规定数值', () => {
    const application = applyReview(makeWord(), 'correct', NOW);
    const next = application.word;

    expect(next.weight).toBeCloseTo(1.95, 5);
    expect(next.stabilityDays).toBe(1);
    expect(next.intervalDays).toBe(1);
    expect(next.easeFactor).toBeCloseTo(2.55, 5);
    expect(next.repetitions).toBe(1);
    expect(next.consecutiveCorrect).toBe(1);
    expect(next.attemptCount).toBe(1);
    expect(next.correctCount).toBe(1);
    expect(next.wrongCount).toBe(0);
    expect(next.hintCount).toBe(0);
    expect(next.lastResult).toBe('correct');
    expect(next.nextReviewAt).toBe(NOW + DAY_MS);
    expect(next.lastReviewedAt).toBe(NOW);
  });

  it('第二次答对把间隔拉长到约 5 天', () => {
    const first = applyReview(makeWord(), 'correct', NOW).word;
    const second = applyReview(first, 'correct', NOW + DAY_MS).word;

    expect(second.weight).toBeCloseTo(1.2675, 5);
    expect(second.stabilityDays).toBe(2);
    expect(second.intervalDays).toBe(5);
    expect(second.easeFactor).toBeCloseTo(2.6, 5);
    expect(second.repetitions).toBe(2);
    expect(second.consecutiveCorrect).toBe(2);
    expect(second.nextReviewAt).toBe(NOW + DAY_MS + 5 * DAY_MS);
  });

  it('间隔不会超过 60 天', () => {
    const word = makeWord({ stabilityDays: 100, easeFactor: 2.8, repetitions: 5 });
    const next = applyReview(word, 'correct', NOW).word;
    expect(next.intervalDays).toBe(MAX_INTERVAL_DAYS);
    expect(next.nextReviewAt).toBe(NOW + MAX_INTERVAL_DAYS * DAY_MS);
  });

  it('easeFactor 最高 2.8', () => {
    const word = makeWord({ easeFactor: 2.79 });
    expect(applyReview(word, 'correct', NOW).word.easeFactor).toBe(2.8);
  });

  it('权重最低不会低于 0.25', () => {
    const word = makeWord({ weight: 0.3 });
    expect(applyReview(word, 'correct', NOW).word.weight).toBe(0.25);
  });
});

describe('applyReview - 使用提示后答对', () => {
  it('权重下降幅度小于无提示答对', () => {
    const plain = applyReview(makeWord({ weight: 2 }), 'correct', NOW);
    const hinted = applyReview(makeWord({ weight: 2 }), 'correct_with_hint', NOW);

    expect(hinted.weightAfter).toBeCloseTo(1.64, 5);
    expect(plain.weightAfter).toBeCloseTo(1.3, 5);
    expect(hinted.weightAfter).toBeGreaterThan(plain.weightAfter);
  });

  it('稳定度增长更慢，并且 hintCount 增加', () => {
    const word = makeWord({ weight: 2, stabilityDays: 1, repetitions: 1, easeFactor: 2.5 });
    const hinted = applyReview(word, 'correct_with_hint', NOW).word;

    expect(hinted.stabilityDays).toBe(1.4);
    expect(hinted.intervalDays).toBe(1);
    expect(hinted.easeFactor).toBeCloseTo(2.45, 5);
    expect(hinted.hintCount).toBe(1);
    expect(hinted.lastResult).toBe('correct_with_hint');
    expect(hinted.nextReviewAt).toBe(NOW + DAY_MS);
  });

  it('第一次使用提示答对间隔为 0.5 天', () => {
    const hinted = applyReview(makeWord(), 'correct_with_hint', NOW).word;
    expect(hinted.intervalDays).toBe(0.5);
    expect(hinted.nextReviewAt).toBe(NOW + 0.5 * DAY_MS);
    expect(hinted.stabilityDays).toBe(0.5);
  });

  it('easeFactor 最低 1.3 且权重最低 0.25', () => {
    const word = makeWord({ weight: 0.3, easeFactor: 1.3 });
    const next = applyReview(word, 'correct_with_hint', NOW).word;
    expect(next.easeFactor).toBe(1.3);
    expect(next.weight).toBe(0.25);
  });
});

describe('applyReview - 答错', () => {
  it('权重上升、稳定度下降、10 分钟后复习', () => {
    const word = makeWord({
      weight: 1.3,
      stabilityDays: 7,
      intervalDays: 4,
      easeFactor: 2.5,
      repetitions: 3,
      consecutiveCorrect: 4,
      attemptCount: 5,
      correctCount: 5,
    });
    const application = applyReview(word, 'wrong', NOW);
    const next = application.word;

    expect(application.weightAfter).toBeCloseTo(2.86, 5);
    expect(next.weight).toBeCloseTo(2.86, 5);
    expect(next.stabilityDays).toBeCloseTo(2.45, 5);
    expect(next.intervalDays).toBeCloseTo(WRONG_INTERVAL_DAYS, 8);
    expect(next.easeFactor).toBeCloseTo(2.3, 5);
    expect(next.repetitions).toBe(0);
    expect(next.consecutiveCorrect).toBe(0);
    expect(next.attemptCount).toBe(6);
    expect(next.wrongCount).toBe(1);
    expect(next.correctCount).toBe(5);
    expect(next.lastResult).toBe('wrong');
    expect(next.nextReviewAt).toBe(NOW + 10 * 60 * 1000);
  });

  it('权重最高不超过 8', () => {
    const word = makeWord({ weight: 7.9, stabilityDays: 10 });
    const next = applyReview(word, 'wrong', NOW).word;
    expect(next.weight).toBe(8);
  });

  it('稳定度最低保持 0.25', () => {
    const word = makeWord({ stabilityDays: 0.4 });
    expect(applyReview(word, 'wrong', NOW).word.stabilityDays).toBe(0.25);
  });

  it('easeFactor 最低 1.3', () => {
    const word = makeWord({ easeFactor: 1.35 });
    expect(applyReview(word, 'wrong', NOW).word.easeFactor).toBe(1.3);
  });
});

describe('applyReview - 纯函数约束', () => {
  it('不修改传入的单词对象', () => {
    const word = makeWord();
    const snapshot = JSON.stringify(word);
    applyReview(word, 'wrong', NOW);
    expect(JSON.stringify(word)).toBe(snapshot);
  });

  it('记录答题前后的权重与间隔', () => {
    const word = makeWord({ weight: 2, intervalDays: 3 });
    const application = applyReview(word, 'correct', NOW);
    expect(application.weightBefore).toBe(2);
    expect(application.weightAfter).toBe(1.3);
    expect(application.intervalBefore).toBe(3);
    expect(application.intervalAfter).toBe(1);
  });
});

describe('calculateRetention / calculateEffectiveWeight', () => {
  it('从未复习的新词保持率为 1', () => {
    expect(calculateRetention(makeWord(), NOW)).toBe(1);
  });

  it('保持率按指数衰减', () => {
    const word = makeWord({
      stabilityDays: 2,
      lastReviewedAt: NOW - days(2),
      nextReviewAt: NOW,
      repetitions: 2,
    });
    expect(calculateRetention(word, NOW)).toBeCloseTo(Math.exp(-1), 6);
  });

  it('新词有效权重含 1.4 加成并受上下限约束', () => {
    const word = makeWord({ nextReviewAt: NOW });
    const breakdown = calculateEffectiveWeight(word, NOW);
    expect(breakdown.retention).toBe(1);
    expect(breakdown.forgettingFactor).toBe(1);
    expect(breakdown.overdueFactor).toBe(1);
    expect(breakdown.newWordFactor).toBe(1.4);
    expect(breakdown.effectiveWeight).toBeCloseTo(4.2, 5);
  });

  it('未到期单词使用 0.65 的衰减系数', () => {
    const word = makeWord({
      weight: 3,
      stabilityDays: 10,
      lastReviewedAt: NOW,
      nextReviewAt: NOW + days(3),
      repetitions: 2,
    });
    const breakdown = calculateEffectiveWeight(word, NOW);
    expect(breakdown.overdueFactor).toBe(0.65);
    expect(breakdown.newWordFactor).toBe(1);
    expect(breakdown.effectiveWeight).toBeCloseTo(1.95, 5);
  });

  it('逾期越久有效权重越高', () => {
    const base = makeWord({
      weight: 3,
      stabilityDays: 4,
      intervalDays: 4,
      lastReviewedAt: NOW - days(4),
      nextReviewAt: NOW - days(1),
      repetitions: 2,
    });
    const later = { ...base, nextReviewAt: NOW - days(3) };

    expect(calculateEffectiveWeight(later, NOW).overdueFactor).toBeGreaterThan(
      calculateEffectiveWeight(base, NOW).overdueFactor,
    );
    expect(calculateEffectiveWeight(later, NOW).effectiveWeight).toBeGreaterThan(
      calculateEffectiveWeight(base, NOW).effectiveWeight,
    );
  });

  it('到期且高权重时会被上限截断到 20', () => {
    const word = makeWord({
      weight: 8,
      stabilityDays: 0.1,
      lastReviewedAt: NOW - days(100),
      nextReviewAt: NOW - days(100),
      intervalDays: 0.25,
      repetitions: 3,
    });
    const breakdown = calculateEffectiveWeight(word, NOW);
    expect(breakdown.effectiveWeight).toBe(EFFECTIVE_WEIGHT_MAX);
    expect(breakdown.effectiveWeight).toBeLessThanOrEqual(EFFECTIVE_WEIGHT_MAX);
  });

  it('有效权重不会低于 0.1', () => {
    const word = makeWord({
      weight: 0.25,
      stabilityDays: 100,
      lastReviewedAt: NOW,
      nextReviewAt: NOW + days(30),
      intervalDays: 30,
      repetitions: 4,
    });
    const breakdown = calculateEffectiveWeight(word, NOW);
    expect(breakdown.effectiveWeight).toBeGreaterThanOrEqual(EFFECTIVE_WEIGHT_MIN);
  });

  it('答错后下一次复习时间缩短', () => {
    const word = makeWord({ nextReviewAt: NOW + days(7), intervalDays: 7 });
    const next = applyReview(word, 'wrong', NOW).word;
    expect(next.nextReviewAt).toBeLessThan(word.nextReviewAt);
    expect(next.nextReviewAt - NOW).toBe(10 * 60 * 1000);
  });

  it('连续答对后下一次复习时间延长', () => {
    const word = makeWord({ intervalDays: 1, nextReviewAt: NOW + days(1), repetitions: 1 });
    const next = applyReview(word, 'correct', NOW).word;
    expect(next.nextReviewAt).toBeGreaterThan(word.nextReviewAt);
  });
});

describe('工具函数', () => {
  it('clamp 限制范围', () => {
    expect(clamp(-1, 0.1, 20)).toBe(0.1);
    expect(clamp(25, 0.1, 20)).toBe(20);
    expect(clamp(3, 0.1, 20)).toBe(3);
  });

  it('calculateAccuracy 四舍五入并防止除零', () => {
    expect(calculateAccuracy(2, 3)).toBe(67);
    expect(calculateAccuracy(0, 0)).toBe(0);
  });
});
