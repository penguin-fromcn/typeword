import { describe, expect, it } from 'vitest';
import {
  formatMaskedWord,
  generateHint,
  maskWord,
  maxRevealableLetters,
  revealAdditionalHint,
} from '../../src/domain/hintGenerator';

describe('generateHint', () => {
  it('随机位置揭示一个字母，而不是固定首字母', () => {
    const first = generateHint('computer', () => 0);
    const middle = generateHint('computer', () => 0.5);
    const last = generateHint('computer', () => 0.999);

    expect(first.revealedIndexes).toEqual([0]);
    expect(middle.revealedIndexes).toEqual([4]);
    expect(last.revealedIndexes).toEqual([7]);
    expect(first.displayChars[0]).toBe('c');
    expect(middle.displayChars[4]).toBe('u');
    expect(last.displayChars[7]).toBe('r');
  });

  it('只揭示一个字母，其余为 null', () => {
    const hint = generateHint('computer', () => 0.4);
    expect(hint.revealedIndexes).toHaveLength(1);
    expect(hint.displayChars.filter((char) => char === null)).toHaveLength(7);
  });

  it('空格与连字符直接显示', () => {
    const hint = generateHint('mother-in-law', () => 0);
    expect(hint.displayChars[6]).toBe('-');
    expect(hint.displayChars[9]).toBe('-');
    expect(hint.maskedWord).toContain('-');
  });

  it('单字母单词直接显示该字母', () => {
    const hint = generateHint('a', () => 0.5);
    expect(hint.revealedIndexes).toEqual([0]);
    expect(hint.displayChars).toEqual(['a']);
  });

  it('没有字母时不会崩溃', () => {
    const hint = generateHint('---', () => 0.5);
    expect(hint.revealedIndexes).toEqual([]);
    expect(hint.displayChars).toEqual(['-', '-', '-']);
  });
});

describe('maxRevealableLetters', () => {
  it('长单词最多揭示 50% 的字母', () => {
    expect(maxRevealableLetters('computer')).toBe(4);
    expect(maxRevealableLetters('reflection')).toBe(5);
  });

  it('始终至少保留一个字母', () => {
    expect(maxRevealableLetters('a')).toBe(0);
    expect(maxRevealableLetters('ab')).toBe(1);
    expect(maxRevealableLetters('cat')).toBe(1);
  });

  it('只统计字母与数字，不统计连字符', () => {
    expect(maxRevealableLetters('mother-in-law')).toBe(5);
  });
});

describe('revealAdditionalHint', () => {
  it('每次额外揭示一个尚未显示的字母', () => {
    const first = generateHint('reflection', () => 0);
    const next = revealAdditionalHint('reflection', first.revealedIndexes, () => 0.5);

    expect(next).not.toBeNull();
    expect(next!.revealedIndexes).toHaveLength(2);
    expect(
      next!.revealedIndexes.filter((index) => !first.revealedIndexes.includes(index)),
    ).toHaveLength(1);
  });

  it('最多揭示 50%，并保留隐藏字母', () => {
    let revealed: number[] = [];
    let count = 0;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const next = revealAdditionalHint('reflection', revealed, () => 0.3);
      if (!next) break;
      revealed = next.revealedIndexes;
      count += 1;
    }

    expect(count).toBe(5);
    expect(revealed).toHaveLength(5);
    expect(revealed.length).toBeLessThan('reflection'.length);
  });

  it('重复揭示同一位置不会重复计数', () => {
    const next = revealAdditionalHint('reflection', [2, 2, 2], () => 0);
    expect(next!.revealedIndexes).toHaveLength(2);
  });

  it('已达上限时返回 null', () => {
    expect(revealAdditionalHint('ab', [0], () => 0.5)).toBeNull();
  });

  it('过滤掉不属于该单词的索引', () => {
    const hint = revealAdditionalHint('cat', [999], () => 0);
    expect(hint!.revealedIndexes).toHaveLength(1);
  });
});

describe('maskWord', () => {
  it('保留标点、空格与换行语义', () => {
    const masked = maskWord('good morning!', [0]);
    expect(masked[0]).toBe('g');
    expect(masked[4]).toBe(' ');
    expect(masked[12]).toBe('!');
    expect(masked[1]).toBeNull();
  });

  it('formatMaskedWord 用下划线表示隐藏字母', () => {
    expect(formatMaskedWord(['c', null, null])).toBe('c _ _');
    expect(formatMaskedWord(['-', null])).toBe('- _');
  });
});
