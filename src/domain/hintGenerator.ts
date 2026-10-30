import { MAX_HINT_RATIO } from './constants';
import type { HintResult } from './types';

const LETTER_OR_DIGIT = /[A-Za-z0-9]/;
const REVEALABLE = /[A-Za-z0-9]/;

export type RandomFn = () => number;

export const systemRandom: RandomFn = () => Math.random();

function randomIndex(length: number, random: RandomFn): number {
  if (length <= 0) return -1;
  const value = Math.min(Math.max(random(), 0), 0.999999999);
  return Math.floor(value * length);
}

function revealableIndexes(word: string): number[] {
  const indexes: number[] = [];
  for (let index = 0; index < word.length; index += 1) {
    if (REVEALABLE.test(word[index])) indexes.push(index);
  }
  return indexes;
}

export function maskWord(word: string, revealedIndexes: number[]): Array<string | null> {
  const revealed = new Set(revealedIndexes);
  return Array.from(word, (char, index) => {
    if (!LETTER_OR_DIGIT.test(char)) return char;
    return revealed.has(index) ? char : null;
  });
}

export function formatMaskedWord(displayChars: Array<string | null>): string {
  return displayChars.map((char) => (char === null ? '_' : char)).join(' ');
}

function buildResult(word: string, revealedIndexes: number[]): HintResult {
  const sorted = [...new Set(revealedIndexes)].sort((a, b) => a - b);
  const displayChars = maskWord(word, sorted);
  return {
    revealedIndexes: sorted,
    displayChars,
    maskedWord: formatMaskedWord(displayChars),
  };
}

export function maxRevealableLetters(word: string): number {
  const total = revealableIndexes(word).length;
  if (total <= 1) return 0;
  return Math.min(total - 1, Math.max(1, Math.floor(total * MAX_HINT_RATIO)));
}

/**
 * 自动提示：随机揭示一个字母。空格、连字符、撇号等始终显示。
 */
export function generateHint(word: string, random: RandomFn = systemRandom): HintResult {
  const candidates = revealableIndexes(word);
  if (candidates.length === 0) return buildResult(word, []);
  return buildResult(word, [candidates[randomIndex(candidates.length, random)]]);
}

export function renderMaskedOnly(word: string): HintResult {
  return buildResult(word, []);
}

/**
 * 额外提示：在未揭示字母中随机再揭示一个，最多揭示 50%（且至少保留一个字母）。
 * 无法继续时返回 null。
 */
export function revealAdditionalHint(
  word: string,
  currentRevealed: number[],
  random: RandomFn = systemRandom,
): HintResult | null {
  const all = revealableIndexes(word);
  const revealed = new Set(currentRevealed.filter((index) => all.includes(index)));
  const remaining = all.filter((index) => !revealed.has(index));
  const limit = maxRevealableLetters(word);

  if (remaining.length === 0 || revealed.size >= limit) return null;

  const nextIndex = remaining[randomIndex(remaining.length, random)];
  return buildResult(word, [...revealed, nextIndex]);
}
