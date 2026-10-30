import { describe, expect, it } from 'vitest';
import {
  filterStudyWords,
  groupMemberIds,
  groupStudySelection,
  selectionState,
  stepCardIndex,
} from '../../src/domain/cardDeck';
import { makeWord } from './helpers';

describe('cardDeck', () => {
  it('只按学习范围筛选，不受练习勾选与分组暂停影响', () => {
    const words = [
      makeWord({ id: 'w1', studyEnabled: true, enabled: false }),
      makeWord({ id: 'w2', studyEnabled: false, enabled: true }),
      makeWord({ id: 'w3', studyEnabled: true, enabled: true }),
    ];

    expect(filterStudyWords(words).map((word) => word.id)).toEqual(['w1', 'w3']);
  });

  it('向前向后翻页都会循环到另一端', () => {
    expect(stepCardIndex(0, 3, 'next')).toBe(1);
    expect(stepCardIndex(2, 3, 'next')).toBe(0);
    expect(stepCardIndex(0, 3, 'previous')).toBe(2);
    expect(stepCardIndex(1, 3, 'previous')).toBe(0);
  });

  it('没有卡片时返回 -1，初次翻页落在首尾', () => {
    expect(stepCardIndex(0, 0, 'next')).toBe(-1);
    expect(stepCardIndex(-1, 3, 'next')).toBe(0);
    expect(stepCardIndex(-1, 3, 'previous')).toBe(2);
  });

  it('选择状态区分未选、部分与全选', () => {
    expect(selectionState(0, 0)).toBe('none');
    expect(selectionState(0, 4)).toBe('none');
    expect(selectionState(2, 4)).toBe('partial');
    expect(selectionState(4, 4)).toBe('all');
  });

  it('分组范围包含普通分组与未分组', () => {
    const words = [
      makeWord({ id: 'w1', groupId: 'g1' }),
      makeWord({ id: 'w2', groupId: 'g2' }),
      makeWord({ id: 'w3', groupId: null }),
      makeWord({ id: 'w4', groupId: 'g1' }),
    ];

    expect(groupMemberIds(words, 'g1')).toEqual(['w1', 'w4']);
    expect(groupMemberIds(words, null)).toEqual(['w3']);
  });

  it('分组选中数量可用于整组切换', () => {
    const words = [
      makeWord({ id: 'w1', groupId: 'g1', studyEnabled: true }),
      makeWord({ id: 'w2', groupId: 'g1', studyEnabled: false }),
      makeWord({ id: 'w3', groupId: 'g2', studyEnabled: true }),
    ];

    expect(groupStudySelection(words, 'g1')).toEqual({
      selected: 1,
      total: 2,
      state: 'partial',
    });
    expect(groupStudySelection(words, 'g2')).toEqual({
      selected: 1,
      total: 1,
      state: 'all',
    });
    expect(groupStudySelection(words, 'missing')).toEqual({
      selected: 0,
      total: 0,
      state: 'none',
    });
  });
});
