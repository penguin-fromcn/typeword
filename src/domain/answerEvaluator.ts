import type { AnswerEvaluation, Word } from './types';
import { normalizeWord } from './wordNormalizer';

interface AnswerTarget {
  word: string;
  acceptedAnswers?: string[];
}

export function isAnswerAccepted(target: AnswerTarget, input: string): boolean {
  const normalizedInput = normalizeWord(input);
  if (!normalizedInput) return false;

  const candidates = [target.word, ...(target.acceptedAnswers ?? [])]
    .map(normalizeWord)
    .filter(Boolean);

  return candidates.includes(normalizedInput);
}

export function evaluateAnswer(
  word: Pick<Word, 'word' | 'acceptedAnswers'>,
  input: string,
  hintUsed: boolean,
): AnswerEvaluation {
  const normalizedAnswer = normalizeWord(input);
  const isCorrect = isAnswerAccepted(word, input);

  return {
    result: isCorrect ? (hintUsed ? 'correct_with_hint' : 'correct') : 'wrong',
    normalizedAnswer,
    expectedAnswer: word.word,
    isCorrect,
  };
}
