import { describe, expect, it } from 'vitest';
import { evaluateAnswer, isAnswerAccepted } from '../../src/domain/answerEvaluator';
import type { Word } from '../../src/domain/types';
import { makeWord } from './helpers';

function answer(overrides: Partial<Word>) {
  return { ...makeWord(overrides) };
}

describe('isAnswerAccepted', () => {
  it('接受完全匹配的标准答案', () => {
    expect(isAnswerAccepted(answer({ word: 'reflect' }), 'reflect')).toBe(true);
  });

  it('大小写不影响判断', () => {
    expect(isAnswerAccepted(answer({ word: 'Reflect' }), 'REFLECT')).toBe(true);
  });

  it('清理首尾空格', () => {
    expect(isAnswerAccepted(answer({ word: 'reflect' }), '  reflect  ')).toBe(true);
  });

  it('多余空格会被折叠', () => {
    expect(isAnswerAccepted(answer({ word: 'good morning' }), 'GOOD   MORNING')).toBe(true);
  });

  it('短语必须保留空格', () => {
    expect(isAnswerAccepted(answer({ word: 'good morning' }), 'goodmorning')).toBe(false);
  });

  it('连字符必须保留', () => {
    expect(isAnswerAccepted(answer({ word: 'mother-in-law' }), 'mother in law')).toBe(false);
    expect(isAnswerAccepted(answer({ word: 'mother-in-law' }), 'MOTHER-IN-LAW')).toBe(true);
  });

  it('弯引号与全角字符按规范化后匹配', () => {
    expect(isAnswerAccepted(answer({ word: "don't" }), 'DON’T')).toBe(true);
  });

  it('少一个字母不算正确', () => {
    expect(isAnswerAccepted(answer({ word: 'reflect' }), 'reflet')).toBe(false);
  });

  it('多一个字母不算正确', () => {
    expect(isAnswerAccepted(answer({ word: 'reflect' }), 'reflectt')).toBe(false);
  });

  it('字母顺序错误不算正确', () => {
    expect(isAnswerAccepted(answer({ word: 'reflect' }), 'refelct')).toBe(false);
  });

  it('接受备用答案', () => {
    const word = answer({ word: 'colour', acceptedAnswers: ['color'] });
    expect(isAnswerAccepted(word, 'color')).toBe(true);
    expect(isAnswerAccepted(word, 'colour')).toBe(true);
  });

  it('空输入不通过', () => {
    expect(isAnswerAccepted(answer({}), '   ')).toBe(false);
  });
});

describe('evaluateAnswer', () => {
  it('无提示答对返回 correct', () => {
    const result = evaluateAnswer(makeWord(), 'Reflect', false);
    expect(result.result).toBe('correct');
    expect(result.isCorrect).toBe(true);
    expect(result.normalizedAnswer).toBe('reflect');
    expect(result.expectedAnswer).toBe('reflect');
  });

  it('使用提示后答对返回 correct_with_hint', () => {
    const result = evaluateAnswer(makeWord(), 'reflect', true);
    expect(result.result).toBe('correct_with_hint');
    expect(result.isCorrect).toBe(true);
  });

  it('答错返回 wrong 且保留输入规范形态', () => {
    const result = evaluateAnswer(makeWord(), '  Reflexion ', false);
    expect(result.result).toBe('wrong');
    expect(result.isCorrect).toBe(false);
    expect(result.normalizedAnswer).toBe('reflexion');
  });

  it('备用答案命中时仍算正确', () => {
    const word = makeWord({ word: 'meagre', acceptedAnswers: ['meager'] });
    expect(evaluateAnswer(word, 'meager', false).result).toBe('correct');
  });
});
