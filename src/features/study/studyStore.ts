import { create } from 'zustand';
import { evaluateAnswer } from '../../domain/answerEvaluator';
import { revealAdditionalHint } from '../../domain/hintGenerator';
import { filterSelectableWords, filterWordsForStudy, selectNextWord, systemRandom } from '../../domain/scheduler';
import { mergePoolReview, stateForPool, wordWithPoolState } from '../../domain/studyPools';
import type {
  AnswerEvaluation,
  ReviewApplication,
  ReviewLog,
  StudyMode,
  StudyPool,
  StudyQuestion,
  Word,
} from '../../domain/types';
import { applyReview } from '../../domain/weightCalculator';
import { audioService } from '../../services/audioService';
import { repository } from '../../services/repository';
import { speechService } from '../../services/speechService';
import { buildReviewLog, buildSkipLog, buildStudyQuestion } from '../../services/studyService';
import { useSettingsStore } from '../../stores/settingsStore';

export type StudyPhase = 'idle' | 'loading' | 'answering' | 'correct' | 'wrong' | 'skipped' | 'completed';

interface ReviewSnapshot {
  word: Word;
  answeredCount: number;
  correctCount: number;
  wrongCount: number;
  streak: number;
}

interface StudyState {
  mode: StudyMode;
  category: string;
  phase: StudyPhase;
  questionNumber: number;
  currentWord: Word | null;
  currentQuestion: StudyQuestion | null;
  answer: string;
  hintUsed: boolean;
  recentWordIds: string[];
  sessionWordIds: string[] | null;
  sessionInitialized: boolean;
  seenWordIds: string[];
  sessionWrongWords: Array<{ id: string; word: string }>;
  answeredCount: number;
  correctCount: number;
  wrongCount: number;
  streak: number;
  lastEvaluation: AnswerEvaluation | null;
  lastApplication: ReviewApplication | null;
  lastLog: ReviewLog | null;
  preReview: ReviewSnapshot | null;
  error: string | null;
  emptyReason: string | null;

  startSession: (mode: StudyMode, category?: string, wordIds?: string[]) => Promise<void>;
  loadNextQuestion: () => Promise<void>;
  setAnswer: (value: string) => void;
  submitAnswer: () => Promise<boolean>;
  giveUp: () => Promise<boolean>;
  markAsSlip: () => Promise<boolean>;
  retry: () => void;
  skipQuestion: () => Promise<void>;
  requestExtraHint: () => boolean;
  reset: () => void;
}

function pushRecent(recent: string[], wordId: string): string[] {
  return [...recent.filter((id) => id !== wordId), wordId].slice(-3);
}

function poolForMode(mode: StudyMode): StudyPool {
  return mode === 'dictation' ? 'dictation' : 'practice';
}

function upsertWrongWord(
  items: Array<{ id: string; word: string }>,
  word: Word,
): Array<{ id: string; word: string }> {
  return items.some((item) => item.id === word.id)
    ? items.map((item) => (item.id === word.id ? { id: word.id, word: word.word } : item))
    : [...items, { id: word.id, word: word.word }];
}

export const useStudyStore = create<StudyState>((set, get) => ({
  mode: 'all',
  category: '',
  phase: 'idle',
  questionNumber: 0,
  currentWord: null,
  currentQuestion: null,
  answer: '',
  hintUsed: false,
  recentWordIds: [],
  sessionWordIds: null,
  sessionInitialized: false,
  seenWordIds: [],
  sessionWrongWords: [],
  answeredCount: 0,
  correctCount: 0,
  wrongCount: 0,
  streak: 0,
  lastEvaluation: null,
  lastApplication: null,
  lastLog: null,
  preReview: null,
  error: null,
  emptyReason: null,

  startSession: async (mode, category = '', wordIds) => {
    speechService.stop();
    set({
      mode,
      category,
      phase: 'loading',
      questionNumber: 0,
      currentWord: null,
      currentQuestion: null,
      answer: '',
      hintUsed: false,
      recentWordIds: [],
      sessionWordIds: wordIds ?? null,
      sessionInitialized: wordIds !== undefined,
      seenWordIds: [],
      sessionWrongWords: [],
      answeredCount: 0,
      correctCount: 0,
      wrongCount: 0,
      streak: 0,
      lastEvaluation: null,
      lastApplication: null,
      lastLog: null,
      preReview: null,
      error: null,
      emptyReason: null,
    });
    await get().loadNextQuestion();
  },

  loadNextQuestion: async () => {
    speechService.stop();
    set({ phase: 'loading', error: null, answer: '', hintUsed: false, preReview: null });
    try {
      const [words, groups] = await Promise.all([
        repository.listWords(),
        repository.listGroups(),
      ]);
      const now = Date.now();
      const { mode, category, recentWordIds, seenWordIds, sessionInitialized } = get();
      const studyPool = poolForMode(mode);
      const selectable = filterSelectableWords(words, groups, studyPool);
      let sessionIds = get().sessionWordIds;
      let initialized = sessionInitialized;

      if (mode === 'wrong' && !initialized) {
        sessionIds = filterWordsForStudy(selectable, { mode, category, now }).map(
          (word) => word.id,
        );
        initialized = true;
        set({ sessionWordIds: sessionIds, sessionInitialized: true });
      }

      const candidates = filterWordsForStudy(selectable, {
        mode,
        category,
        now,
        wordIds: mode === 'wrong' ? (sessionIds ?? []) : undefined,
      });
      const seen = new Set(seenWordIds);
      const poolWords =
        mode === 'wrong' ? candidates.filter((word) => !seen.has(word.id)) : candidates;

      if (poolWords.length === 0) {
        const noWrongWords = mode === 'wrong' && (sessionIds?.length ?? 0) === 0;
        const finishedWrongSession = mode === 'wrong' && !noWrongWords;
        set({
          phase: 'completed',
          currentWord: null,
          currentQuestion: null,
          emptyReason: finishedWrongSession
            ? null
            : noWrongWords
              ? '当前没有可重练的错题。等练习中出现答错的单词，这里会自动收集。'
              : words.length === 0
                ? '词库还是空的。请先添加单词，或到设置中恢复初始词库。'
                : selectable.length === 0
                  ? studyPool === 'dictation'
                    ? '听写池还没有选中单词。请到词库切换到听写池，勾选要听写的单词，或启用所在分组。'
                    : '所有单词都已取消勾选。请到词库勾选要练习的单词，或启用所在分组。'
                  : mode === 'due'
                    ? '暂时没有到期单词。可以先进行全部练习，或稍后再来。'
                    : mode === 'dictation'
                      ? '当前没有可听写的单词。请到词库勾选单词，或启用所在分组。'
                      : '当前分类下没有可练习的单词。',
        });
        return;
      }

      const selection = selectNextWord(poolWords, {
        now,
        recentWordIds,
        random: systemRandom,
        stateOf: (word: Word) => stateForPool(word, studyPool),
      });
      if (!selection) {
        set({ phase: 'completed', emptyReason: '暂时无法抽取题目。' });
        return;
      }

      const question = buildStudyQuestion(selection.word, {
        now,
        hintsEnabled: useSettingsStore.getState().settings.hintEnabled,
        random: systemRandom,
      });

      set({
        phase: 'answering',
        questionNumber: get().questionNumber + 1,
        currentWord: selection.word,
        currentQuestion: question,
        answer: '',
        hintUsed: false,
        recentWordIds: pushRecent(recentWordIds, selection.word.id),
        seenWordIds:
          mode === 'wrong' ? [...seenWordIds, selection.word.id] : seenWordIds,
        lastEvaluation: null,
        lastApplication: null,
        lastLog: null,
        preReview: null,
        error: null,
        emptyReason: null,
      });
    } catch (error) {
      set({
        phase: 'completed',
        error: error instanceof Error ? error.message : '题目加载失败',
      });
    }
  },

  setAnswer: (value) => set({ answer: value }),

  submitAnswer: async () => {
    const state = get();
    if (state.phase !== 'answering' || !state.currentWord || !state.currentQuestion) return false;

    const input = state.answer.trim();
    if (!input) {
      set({ error: '请先输入答案再提交。' });
      return false;
    }

    set({ error: null });
    const now = Date.now();
    const studyPool = poolForMode(state.mode);
    const evaluation = evaluateAnswer(state.currentWord, input, state.hintUsed);
    const application = applyReview(wordWithPoolState(state.currentWord, studyPool), evaluation.result, now);
    const savedWord = mergePoolReview(state.currentWord, application.word, studyPool);
    const log = buildReviewLog(application, evaluation, input, state.hintUsed, now);
    const snapshot: ReviewSnapshot = {
      word: state.currentWord,
      answeredCount: state.answeredCount,
      correctCount: state.correctCount,
      wrongCount: state.wrongCount,
      streak: state.streak,
    };

    try {
      await repository.submitReview(savedWord, log);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '答案保存失败，请重试。' });
      return false;
    }

    const correct = evaluation.result !== 'wrong';
    set({
      phase: correct ? 'correct' : 'wrong',
      currentWord: savedWord,
      answer: input,
      lastEvaluation: evaluation,
      lastApplication: application,
      lastLog: log,
      preReview: snapshot,
      sessionWrongWords: correct
        ? state.sessionWrongWords
        : upsertWrongWord(state.sessionWrongWords, application.word),
      answeredCount: state.answeredCount + 1,
      correctCount: state.correctCount + (correct ? 1 : 0),
      wrongCount: state.wrongCount + (correct ? 0 : 1),
      streak: correct ? state.streak + 1 : 0,
    });

    if (correct) audioService.playCorrect();
    else audioService.playWrong();

    return true;
  },

  giveUp: async () => {
    const state = get();
    if (state.phase !== 'answering' || !state.currentWord || !state.currentQuestion) return false;

    set({ error: null });
    const now = Date.now();
    const studyPool = poolForMode(state.mode);
    const evaluation = evaluateAnswer(state.currentWord, '', state.hintUsed);
    const application = applyReview(wordWithPoolState(state.currentWord, studyPool), evaluation.result, now);
    const savedWord = mergePoolReview(state.currentWord, application.word, studyPool);
    const log = buildReviewLog(application, evaluation, '', state.hintUsed, now);
    const snapshot: ReviewSnapshot = {
      word: state.currentWord,
      answeredCount: state.answeredCount,
      correctCount: state.correctCount,
      wrongCount: state.wrongCount,
      streak: state.streak,
    };

    try {
      await repository.submitReview(savedWord, log);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '答案保存失败，请重试。' });
      return false;
    }

    set({
      phase: 'wrong',
      currentWord: savedWord,
      answer: '',
      lastEvaluation: evaluation,
      lastApplication: application,
      lastLog: log,
      preReview: snapshot,
      sessionWrongWords: upsertWrongWord(state.sessionWrongWords, application.word),
      answeredCount: state.answeredCount + 1,
      wrongCount: state.wrongCount + 1,
      streak: 0,
    });

    audioService.playWrong();
    return true;
  },

  markAsSlip: async () => {
    const state = get();
    if (state.phase !== 'wrong' || !state.preReview || !state.lastLog) return false;
    if (state.lastLog.result !== 'wrong' || state.lastLog.answerText === '') return false;
    speechService.stop();

    const now = Date.now();
    const studyPool = poolForMode(state.mode);
    const skipLog = buildSkipLog(wordWithPoolState(state.preReview.word, studyPool), now);

    try {
      await repository.undoReview(state.lastLog.id, state.preReview.word, skipLog);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '撤销失败，请重试。' });
      return false;
    }

    set({
      phase: 'skipped',
      currentWord: state.preReview.word,
      lastEvaluation: null,
      lastApplication: null,
      lastLog: skipLog,
      sessionWrongWords: state.sessionWrongWords.filter(
        (item) => item.id !== state.preReview?.word.id,
      ),
      answeredCount: state.preReview.answeredCount,
      correctCount: state.preReview.correctCount,
      wrongCount: state.preReview.wrongCount,
      streak: state.preReview.streak,
      error: null,
    });
    return true;
  },

  retry: () => {
    if (get().phase !== 'wrong') return;
    speechService.stop();
    set({
      phase: 'answering',
      answer: '',
      error: null,
      lastEvaluation: null,
      lastApplication: null,
      lastLog: null,
    });
  },

  skipQuestion: async () => {
    const state = get();
    if (!state.currentWord || !state.currentQuestion) return;
    if (state.phase === 'loading' || state.phase === 'completed') return;
    speechService.stop();

    try {
      const now = Date.now();
      const studyPool = poolForMode(state.mode);
      const log = buildSkipLog(wordWithPoolState(state.currentWord, studyPool), now);
      await repository.submitReview(state.currentWord, log);
      await get().loadNextQuestion();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '跳过失败，请重试。' });
    }
  },

  requestExtraHint: () => {
    const state = get();
    if (state.phase !== 'answering' || !state.currentWord || !state.currentQuestion) return false;
    if (!useSettingsStore.getState().settings.hintEnabled) return false;

    const next = revealAdditionalHint(
      state.currentWord.word,
      state.currentQuestion.revealedIndexes,
      systemRandom,
    );
    if (!next) return false;

    set({
      hintUsed: true,
      currentQuestion: {
        ...state.currentQuestion,
        displayChars: next.displayChars,
        revealedIndexes: next.revealedIndexes,
        maskedWord: next.maskedWord,
      },
    });
    audioService.playSubmit();
    return true;
  },

  reset: () => {
    speechService.stop();
    set({
      phase: 'idle',
      questionNumber: 0,
      currentWord: null,
      currentQuestion: null,
      answer: '',
      hintUsed: false,
      recentWordIds: [],
      sessionWordIds: null,
      sessionInitialized: false,
      seenWordIds: [],
      sessionWrongWords: [],
      answeredCount: 0,
      correctCount: 0,
      wrongCount: 0,
      streak: 0,
      lastEvaluation: null,
      lastApplication: null,
      lastLog: null,
      preReview: null,
      error: null,
      emptyReason: null,
    });
  },
}));
