import { DAY_MS } from '../domain/constants';
import type {
  DailyBucket,
  DueForecastDay,
  RetentionPoint,
  ReviewLog,
  StatisticsSummary,
  TodayStats,
  Word,
} from '../domain/types';
import { calculateAccuracy, calculateRetention } from '../domain/weightCalculator';

const pad = (value: number) => String(value).padStart(2, '0');

export function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function computeCurrentStreak(logs: ReviewLog[]): number {
  const sorted = [...logs]
    .filter((log) => log.result !== 'skipped')
    .sort((a, b) => b.reviewedAt - a.reviewedAt);

  let streak = 0;
  for (const log of sorted) {
    if (log.result === 'wrong') break;
    streak += 1;
  }
  return streak;
}

export function computeTodayStats(
  logs: ReviewLog[],
  words: Word[],
  now: number,
  goal: number,
): TodayStats {
  const start = startOfDay(now);
  const end = start + DAY_MS;
  const today = logs.filter(
    (log) => log.reviewedAt >= start && log.reviewedAt < end && log.result !== 'skipped',
  );
  const correct = today.filter((log) => log.result !== 'wrong').length;
  const wrong = today.length - correct;

  return {
    attempts: today.length,
    correct,
    wrong,
    accuracy: calculateAccuracy(correct, today.length),
    streak: computeCurrentStreak(logs),
    distinctWords: new Set(today.map((log) => log.wordId)).size,
    dueCount: words.filter((word) => word.nextReviewAt <= now).length,
    goal,
  };
}

export function computeLast7Days(logs: ReviewLog[], now: number): DailyBucket[] {
  const buckets: DailyBucket[] = [];
  const todayStart = startOfDay(now);

  for (let offset = 6; offset >= 0; offset -= 1) {
    const start = todayStart - offset * DAY_MS;
    const end = start + DAY_MS;
    const dayLogs = logs.filter(
      (log) => log.reviewedAt >= start && log.reviewedAt < end && log.result !== 'skipped',
    );
    const correct = dayLogs.filter((log) => log.result !== 'wrong').length;
    const date = new Date(start);
    buckets.push({
      dayKey: dayKey(start),
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      attempts: dayLogs.length,
      correct,
      wrong: dayLogs.length - correct,
    });
  }

  return buckets;
}

export function computeDueForecast(
  words: Word[],
  now: number,
  days = 7,
): DueForecastDay[] {
  const todayStart = startOfDay(now);
  return Array.from({ length: days }, (_, offset) => {
    const start = todayStart + offset * DAY_MS;
    const end = start + DAY_MS;
    const dueCount = words.filter((word) =>
      offset === 0
        ? word.nextReviewAt < end
        : word.nextReviewAt >= start && word.nextReviewAt < end,
    ).length;
    const date = new Date(start);
    return {
      dayKey: dayKey(start),
      label: offset === 0 ? '今天' : `${date.getMonth() + 1}/${date.getDate()}`,
      dueCount,
    };
  });
}

export function computeRetentionCurve(
  words: Word[],
  now: number,
  days = 7,
): RetentionPoint[] {
  const reviewed = words.filter((word) => word.lastReviewedAt !== null);
  if (reviewed.length === 0) return [];

  const todayStart = startOfDay(now);
  return Array.from({ length: days }, (_, offset) => {
    const start = todayStart + offset * DAY_MS;
    const at = offset === 0 ? now : start + DAY_MS / 2;
    const average =
      (reviewed.reduce((sum, word) => sum + calculateRetention(word, at), 0) /
        reviewed.length) *
      100;
    const date = new Date(start);
    return {
      dayKey: dayKey(start),
      label: offset === 0 ? '今天' : `${date.getMonth() + 1}/${date.getDate()}`,
      retention: Math.round(average),
    };
  });
}

export function computeStudyStreakDays(logs: ReviewLog[], now: number): number {  const activeDays = new Set(
    logs.filter((log) => log.result !== 'skipped').map((log) => dayKey(log.reviewedAt)),
  );
  if (activeDays.size === 0) return 0;

  const todayStart = startOfDay(now);
  let cursor = activeDays.has(dayKey(todayStart)) ? todayStart : todayStart - DAY_MS;
  let streak = 0;

  while (activeDays.has(dayKey(cursor))) {
    streak += 1;
    cursor -= DAY_MS;
  }
  return streak;
}

export function computeMostWrong(
  logs: ReviewLog[],
  words: Word[],
  limit = 5,
): Array<{ wordId: string; word: string; wrongCount: number }> {
  const counts = new Map<string, number>();
  for (const log of logs) {
    if (log.result !== 'wrong') continue;
    counts.set(log.wordId, (counts.get(log.wordId) ?? 0) + 1);
  }

  const wordMap = new Map(words.map((word) => [word.id, word]));
  return [...counts.entries()]
    .map(([wordId, wrongCount]) => ({
      wordId,
      word: wordMap.get(wordId)?.word ?? '已删除词条',
      wrongCount,
    }))
    .sort((a, b) => b.wrongCount - a.wrongCount || a.word.localeCompare(b.word))
    .slice(0, limit);
}

export function computeStatistics(
  words: Word[],
  logs: ReviewLog[],
  now: number,
  goal: number,
  selectableWords: Word[] = words,
): StatisticsSummary {
  const answered = logs.filter((log) => log.result !== 'skipped');
  const correct = answered.filter((log) => log.result !== 'wrong').length;

  return {
    totalWords: words.length,
    totalReviews: answered.length,
    totalCorrect: correct,
    accuracy: calculateAccuracy(correct, answered.length),
    dueCount: selectableWords.filter((word) => word.nextReviewAt <= now).length,
    masteredCount: words.filter((word) => word.repetitions >= 3).length,
    today: computeTodayStats(logs, selectableWords, now, goal),
    last7Days: computeLast7Days(logs, now),
    dueForecast: computeDueForecast(selectableWords, now),
    retentionCurve: computeRetentionCurve(selectableWords, now),
    studyStreakDays: computeStudyStreakDays(logs, now),
    mostWrong: computeMostWrong(logs, words),
  };
}
