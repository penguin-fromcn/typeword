export type ReviewOutcome = 'correct' | 'correct_with_hint' | 'wrong';
export type ReviewLogResult = ReviewOutcome | 'skipped';
export type StudyPool = 'practice' | 'dictation';

export const WORD_MARK_VALUES = ['none', 'starred', 'later', 'mastered'] as const;
export type WordMark = (typeof WORD_MARK_VALUES)[number];

export interface WordState {
  weight: number;
  stabilityDays: number;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  consecutiveCorrect: number;
  attemptCount: number;
  correctCount: number;
  wrongCount: number;
  hintCount: number;
  lastReviewedAt: number | null;
  lastResult: ReviewLogResult | null;
  nextReviewAt: number;
}

export interface Word extends WordState {
  id: string;
  word: string;
  normalizedWord: string;
  meanings: string[];
  acceptedAnswers: string[];
  phonetic: string | null;
  exampleSentence: string | null;
  notes: string | null;
  category: string;
  tags: string[];
  difficulty: number;
  enabled: boolean;
  dictationEnabled: boolean;
  dictationState: WordState;
  studyEnabled: boolean;
  groupId: string | null;
  mark: WordMark;
  createdAt: number;
  updatedAt: number;
}

export interface WordInput {
  word: string;
  meanings: string[];
  acceptedAnswers: string[];
  phonetic?: string | null;
  exampleSentence?: string | null;
  notes?: string | null;
  category?: string;
  tags?: string[];
  difficulty?: number;
  groupId?: string | null;
}

export interface WordGroup {
  id: string;
  name: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ReviewLog {
  id: string;
  wordId: string;
  result: ReviewLogResult;
  hintUsed: boolean;
  answerText: string;
  expectedAnswer: string;
  weightBefore: number;
  weightAfter: number;
  intervalBefore: number;
  intervalAfter: number;
  reviewedAt: number;
}

export interface AnswerEvaluation {
  result: ReviewOutcome;
  normalizedAnswer: string;
  expectedAnswer: string;
  isCorrect: boolean;
}

export interface HintResult {
  revealedIndexes: number[];
  displayChars: Array<string | null>;
  maskedWord: string;
}

export interface EffectiveWeightBreakdown {
  retention: number;
  forgettingFactor: number;
  overdueFactor: number;
  newWordFactor: number;
  effectiveWeight: number;
}

export interface ReviewApplication {
  word: Word;
  weightBefore: number;
  weightAfter: number;
  intervalBefore: number;
  intervalAfter: number;
  nextReviewAt: number;
  result: ReviewOutcome;
}

export interface StudyQuestion {
  questionId: string;
  wordId: string;
  meaning: string;
  meanings: string[];
  category: string;
  difficulty: number;
  displayChars: Array<string | null>;
  revealedIndexes: number[];
  maskedWord: string;
  createdAt: number;
}

export interface WordFilter {
  search?: string;
  category?: string;
  difficulty?: number | null;
  onlyDue?: boolean;
  mark?: WordMark | '';
}

export type StudyMode = 'all' | 'due' | 'dictation' | 'category' | 'wrong';

export interface ImportIssue {
  index: number;
  word: string;
  message: string;
}

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  issues: ImportIssue[];
}

export interface DailyBucket {
  dayKey: string;
  label: string;
  attempts: number;
  correct: number;
  wrong: number;
}

export interface DueForecastDay {
  dayKey: string;
  label: string;
  dueCount: number;
}

export interface RetentionPoint {
  dayKey: string;
  label: string;
  retention: number;
}

export interface BackupInfo {
  fileName: string;
  createdAt: number;
  size: number;
}

export interface TodayStats {
  attempts: number;
  correct: number;
  wrong: number;
  accuracy: number;
  streak: number;
  distinctWords: number;
  dueCount: number;
  goal: number;
}

export interface StatisticsSummary {
  totalWords: number;
  totalReviews: number;
  totalCorrect: number;
  accuracy: number;
  dueCount: number;
  masteredCount: number;
  today: TodayStats;
  last7Days: DailyBucket[];
  dueForecast: DueForecastDay[];
  retentionCurve: RetentionPoint[];
  studyStreakDays: number;
  mostWrong: Array<{ wordId: string; word: string; wrongCount: number }>;
}
