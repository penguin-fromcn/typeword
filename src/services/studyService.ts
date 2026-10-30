import { generateHint, renderMaskedOnly } from '../domain/hintGenerator';
import type {
  AnswerEvaluation,
  ReviewApplication,
  ReviewLog,
  StudyQuestion,
  Word,
} from '../domain/types';
import { createId } from '../domain/wordFactory';
import type { RandomFn } from '../domain/scheduler';

export interface BuildQuestionOptions {
  now: number;
  hintsEnabled: boolean;
  random?: RandomFn;
  questionId?: string;
}

export function buildStudyQuestion(word: Word, options: BuildQuestionOptions): StudyQuestion {
  const hint = options.hintsEnabled
    ? generateHint(word.word, options.random)
    : renderMaskedOnly(word.word);

  return {
    questionId: options.questionId ?? createId('q_'),
    wordId: word.id,
    meaning: word.meanings.join('；'),
    meanings: word.meanings,
    category: word.category,
    difficulty: word.difficulty,
    displayChars: hint.displayChars,
    revealedIndexes: hint.revealedIndexes,
    maskedWord: hint.maskedWord,
    createdAt: options.now,
  };
}

export function buildReviewLog(
  application: ReviewApplication,
  evaluation: AnswerEvaluation,
  input: string,
  hintUsed: boolean,
  now: number,
): ReviewLog {
  return {
    id: createId('log_'),
    wordId: application.word.id,
    result: evaluation.result,
    hintUsed,
    answerText: input.trim(),
    expectedAnswer: evaluation.expectedAnswer,
    weightBefore: application.weightBefore,
    weightAfter: application.weightAfter,
    intervalBefore: application.intervalBefore,
    intervalAfter: application.intervalAfter,
    reviewedAt: now,
  };
}

export function buildSkipLog(word: Word, now: number): ReviewLog {
  return {
    id: createId('log_'),
    wordId: word.id,
    result: 'skipped',
    hintUsed: false,
    answerText: '',
    expectedAnswer: word.word,
    weightBefore: word.weight,
    weightAfter: word.weight,
    intervalBefore: word.intervalDays,
    intervalAfter: word.intervalDays,
    reviewedAt: now,
  };
}
