import { describe, expect, it } from 'vitest';
import {
  computeCurrentStreak,
  computeDueForecast,
  computeLast7Days,
  computeMostWrong,
  computeRetentionCurve,
  computeStatistics,
  computeStudyStreakDays,
  computeTodayStats,
  dayKey,
  startOfDay,
} from '../../src/domain/statistics';
import { days, makeLog, makeWord, NOW } from './helpers';

const words = [
  makeWord({
    id: 'w1',
    word: 'reflect',
    normalizedWord: 'reflect',
    repetitions: 3,
    nextReviewAt: NOW - 1,
    wrongCount: 1,
  }),
  makeWord({
    id: 'w2',
    word: 'computer',
    normalizedWord: 'computer',
    repetitions: 2,
    nextReviewAt: NOW + days(2),
  }),
  makeWord({
    id: 'w3',
    word: 'alpha',
    normalizedWord: 'alpha',
    repetitions: 0,
    nextReviewAt: NOW + days(1),
    wrongCount: 1,
  }),
];

const logs = [
  makeLog('w1', 'correct', NOW - 60 * 60 * 1000),
  makeLog('w1', 'wrong', NOW - 2 * 60 * 60 * 1000),
  makeLog('w2', 'correct_with_hint', NOW - 3 * 60 * 60 * 1000),
  makeLog('w2', 'skipped', NOW - 4 * 60 * 60 * 1000),
  makeLog('w3', 'wrong', NOW - days(1)),
];

describe('日期工具', () => {
  it('dayKey 使用本地日期', () => {
    expect(dayKey(NOW)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dayKey(startOfDay(NOW))).toBe(dayKey(NOW));
  });
});

describe('computeStatistics', () => {
  it('总词数保留全库，到期数量只统计可练习词条', () => {
    const selectable = words.filter((word) => word.id !== 'w1');
    const stats = computeStatistics(words, logs, NOW, 20, selectable);

    expect(stats.totalWords).toBe(3);
    expect(stats.dueCount).toBe(0);
    expect(stats.today.dueCount).toBe(0);
  });
});

describe('computeTodayStats', () => {
  const stats = computeTodayStats(logs, words, NOW, 20);

  it('只统计今天且不包含跳过', () => {
    expect(stats.attempts).toBe(3);
    expect(stats.correct).toBe(2);
    expect(stats.wrong).toBe(1);
    expect(stats.accuracy).toBe(67);
    expect(stats.distinctWords).toBe(2);
  });

  it('统计到期单词数量', () => {
    expect(stats.dueCount).toBe(1);
    expect(stats.goal).toBe(20);
  });

  it('连续答对遇到错误即停止', () => {
    expect(stats.streak).toBe(1);
  });
});

describe('computeCurrentStreak', () => {
  it('按时间倒序累计正确的连续答题，并在答错时清零', () => {
    expect(computeCurrentStreak(logs)).toBe(1);
  });

  it('忽略跳过记录', () => {
    const onlySkips = [makeLog('w1', 'skipped', NOW), makeLog('w1', 'correct', NOW - 1000)];
    expect(computeCurrentStreak(onlySkips)).toBe(1);
  });

  it('没有记录返回 0', () => {
    expect(computeCurrentStreak([])).toBe(0);
  });
});

describe('computeLast7Days', () => {
  it('返回 7 个桶，最后一个是今天', () => {
    const buckets = computeLast7Days(logs, NOW);
    expect(buckets).toHaveLength(7);
    expect(buckets[6].dayKey).toBe(dayKey(NOW));
    expect(buckets[6].attempts).toBe(3);
    expect(buckets[6].correct).toBe(2);
    expect(buckets[6].wrong).toBe(1);
    expect(buckets[5].attempts).toBe(1);
    expect(buckets[0].attempts).toBe(0);
  });
});

describe('computeStudyStreakDays', () => {
  it('今天和昨天都有练习时返回 2', () => {
    expect(computeStudyStreakDays(logs, NOW)).toBe(2);
  });

  it('今天没有练习但昨天有时仍保留连续天数', () => {
    const yesterdayOnly = [makeLog('w1', 'correct', NOW - days(1))];
    expect(computeStudyStreakDays(yesterdayOnly, NOW)).toBe(1);
  });

  it('中断一天后只计算最近连续天数', () => {
    const gaps = [
      makeLog('w1', 'correct', NOW - days(3)),
      makeLog('w1', 'correct', NOW - days(2)),
    ];
    expect(computeStudyStreakDays(gaps, NOW)).toBe(0);
  });
});

describe('复习预测与保持率', () => {
  it('未来七天预测把已到期词条并入今天', () => {
    const forecast = computeDueForecast(
      [
        makeWord({ id: 'overdue', nextReviewAt: NOW - days(3) }),
        makeWord({ id: 'tomorrow', nextReviewAt: NOW + days(1) }),
        makeWord({ id: 'in-two-days', nextReviewAt: NOW + days(2) }),
        makeWord({ id: 'beyond', nextReviewAt: NOW + days(9) }),
      ],
      NOW,
    );

    expect(forecast).toHaveLength(7);
    expect(forecast[0].label).toBe('今天');
    expect(forecast[0].dueCount).toBe(1);
    expect(forecast[1].dueCount).toBe(1);
    expect(forecast[2].dueCount).toBe(1);
    expect(forecast.reduce((sum, day) => sum + day.dueCount, 0)).toBe(3);
  });

  it('保持率随时长递减，未复习词条不参与平均', () => {
    const reviewed = makeWord({
      id: 'reviewed',
      stabilityDays: 2,
      lastReviewedAt: NOW,
      repetitions: 2,
    });
    const untouched = makeWord({ id: 'untouched' });
    const curve = computeRetentionCurve([reviewed, untouched], NOW);

    expect(curve).toHaveLength(7);
    expect(curve[0].retention).toBe(100);
    expect(curve[6].retention).toBeLessThan(curve[0].retention);
  });

  it('没有任何复习记录时返回空曲线', () => {
    expect(computeRetentionCurve([makeWord()], NOW)).toEqual([]);
  });
});

describe('computeMostWrong / computeStatistics', () => {
  it('按错误次数排序，同分按字母序', () => {
    const mostWrong = computeMostWrong(logs, words, 5);
    expect(mostWrong.map((item) => item.word)).toEqual(['alpha', 'reflect']);
    expect(mostWrong[0].wrongCount).toBe(1);
  });

  it('已删除的词条仍保留名称占位', () => {
    const mostWrong = computeMostWrong(
      [makeLog('gone', 'wrong', NOW)],
      words,
      5,
    );
    expect(mostWrong[0].word).toBe('已删除词条');
  });

  it('汇总统计排除跳过记录', () => {
    const stats = computeStatistics(words, logs, NOW, 20);
    expect(stats.totalWords).toBe(3);
    expect(stats.totalReviews).toBe(4);
    expect(stats.totalCorrect).toBe(2);
    expect(stats.accuracy).toBe(50);
    expect(stats.dueCount).toBe(1);
    expect(stats.masteredCount).toBe(1);
    expect(stats.last7Days).toHaveLength(7);
  });
});
