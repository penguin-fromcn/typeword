import { describe, expect, it } from 'vitest';
import {
  formValuesToWordInput,
  parseImportJson,
  parseSeedJson,
  wordFormSchema,
} from '../../src/domain/schemas';
import { buildExportPayload, prepareImport } from '../../src/services/importExportService';
import { makeWord, NOW } from './helpers';

describe('wordFormSchema', () => {
  const valid = {
    word: 'reflect',
    meaningsText: '反射\n倒影；反映',
    acceptedAnswersText: 'reflexion',
    phonetic: '/rɪˈflekt/',
    exampleSentence: 'The lake reflects the sky.',
    notes: 'reflection n.',
    category: '动词',
    tagsText: '考研, 阅读',
    difficulty: '3',
  };

  it('接受原始表单字符串并转换为 WordInput', () => {
    const parsed = wordFormSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const input = formValuesToWordInput(parsed.data);
    expect(input.word).toBe('reflect');
    expect(input.meanings).toEqual(['反射', '倒影', '反映']);
    expect(input.acceptedAnswers).toEqual(['reflexion']);
    expect(input.tags).toEqual(['考研', '阅读']);
    expect(input.difficulty).toBe(3);
    expect(input.phonetic).toBe('/rɪˈflekt/');
  });

  it('空单词或空释义会被拒绝', () => {
    expect(wordFormSchema.safeParse({ ...valid, word: '  ' }).success).toBe(false);
    expect(wordFormSchema.safeParse({ ...valid, meaningsText: ' ；\n ' }).success).toBe(false);
  });

  it('难度超出 1–5 会被拒绝', () => {
    expect(wordFormSchema.safeParse({ ...valid, difficulty: 0 }).success).toBe(false);
    expect(wordFormSchema.safeParse({ ...valid, difficulty: 6 }).success).toBe(false);
  });

  it('可选字段留空时转为 null', () => {
    const parsed = wordFormSchema.safeParse({
      ...valid,
      phonetic: '',
      exampleSentence: '',
      notes: '',
      acceptedAnswersText: '',
      tagsText: '',
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const input = formValuesToWordInput(parsed.data);
    expect(input.phonetic).toBeNull();
    expect(input.exampleSentence).toBeNull();
    expect(input.notes).toBeNull();
    expect(input.acceptedAnswers).toEqual([]);
    expect(input.tags).toEqual([]);
  });
});

describe('parseSeedJson', () => {
  it('解析合法的初始词库数组', () => {
    const result = parseSeedJson([
      {
        word: 'apple',
        meanings: ['苹果'],
        phonetic: '/ˈæpl/',
        exampleSentence: 'An apple a day.',
        category: '基础词汇',
        tags: ['基础'],
        difficulty: 1,
        acceptedAnswers: [],
      },
    ]);

    expect(result.issues).toEqual([]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].word).toBe('apple');
    expect(result.records[0].meanings).toEqual(['苹果']);
  });

  it('允许 meanings 为字符串并自动包装', () => {
    const result = parseSeedJson([{ word: 'apple', meanings: '苹果' }]);
    expect(result.records[0].meanings).toEqual(['苹果']);
  });

  it('逐条收集非法记录而不中断', () => {
    const result = parseSeedJson([
      { word: 'apple', meanings: ['苹果'] },
      { word: '', meanings: ['空词'] },
      { word: 'banana', meanings: [] },
      'not-an-object',
    ]);

    expect(result.records).toHaveLength(1);
    expect(result.issues).toHaveLength(3);
    expect(result.issues[1].word).toBe('banana');
  });

  it('根节点不是数组时返回错误', () => {
    const result = parseSeedJson({ word: 'apple' });
    expect(result.records).toEqual([]);
    expect(result.issues[0].message).toContain('数组');
  });
});

describe('parseImportJson', () => {
  it('支持直接数组和 { words } 包装', () => {
    const direct = parseImportJson([{ word: 'apple', meanings: ['苹果'] }]);
    const wrapped = parseImportJson({
      app: 'TypeWord',
      words: [{ word: 'apple', meanings: ['苹果'], weight: 2.2, nextReviewAt: NOW }],
    });

    expect(direct.records).toHaveLength(1);
    expect(wrapped.records).toHaveLength(1);
    expect(wrapped.hasProgressState).toBe(true);
  });

  it('识别嵌套 state 中的学习进度', () => {
    const result = parseImportJson([
      {
        word: 'apple',
        meanings: ['苹果'],
        state: { weight: 1.5, stabilityDays: 2, nextReviewAt: NOW + 1000 },
      },
    ]);
    expect(result.hasProgressState).toBe(true);
    expect(result.records[0].state?.weight).toBe(1.5);
  });

  it('非法 JSON 结构返回错误而不抛异常', () => {
    expect(parseImportJson(null).issues).toHaveLength(1);
    expect(parseImportJson({ foo: [] }).issues[0].message).toContain('words');
  });

  it('跳过负数答题次数等非法记录', () => {
    const result = parseImportJson([{ word: 'apple', meanings: ['苹果'], attemptCount: -1 }]);
    expect(result.records).toHaveLength(0);
    expect(result.issues).toHaveLength(1);
  });
});

describe('prepareImport / buildExportPayload', () => {
  it('文件内重复单词只保留第一条', () => {
    const prepared = prepareImport(
      [
        { word: 'Apple', meanings: ['苹果'] },
        { word: ' apple ', meanings: ['苹果'] },
      ],
      NOW,
    );

    expect(prepared.words).toHaveLength(1);
    expect(prepared.issues).toHaveLength(1);
    expect(prepared.issues[0].message).toContain('重复');
  });

  it('导入时把越界权重和 easeFactor 夹紧到安全范围', () => {
    const prepared = prepareImport(
      [
        {
          word: 'apple',
          meanings: ['苹果'],
          weight: 99,
          stabilityDays: -5,
          easeFactor: 0.1,
          nextReviewAt: NOW + 5000,
          attemptCount: 4,
          correctCount: 3,
        },
      ],
      NOW,
    );

    const word = prepared.words[0];
    expect(word.weight).toBe(8);
    expect(word.stabilityDays).toBe(0.05);
    expect(word.easeFactor).toBe(1.3);
    expect(word.attemptCount).toBe(4);
    expect(word.correctCount).toBe(3);
    expect(prepared.replaceState).toBe(true);
  });

  it('没有进度字段时按新词导入', () => {
    const prepared = prepareImport([{ word: 'apple', meanings: ['苹果'] }], NOW);
    expect(prepared.replaceState).toBe(false);
    expect(prepared.words[0].weight).toBe(3);
    expect(prepared.words[0].nextReviewAt).toBe(NOW);
  });

  it('导出数据可以重新导入并保留学习进度', () => {
    const word = makeWord({
      enabled: false,
      studyEnabled: false,
      mark: 'starred',
      weight: 2.4,
      stabilityDays: 3.5,
      intervalDays: 4,
      easeFactor: 2.2,
      repetitions: 3,
      consecutiveCorrect: 2,
      attemptCount: 9,
      correctCount: 7,
      wrongCount: 2,
      hintCount: 1,
      lastReviewedAt: NOW - 1000,
      lastResult: 'correct',
      nextReviewAt: NOW + 123456,
      createdAt: NOW - 9999,
      updatedAt: NOW - 500,
    });

    const payload = buildExportPayload([word], NOW);
    const parsedJson: unknown = JSON.parse(payload);
    const prepared = prepareImport(parsedJson, NOW);
    const imported = prepared.words[0];

    expect(prepared.issues).toEqual([]);
    expect(imported.id).toBe(word.id);
    expect(imported.word).toBe(word.word);
    expect(imported.meanings).toEqual(word.meanings);
    expect(imported.enabled).toBe(false);
    expect(imported.studyEnabled).toBe(false);
    expect(imported.mark).toBe('starred');
    expect(imported.weight).toBeCloseTo(word.weight, 6);
    expect(imported.stabilityDays).toBeCloseTo(word.stabilityDays, 6);
    expect(imported.intervalDays).toBeCloseTo(word.intervalDays, 6);
    expect(imported.easeFactor).toBeCloseTo(word.easeFactor, 6);
    expect(imported.repetitions).toBe(word.repetitions);
    expect(imported.attemptCount).toBe(word.attemptCount);
    expect(imported.correctCount).toBe(word.correctCount);
    expect(imported.wrongCount).toBe(word.wrongCount);
    expect(imported.hintCount).toBe(word.hintCount);
    expect(imported.lastReviewedAt).toBe(word.lastReviewedAt);
    expect(imported.nextReviewAt).toBe(word.nextReviewAt);
    expect(imported.createdAt).toBe(word.createdAt);
  });

  it('导出载荷包含版本与导出时间', () => {
    const payload: unknown = JSON.parse(buildExportPayload([], NOW));
    expect(payload).toMatchObject({
      app: 'TypeWord',
      version: 1,
      exportedAt: NOW,
      words: [],
    });
  });
});

describe('听写池导入导出', () => {
  it('导出并重新导入保留听写勾选与独立状态', () => {
    const word = makeWord({
      dictationEnabled: false,
      dictationState: {
        ...makeWord().dictationState,
        weight: 5.5,
        attemptCount: 6,
        correctCount: 4,
        nextReviewAt: NOW + 8888,
        lastResult: 'correct_with_hint',
      },
    });

    const payload: unknown = JSON.parse(buildExportPayload([word], NOW));
    const prepared = prepareImport(payload, NOW);
    const imported = prepared.words[0];

    expect(imported.dictationEnabled).toBe(false);
    expect(imported.dictationState.weight).toBeCloseTo(5.5, 6);
    expect(imported.dictationState.attemptCount).toBe(6);
    expect(imported.dictationState.correctCount).toBe(4);
    expect(imported.dictationState.nextReviewAt).toBe(NOW + 8888);
    expect(imported.dictationState.lastResult).toBe('correct_with_hint');
    expect(imported.weight).toBe(word.weight);
    expect(prepared.replaceState).toBe(true);
  });

  it('旧导出没有听写字段时，听写勾选跟随练习勾选', () => {
    const prepared = prepareImport(
      [{ word: 'apple', meanings: ['苹果'], enabled: false, weight: 2.2 }],
      NOW,
    );
    const imported = prepared.words[0];

    expect(imported.enabled).toBe(false);
    expect(imported.dictationEnabled).toBe(false);
    expect(imported.dictationState.weight).toBe(3);
    expect(imported.dictationState.nextReviewAt).toBe(NOW);
  });

  it('只有 dictationState 也视为学习进度', () => {
    const parsed = parseImportJson([
      {
        word: 'apple',
        meanings: ['苹果'],
        dictationState: { weight: 2.5, nextReviewAt: NOW },
      },
    ]);
    expect(parsed.hasProgressState).toBe(true);
    expect(parsed.records[0].dictationState?.weight).toBe(2.5);
  });
});
