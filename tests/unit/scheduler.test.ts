import { describe, expect, it } from 'vitest';
import {
  filterSelectableWords,
  filterWordsForStudy,
  isDue,
  isWordSelectable,
  selectNextWord,
  weightedRandom,
} from '../../src/domain/scheduler';
import type { WordGroup } from '../../src/domain/types';
import { days, makeWord, NOW } from './helpers';

function makeGroup(overrides: Partial<WordGroup> = {}): WordGroup {
  return {
    id: 'g_test',
    name: '阅读',
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('weightedRandom', () => {
  const items = [
    { item: 'a', weight: 1 },
    { item: 'b', weight: 3 },
  ];

  it('随机数 0 命中第一个区间', () => {
    expect(weightedRandom(items, () => 0)).toBe('a');
  });

  it('随机数 0.5 落在权重更大的第二项', () => {
    expect(weightedRandom(items, () => 0.5)).toBe('b');
  });

  it('随机数接近 1 命中最后一项', () => {
    expect(weightedRandom(items, () => 0.999)).toBe('b');
  });

  it('权重为 0 的项目不会被选中', () => {
    const zero = [
      { item: 'zero', weight: 0 },
      { item: 'positive', weight: 1 },
    ];
    expect(weightedRandom(zero, () => 0)).toBe('positive');
    expect(weightedRandom(zero, () => 0.999)).toBe('positive');
  });

  it('负权重和 NaN 被忽略', () => {
    const invalid = [
      { item: 'negative', weight: -5 },
      { item: 'nan', weight: Number.NaN },
      { item: 'valid', weight: 2 },
    ];
    expect(weightedRandom(invalid, () => 0.5)).toBe('valid');
  });

  it('所有权重不大于 0 时安全回退', () => {
    const zero = [
      { item: 'a', weight: 0 },
      { item: 'b', weight: 0 },
      { item: 'c', weight: 0 },
    ];
    expect(weightedRandom(zero, () => 0)).toBe('a');
    expect(weightedRandom(zero, () => 0.5)).toBe('b');
    expect(weightedRandom(zero, () => 0.999)).toBe('c');
  });

  it('空数组返回 null', () => {
    expect(weightedRandom([])).toBeNull();
  });

  it('超出范围的随机数被夹紧', () => {
    expect(weightedRandom(items, () => 1.5)).toBe('b');
    expect(weightedRandom(items, () => -0.5)).toBe('a');
  });
});

describe('练习范围', () => {
  it('未勾选的单词不参与练习', () => {
    const word = makeWord({ enabled: false });
    expect(isWordSelectable(word, [])).toBe(false);
    expect(filterSelectableWords([word], [])).toEqual([]);
  });

  it('分组启用状态会覆盖组内单词', () => {
    const group = makeGroup({ enabled: false });
    const grouped = makeWord({ groupId: group.id });
    const loose = makeWord({ id: 'loose', groupId: null });
    expect(isWordSelectable(grouped, [group])).toBe(false);
    expect(filterSelectableWords([grouped, loose], [group])).toEqual([loose]);

    group.enabled = true;
    expect(isWordSelectable(grouped, [group])).toBe(true);
  });

  it('分组缺失时按未分组词处理，不阻塞练习', () => {
    const orphan = makeWord({ groupId: 'g_missing' });
    expect(isWordSelectable(orphan, [])).toBe(true);
  });

  it('单词自身未勾选时，即使分组启用也不出题', () => {
    const group = makeGroup();
    const word = makeWord({ enabled: false, groupId: group.id });
    expect(isWordSelectable(word, [group])).toBe(false);
  });
});

describe('selectNextWord', () => {
  it('空候选返回 null', () => {
    expect(selectNextWord([], { now: NOW })).toBeNull();
  });

  it('近期题目会进入冷却，不被优先抽中', () => {
    const words = ['a', 'b', 'c', 'd', 'e'].map((id) =>
      makeWord({ id, word: `word-${id}`, normalizedWord: `word-${id}` }),
    );
    const recentWordIds = ['a', 'b', 'c'];

    for (const random of [0, 0.25, 0.5, 0.75, 0.999]) {
      const selection = selectNextWord(words, {
        now: NOW,
        recentWordIds,
        random: () => random,
      });
      expect(selection).not.toBeNull();
      expect(recentWordIds).not.toContain(selection!.word.id);
    }
  });

  it('候选不足时逐步放宽冷却，仍能出题', () => {
    const words = ['a', 'b', 'c'].map((id) =>
      makeWord({ id, word: `word-${id}`, normalizedWord: `word-${id}` }),
    );
    const selection = selectNextWord(words, {
      now: NOW,
      recentWordIds: ['a', 'b', 'c'],
      random: () => 0.5,
    });

    expect(selection).not.toBeNull();
    expect(selection!.word.id).toBe('a');
    expect(selection!.poolSize).toBe(1);
  });

  it('只有一个候选且正在冷却时仍会返回该词', () => {
    const word = makeWord({ id: 'only' });
    const selection = selectNextWord([word], {
      now: NOW,
      recentWordIds: ['only'],
      random: () => 0.5,
    });

    expect(selection).not.toBeNull();
    expect(selection!.word.id).toBe('only');
  });

  it('权重更高的词更可能被抽中', () => {
    const high = makeWord({ id: 'high', weight: 8, nextReviewAt: NOW });
    const low = makeWord({ id: 'low', weight: 0.3, nextReviewAt: NOW });
    const selection = selectNextWord([low, high], { now: NOW, random: () => 0.5 });

    expect(selection).not.toBeNull();
    expect(selection!.word.id).toBe('high');
  });

  it('到期单词比未到期单词获得更高有效权重', () => {
    const due = makeWord({
      id: 'due',
      weight: 3,
      repetitions: 2,
      stabilityDays: 2,
      intervalDays: 1,
      lastReviewedAt: NOW - days(2),
      nextReviewAt: NOW - days(1),
    });
    const notDue = makeWord({
      id: 'not-due',
      weight: 3,
      repetitions: 2,
      stabilityDays: 2,
      intervalDays: 1,
      lastReviewedAt: NOW,
      nextReviewAt: NOW + days(1),
    });

    const selection = selectNextWord([notDue, due], { now: NOW, random: () => 0.5 });
    expect(selection!.word.id).toBe('due');
    expect(selection!.breakdown.overdueFactor).toBeGreaterThan(1);
  });

  it('新词能正常被抽到', () => {
    const word = makeWord({ id: 'new' });
    const selection = selectNextWord([word], { now: NOW, random: () => 0.5 });
    expect(selection!.word.id).toBe('new');
    expect(selection!.breakdown.newWordFactor).toBe(1.4);
  });

  it('返回的权重明细与单词一致', () => {
    const word = makeWord({ id: 'w1', weight: 5 });
    const selection = selectNextWord([word], { now: NOW });
    expect(selection!.breakdown.effectiveWeight).toBeCloseTo(7, 5);
  });
});

describe('isDue / filterWordsForStudy', () => {
  const due = makeWord({ id: 'due', category: '名词', nextReviewAt: NOW - 1 });
  const later = makeWord({ id: 'later', category: '动词', nextReviewAt: NOW + days(1) });

  it('按 nextReviewAt 判断到期', () => {
    expect(isDue(due, NOW)).toBe(true);
    expect(isDue(later, NOW)).toBe(false);
  });

  it('全部模式返回所有词', () => {
    expect(filterWordsForStudy([due, later], { mode: 'all', now: NOW })).toHaveLength(2);
  });

  it('到期模式只返回到期词', () => {
    const filtered = filterWordsForStudy([due, later], { mode: 'due', now: NOW });
    expect(filtered.map((word) => word.id)).toEqual(['due']);
  });

  it('分类模式按分类过滤', () => {
    const filtered = filterWordsForStudy([due, later], {
      mode: 'category',
      category: '动词',
      now: NOW,
    });
    expect(filtered.map((word) => word.id)).toEqual(['later']);
  });

  it('分类为空时返回全部', () => {
    expect(
      filterWordsForStudy([due, later], { mode: 'category', category: '', now: NOW }),
    ).toHaveLength(2);
  });

  it('错题模式只返回曾经答错的词', () => {
    const wrong = makeWord({ id: 'wrong', wrongCount: 2 });
    const clean = makeWord({ id: 'clean', wrongCount: 0 });
    const filtered = filterWordsForStudy([wrong, clean], { mode: 'wrong', now: NOW });
    expect(filtered.map((word) => word.id)).toEqual(['wrong']);
  });

  it('指定 wordIds 时优先使用该快照，不受模式与时间影响', () => {
    const snapshot = filterWordsForStudy([due, later], {
      mode: 'due',
      wordIds: ['later'],
      now: NOW,
    });
    expect(snapshot.map((word) => word.id)).toEqual(['later']);
    expect(filterWordsForStudy([due, later], { mode: 'all', wordIds: [], now: NOW })).toEqual([]);
  });
});

describe('dual study pools', () => {
  it('听写池过滤只读取听写勾选', () => {
    const practiceOnly = makeWord({ id: 'practice', enabled: true, dictationEnabled: false });
    const dictationOnly = makeWord({ id: 'dictation', enabled: false, dictationEnabled: true });
    const words = [practiceOnly, dictationOnly];

    expect(filterSelectableWords(words, [], 'practice').map((word) => word.id)).toEqual([
      'practice',
    ]);
    expect(filterSelectableWords(words, [], 'dictation').map((word) => word.id)).toEqual([
      'dictation',
    ]);
  });

  it('分组暂停会同时排除练习池与听写池', () => {
    const group = makeGroup({ enabled: false });
    const word = makeWord({ groupId: group.id, enabled: true, dictationEnabled: true });

    expect(isWordSelectable(word, [group], 'practice')).toBe(false);
    expect(isWordSelectable(word, [group], 'dictation')).toBe(false);
  });

  it('听写池按独立状态计算抽取权重', () => {
    const base = makeWord().dictationState;
    const heavyPractice = makeWord({
      id: 'a',
      weight: 8,
      dictationState: { ...base, weight: 0.5 },
    });
    const heavyDictation = makeWord({
      id: 'b',
      weight: 0.5,
      dictationState: { ...base, weight: 8 },
    });
    const words = [heavyPractice, heavyDictation];

    expect(selectNextWord(words, { now: NOW, random: () => 0.5 })?.word.id).toBe('a');
    expect(
      selectNextWord(words, {
        now: NOW,
        random: () => 0.5,
        stateOf: (word) => (word.id === 'a' ? heavyPractice.dictationState : heavyDictation.dictationState),
      })?.word.id,
    ).toBe('b');
  });
});
