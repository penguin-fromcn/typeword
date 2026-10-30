import { describe, expect, it } from 'vitest';
import { normalizeWord } from '../../src/domain/wordNormalizer';

describe('normalizeWord', () => {
  it('去除首尾空格并转小写', () => {
    expect(normalizeWord(' Apple ')).toBe('apple');
  });

  it('合并连续空格但保留短语空格', () => {
    expect(normalizeWord('GOOD  MORNING')).toBe('good morning');
  });

  it('弯引号转换为直引号', () => {
    expect(normalizeWord('Don’t')).toBe("don't");
    expect(normalizeWord('DON’T')).toBe("don't");
    expect(normalizeWord('‘quoted’')).toBe("'quoted'");
  });

  it('全角字符转换为半角', () => {
    expect(normalizeWord('ＡＰＰＬＥ')).toBe('apple');
    expect(normalizeWord('ｄｏｎ’ｔ')).toBe("don't");
  });

  it('保留连字符并统一不同长度破折号', () => {
    expect(normalizeWord('mother-in-law')).toBe('mother-in-law');
    expect(normalizeWord('mother–in–law')).toBe('mother-in-law');
    expect(normalizeWord('mother—in—law')).toBe('mother-in-law');
  });

  it('会折叠中文全角空格', () => {
    expect(normalizeWord('look　　after')).toBe('look after');
  });

  it('不会删除字母或增加模糊匹配', () => {
    expect(normalizeWord('reflecton')).toBe('reflecton');
    expect(normalizeWord('reflction')).toBe('reflction');
  });

  it('空字符串保持为空', () => {
    expect(normalizeWord('   ')).toBe('');
  });
});
