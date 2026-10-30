import { RECENT_COOLDOWN_SIZE } from './constants';
import { poolFlag } from './studyPools';
import { calculateEffectiveWeight } from './weightCalculator';
import type { EffectiveWeightBreakdown, StudyPool, Word, WordGroup, WordState } from './types';

export type RandomFn = () => number;
export const systemRandom: RandomFn = () => Math.random();

export interface WeightedItem<T> {
  item: T;
  weight: number;
}

function safeRandom(random: RandomFn): number {
  return Math.min(Math.max(random(), 0), 0.999999999);
}

export function weightedRandom<T>(
  items: Array<WeightedItem<T>>,
  random: RandomFn = systemRandom,
): T | null {
  if (items.length === 0) return null;

  const positive = items.filter((current) => Number.isFinite(current.weight) && current.weight > 0);
  if (positive.length === 0) {
    return items[Math.floor(safeRandom(random) * items.length)].item;
  }

  const total = positive.reduce((sum, current) => sum + current.weight, 0);
  const target = safeRandom(random) * total;
  let cumulative = 0;

  for (const current of positive) {
    cumulative += current.weight;
    if (target < cumulative) return current.item;
  }

  return positive[positive.length - 1].item;
}

export interface SelectionOptions {
  now: number;
  random?: RandomFn;
  recentWordIds?: string[];
  cooldownSize?: number;
  stateOf?: (word: Word) => WordState;
}

export interface SelectionResult {
  word: Word;
  breakdown: EffectiveWeightBreakdown;
  poolSize: number;
}

/**
 * 最近冷却逐级放宽：排除最近 3 个 → 2 个 → 1 个 → 不排除。
 */
export function selectNextWord(
  words: Word[],
  options: SelectionOptions,
): SelectionResult | null {
  if (words.length === 0) return null;

  const {
    now,
    random = systemRandom,
    recentWordIds = [],
    cooldownSize = RECENT_COOLDOWN_SIZE,
    stateOf = (word: Word) => word,
  } = options;
  const levels = Array.from({ length: cooldownSize + 1 }, (_, index) => cooldownSize - index);

  for (const level of levels) {
    const excluded = new Set(level === 0 ? [] : recentWordIds.slice(-level));
    const pool = words.filter((word) => !excluded.has(word.id));
    if (pool.length === 0) continue;

    const weighted = pool.map((word) => ({
      item: word,
      weight: calculateEffectiveWeight(stateOf(word), now).effectiveWeight,
    }));
    const selected = weightedRandom(weighted, random);
    if (selected) {
      return {
        word: selected,
        breakdown: calculateEffectiveWeight(stateOf(selected), now),
        poolSize: pool.length,
      };
    }
  }

  const fallback = words[Math.floor(safeRandom(random) * words.length)];
  return {
    word: fallback,
    breakdown: calculateEffectiveWeight(stateOf(fallback), now),
    poolSize: 1,
  };
}

export function isDue(word: Word, now: number): boolean {
  return word.nextReviewAt <= now;
}

export function filterWordsForStudy(
  words: Word[],
  options: {
    mode: 'all' | 'due' | 'dictation' | 'category' | 'wrong';
    category?: string;
    now: number;
    wordIds?: string[];
  },
): Word[] {
  if (options.wordIds !== undefined) {
    const allowed = new Set(options.wordIds);
    return words.filter((word) => allowed.has(word.id));
  }
  if (options.mode === 'due') return words.filter((word) => isDue(word, options.now));
  if (options.mode === 'wrong') return words.filter((word) => word.wrongCount > 0);
  if (options.mode === 'category' && options.category) {
    return words.filter((word) => word.category === options.category);
  }
  return words;
}

export function isWordSelectable(
  word: Word,
  groups: WordGroup[],
  pool: StudyPool = 'practice',
): boolean {
  if (!poolFlag(word, pool)) return false;
  if (!word.groupId) return true;
  const group = groups.find((current) => current.id === word.groupId);
  return group ? group.enabled : true;
}

export function filterSelectableWords(
  words: Word[],
  groups: WordGroup[],
  pool: StudyPool = 'practice',
): Word[] {
  return words.filter((word) => isWordSelectable(word, groups, pool));
}
