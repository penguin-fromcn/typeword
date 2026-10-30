import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_QUOTES,
  nextQuoteIndex,
  randomQuoteIndex,
} from '../../src/features/dashboard/dashboardQuotes';

describe('dashboardQuotes', () => {
  it('文案池足够大，且包含首页原始标题', () => {
    expect(DASHBOARD_QUOTES.length).toBeGreaterThanOrEqual(40);
    expect(DASHBOARD_QUOTES.some((quote) => quote.lines.join('') === '把遗忘，交给曲线。')).toBe(true);
  });

  it('每条文案都是两行短句，适合固定标题版式', () => {
    for (const quote of DASHBOARD_QUOTES) {
      expect(quote.lines).toHaveLength(2);
      for (const line of quote.lines) {
        expect(line.trim().length).toBeGreaterThan(0);
        expect([...line].length).toBeLessThanOrEqual(8);
      }
    }
  });

  it('文案与单行内容都不重复', () => {
    const lines = DASHBOARD_QUOTES.flatMap((quote) => [...quote.lines]);
    expect(new Set(lines).size).toBe(lines.length);
    const joined = DASHBOARD_QUOTES.map((quote) => quote.lines.join(''));
    expect(new Set(joined).size).toBe(joined.length);
  });

  it('首次进入也从文案池随机抽取', () => {
    expect(randomQuoteIndex(() => 0)).toBe(0);
    expect(randomQuoteIndex(() => 0.5)).toBe(Math.floor(DASHBOARD_QUOTES.length / 2));
    expect(randomQuoteIndex(() => 0.999999)).toBe(DASHBOARD_QUOTES.length - 1);
    for (const roll of [0, 0.25, 0.5, 0.75, 0.999999]) {
      const index = randomQuoteIndex(() => roll);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(DASHBOARD_QUOTES.length);
    }
  });

  it('随机切换到下一条时不会停留在同一条', () => {
    for (let index = 0; index < DASHBOARD_QUOTES.length; index += 1) {
      for (const roll of [0, 0.25, 0.5, 0.75, 0.999999]) {
        const next = nextQuoteIndex(index, () => roll);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThan(DASHBOARD_QUOTES.length);
        expect(next).not.toBe(index);
      }
    }
  });

  it('随机数边界决定步进范围', () => {
    expect(nextQuoteIndex(0, () => 0)).toBe(1);
    expect(nextQuoteIndex(0, () => 0.999999)).toBe(DASHBOARD_QUOTES.length - 1);
    expect(nextQuoteIndex(DASHBOARD_QUOTES.length - 1, () => 0)).toBe(0);
  });
});
