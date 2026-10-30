import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Icon } from '../../components/Icons';
import { LoadingState } from '../../components/LoadingState';
import { SpeakButton } from '../../components/SpeakButton';
import { maxRevealableLetters } from '../../domain/hintGenerator';
import { filterSelectableWords, isDue } from '../../domain/scheduler';
import { wordWithPoolState } from '../../domain/studyPools';
import { useSpeechAvailability } from '../../hooks/useSpeechAvailability';
import { audioService } from '../../services/audioService';
import { speechService } from '../../services/speechService';
import { useSettingsStore } from '../../stores/settingsStore';
import { formatNextReview, formatPercent, formatWeight } from '../../utils/date';
import { useWordStore } from '../words/wordStore';
import { AnswerInput } from './AnswerInput';
import { HintDisplay } from './HintDisplay';
import { StudyCard } from './StudyCard';
import { useStudyStore } from './studyStore';

function DifficultyMeter({ value }: { value: number }) {
  return (
    <span className="difficulty-meter" aria-label={`难度 ${value} / 5`} title={`难度 ${value} / 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} className={index < value ? 'is-on' : ''} />
      ))}
    </span>
  );
}

function SoundStatus() {
  const enabled = useSettingsStore((state) => state.settings.soundEnabled);
  const update = useSettingsStore((state) => state.update);

  return (
    <button
      className={`sound-status ${enabled ? 'is-on' : ''}`}
      onClick={async () => {
        await update({ soundEnabled: !enabled });
        audioService.setEnabled(!enabled);
      }}
      title="切换音效"
    >
      <Icon name={enabled ? 'sound' : 'mute'} size={15} />
      {enabled ? '音效 ON' : '音效 OFF'}
    </button>
  );
}

export function StudyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const startCategory = searchParams.get('category') ?? '';
  const modeParam = searchParams.get('mode');
  const explicitMode =
    modeParam === 'due'
      ? 'due'
      : modeParam === 'wrong'
        ? 'wrong'
        : startCategory
          ? 'category'
          : null;

  const words = useWordStore((state) => state.words);
  const groups = useWordStore((state) => state.groups);
  const loadWords = useWordStore((state) => state.load);

  const phase = useStudyStore((state) => state.phase);
  const questionNumber = useStudyStore((state) => state.questionNumber);
  const mode = useStudyStore((state) => state.mode);
  const category = useStudyStore((state) => state.category);
  const currentWord = useStudyStore((state) => state.currentWord);
  const currentQuestion = useStudyStore((state) => state.currentQuestion);
  const answer = useStudyStore((state) => state.answer);
  const hintUsed = useStudyStore((state) => state.hintUsed);
  const answeredCount = useStudyStore((state) => state.answeredCount);
  const correctCount = useStudyStore((state) => state.correctCount);
  const wrongCount = useStudyStore((state) => state.wrongCount);
  const streak = useStudyStore((state) => state.streak);
  const sessionWordIds = useStudyStore((state) => state.sessionWordIds);
  const sessionWrongWords = useStudyStore((state) => state.sessionWrongWords);
  const lastEvaluation = useStudyStore((state) => state.lastEvaluation);
  const lastApplication = useStudyStore((state) => state.lastApplication);
  const lastLog = useStudyStore((state) => state.lastLog);
  const error = useStudyStore((state) => state.error);
  const emptyReason = useStudyStore((state) => state.emptyReason);
  const startSession = useStudyStore((state) => state.startSession);
  const loadNextQuestion = useStudyStore((state) => state.loadNextQuestion);
  const setAnswer = useStudyStore((state) => state.setAnswer);
  const submitAnswer = useStudyStore((state) => state.submitAnswer);
  const giveUp = useStudyStore((state) => state.giveUp);
  const markAsSlip = useStudyStore((state) => state.markAsSlip);
  const retry = useStudyStore((state) => state.retry);
  const skipQuestion = useStudyStore((state) => state.skipQuestion);
  const requestExtraHint = useStudyStore((state) => state.requestExtraHint);

  const hintEnabled = useSettingsStore((state) => state.settings.hintEnabled);
  const autoNext = useSettingsStore((state) => state.settings.autoNextQuestion);
  const pronunciationEnabled = useSettingsStore(
    (state) => state.settings.pronunciationEnabled,
  );
  const autoPronounceEnabled = useSettingsStore(
    (state) => state.settings.autoPronounceEnabled,
  );
  const speechAvailable = useSpeechAvailability();
  const speechReady = pronunciationEnabled && speechAvailable;

  const inputRef = useRef<HTMLInputElement>(null);
  const startedKeyRef = useRef<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(explicitMode === null);

  useEffect(() => {
    void loadWords();
  }, [loadWords]);

  useEffect(() => {
    if (!explicitMode) return;
    const key = `${explicitMode}\u0000${startCategory}`;
    if (startedKeyRef.current === key) return;
    startedKeyRef.current = key;
    setChooserOpen(false);
    void startSession(explicitMode, startCategory);
  }, [explicitMode, startCategory, startSession]);

  useEffect(() => {
    if (explicitMode) return;
    if (startedKeyRef.current === null) return;
    startedKeyRef.current = null;
    setChooserOpen(true);
  }, [explicitMode]);

  const selectableWords = useMemo(
    () => filterSelectableWords(words, groups, 'practice'),
    [words, groups],
  );
  const dictationWords = useMemo(
    () => filterSelectableWords(words, groups, 'dictation'),
    [words, groups],
  );
  const dueCount = useMemo(() => {
    const now = Date.now();
    return selectableWords.filter((word) => isDue(word, now)).length;
  }, [selectableWords]);
  const nextDueAt = useMemo(() => {
    const now = Date.now();
    const upcoming = selectableWords
      .map((word) => word.nextReviewAt)
      .filter((at) => at > now)
      .sort((a, b) => a - b)[0];
    return upcoming ?? null;
  }, [selectableWords]);
  const poolNotice =
    selectableWords.length === 0 && dictationWords.length === 0
      ? '练习池和听写池都没有可用单词。请到词库勾选单词，或启用单词所在的分组。'
      : selectableWords.length === 0
        ? '练习池没有选中单词；听写池可独立使用。'
        : dictationWords.length === 0
          ? '听写池没有选中单词；练习池不受影响。'
          : null;

  useEffect(() => {
    if (phase === 'answering') {
      const frame = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [currentQuestion?.questionId, phase]);

  useEffect(() => {
    if (chooserOpen) return undefined;
    if ((phase !== 'correct' && phase !== 'wrong') || !currentWord) return undefined;

    let cancelled = false;
    let timer = 0;
    const scheduleAutoNext = () => {
      if (phase !== 'correct' || !autoNext) return;
      timer = window.setTimeout(() => {
        if (!cancelled) void loadNextQuestion();
      }, 1_350);
    };

    if (!speechReady || !autoPronounceEnabled) {
      scheduleAutoNext();
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
        speechService.stop();
      };
    }

    void (async () => {
      await audioService.waitForFeedback();
      if (cancelled) return;
      await speechService.speak(currentWord.word);
      if (cancelled) return;
      scheduleAutoNext();
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      speechService.stop();
    };
  }, [
    autoNext,
    autoPronounceEnabled,
    chooserOpen,
    currentWord,
    loadNextQuestion,
    phase,
    speechReady,
  ]);

  useEffect(() => {
    if (mode !== 'dictation' || phase !== 'answering' || !currentWord) return undefined;
    if (!speechReady) return undefined;

    const timer = window.setTimeout(() => {
      void speechService.speak(currentWord.word);
    }, 180);
    return () => {
      window.clearTimeout(timer);
      speechService.stop();
    };
  }, [currentWord, mode, phase, speechReady]);

  const replayWord = useCallback(() => {
    if (!speechReady || !currentWord) return;
    void speechService.speak(currentWord.word);
  }, [currentWord, speechReady]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || chooserOpen) return;
      const target = event.target as HTMLElement | null;
      const interactive = target?.closest(
        'input, textarea, select, button, a, [contenteditable="true"]',
      );

      if (
        (event.ctrlKey || event.metaKey) &&
        (event.code === 'Space' || event.key === ' ') &&
        speechReady &&
        currentWord
      ) {
        event.preventDefault();
        replayWord();
        return;
      }

      if (event.key === 'Escape') {
        if (phase === 'answering') {
          event.preventDefault();
          void skipQuestion();
        } else if (phase === 'correct' || phase === 'wrong' || phase === 'skipped') {
          event.preventDefault();
          void loadNextQuestion();
        }
        return;
      }

      if (interactive) return;

      if (event.key === '/') {
        event.preventDefault();
        inputRef.current?.focus();
        return;
      }
      if (event.key === 'h' || event.key === 'H') {
        event.preventDefault();
        requestExtraHint();
        return;
      }
      if (
        (event.key === 's' || event.key === 'S') &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        speechReady &&
        currentWord
      ) {
        event.preventDefault();
        replayWord();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        if (phase === 'answering') inputRef.current?.focus();
        else if (phase === 'correct' || phase === 'wrong' || phase === 'skipped')
          void loadNextQuestion();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    chooserOpen,
    currentWord,
    loadNextQuestion,
    phase,
    replayWord,
    requestExtraHint,
    skipQuestion,
    speechReady,
  ]);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await submitAnswer();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = () => {
    retry();
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleGiveUp = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await giveUp();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSlip = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await markAsSlip();
    } finally {
      setSubmitting(false);
    }
  };

  const beginMode = (nextMode: 'all' | 'due' | 'dictation') => {
    startedKeyRef.current = null;
    setChooserOpen(false);
    if (searchParams.toString()) navigate('/study', { replace: true });
    void startSession(nextMode);
  };

  const maxHints = useMemo(
    () => (currentWord ? maxRevealableLetters(currentWord.word) : 0),
    [currentWord],
  );
  const feedbackState =
    lastApplication?.word ??
    (currentWord
      ? wordWithPoolState(currentWord, mode === 'dictation' ? 'dictation' : 'practice')
      : null);
  const revealedCount = currentQuestion?.revealedIndexes.length ?? 0;
  const hintExhausted = revealedCount >= maxHints;
  const sessionAccuracy =
    answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

  const modeLabel =
    mode === 'due'
      ? '复习临期'
      : mode === 'dictation'
        ? '听写模式'
        : mode === 'wrong'
          ? '错题重练'
          : mode === 'category'
            ? category || '分类练习'
            : '无尽模式';

  const header = (
    <header className="study-top">
      <Link to="/" className="back-link">
        <Icon name="arrow-left" size={16} /> 返回书桌
      </Link>
      <div className="study-top__center">
        <span className="study-mode">
          {mode === 'dictation' ? '听音拼写' : '汉译英'} · {modeLabel}
        </span>
        <span className="study-progress-text">
          {currentQuestion ? `第 ${questionNumber} 题` : '准备中'}
        </span>
      </div>
      <div className="study-top__right">
        <button
          type="button"
          className="text-link study-mode-switch"
          onClick={() => {
            speechService.stop();
            setChooserOpen(true);
          }}
        >
          更换模式
        </button>
        <SoundStatus />
      </div>
    </header>
  );

  if (chooserOpen) {
    const hasActiveSession =
      phase === 'answering' || phase === 'correct' || phase === 'wrong' || phase === 'skipped';
    return (
      <div className="study-page page-enter">
        <header className="study-top">
          <Link to="/" className="back-link">
            <Icon name="arrow-left" size={16} /> 返回书桌
          </Link>
          <div className="study-top__center">
            <span className="study-mode">练习模式</span>
            <span className="study-progress-text">选择今天的练习节奏</span>
          </div>
          <SoundStatus />
        </header>

        <section className="panel panel--paper mode-chooser">
          <div className="mode-chooser__head">
            <div>
              <p className="eyebrow">PRACTICE MODE · 练习方式</p>
              <h1>今天怎么练？</h1>
            </div>
            {hasActiveSession ? (
              <button
                type="button"
                className="text-link"
                onClick={() => setChooserOpen(false)}
              >
                返回当前练习
              </button>
            ) : null}
          </div>
          <p className="mode-chooser__lead">
            三种练法随时可换。练习池共用一套权重与遗忘曲线，听写池独立勾选、独立计算；当前练习池{' '}
            {selectableWords.length} 个词（{dueCount} 个到期），听写池 {dictationWords.length} 个词。
          </p>

          <div className="mode-chooser__grid">
            <article className="mode-option">
              <div className="mode-option__head">
                <span className="mode-option__icon">
                  <Icon name="target" size={20} />
                </span>
                <div>
                  <h2>无尽模式</h2>
                  <p className="mode-option__eyebrow">ENDLESS · 一直出题</p>
                </div>
              </div>
              <p className="mode-option__copy">
                按权重随机抽词，一题接一题，没有终点。答错或久未复习的词权重更高，会更早回到题面。
              </p>
              <dl className="mode-option__stats">
                <div>
                  <dt>可练习</dt>
                  <dd>{selectableWords.length} 个词</dd>
                </div>
                <div>
                  <dt>结束条件</dt>
                  <dd>手动离开</dd>
                </div>
              </dl>
              <Button
                variant="primary"
                size="lg"
                className="mode-option__cta"
                onClick={() => beginMode('all')}
                disabled={selectableWords.length === 0}
                icon={<Icon name="arrow-right" size={16} />}
              >
                进入无尽模式
              </Button>
            </article>

            <article className={`mode-option mode-option--due ${dueCount === 0 ? 'is-muted' : ''}`}>
              <div className="mode-option__head">
                <span className="mode-option__icon">
                  <Icon name="clock" size={20} />
                </span>
                <div>
                  <h2>复习临期</h2>
                  <p className="mode-option__eyebrow">REVIEW DUE · 清掉到期</p>
                </div>
              </div>
              <p className="mode-option__copy">
                只抽已经到复习时间的单词，清完就结束。适合先把今天该复习的欠账补齐，再决定要不要加练。
              </p>
              <dl className="mode-option__stats">
                <div>
                  <dt>已到期</dt>
                  <dd>{dueCount} 个词</dd>
                </div>
                <div>
                  <dt>下次到期</dt>
                  <dd>{nextDueAt ? formatNextReview(nextDueAt, Date.now()) : '—'}</dd>
                </div>
              </dl>
              <Button
                size="lg"
                className="mode-option__cta"
                onClick={() => beginMode('due')}
                disabled={dueCount === 0}
                icon={<Icon name="clock" size={16} />}
              >
                {dueCount === 0 ? '暂无到期单词' : `开始复习 · ${dueCount}`}
              </Button>
            </article>

            <article
              className={`mode-option mode-option--dictation ${
                speechReady && dictationWords.length > 0 ? '' : 'is-muted'
              }`}
            >
              <div className="mode-option__head">
                <span className="mode-option__icon">
                  <Icon name="sound" size={20} />
                </span>
                <div>
                  <h2>听写模式</h2>
                  <p className="mode-option__eyebrow">DICTATION · 听音拼写</p>
                </div>
              </div>
              <p className="mode-option__copy">
                不显示中文释义，自动播放单词读音，只凭耳朵拼出英文。听写池单独勾选，权重与复习节奏独立记录，不会影响练习进度。
              </p>
              <dl className="mode-option__stats">
                <div>
                  <dt>可听写</dt>
                  <dd>{dictationWords.length} 个词</dd>
                </div>
                <div>
                  <dt>读音</dt>
                  <dd>{speechReady ? '自动播放' : '不可用'}</dd>
                </div>
              </dl>
              <Button
                size="lg"
                className="mode-option__cta"
                onClick={() => beginMode('dictation')}
                disabled={!speechReady || dictationWords.length === 0}
                icon={<Icon name="sound" size={16} />}
              >
                {speechReady
                  ? dictationWords.length === 0
                    ? '听写池没有选中单词'
                    : '进入听写模式'
                  : '需要可用英文语音'}
              </Button>
            </article>
          </div>

          {!speechReady ? (
            <p className="mode-chooser__note" role="status">
              听写模式需要系统英文语音，并开启设置中的「单词朗读」。
              <button type="button" className="text-link" onClick={() => navigate('/settings')}>
                去声音设置
              </button>
            </p>
          ) : null}

          {poolNotice ? (
            <p className="mode-chooser__warning" role="status">
              {poolNotice}
              <button type="button" className="text-link" onClick={() => navigate('/words')}>
                去词库
              </button>
            </p>
          ) : null}
        </section>
      </div>
    );
  }

  if (phase === 'idle' || (phase === 'loading' && !currentQuestion)) {
    return (
      <div className="study-page page-enter">
        {header}
        <LoadingState label="正在抽取下一张卡片…" />
      </div>
    );
  }

  if (phase === 'completed') {
    const dueDone = mode === 'due' && !error && answeredCount > 0;
    const dueEmpty = mode === 'due' && !error && answeredCount === 0;
    const wrongSummary = mode === 'wrong' && !error && emptyReason === null;
    const plannedCount = sessionWordIds?.length ?? answeredCount;
    return (
      <div className="study-page page-enter">
        {header}
        {wrongSummary ? (
          <section className="panel panel--paper study-summary">
            <p className="eyebrow">SESSION REPORT · 错题复习单</p>
            <h2>错题重练完成</h2>
            <p className="study-summary__lead">
              本组共 {plannedCount} 个词，已作答 {answeredCount} 题，正确率{' '}
              {formatPercent(sessionAccuracy)}。
            </p>
            <div className="summary-grid">
              <div>
                <span>计划词数</span>
                <strong>{plannedCount}</strong>
              </div>
              <div>
                <span>已作答</span>
                <strong>{answeredCount}</strong>
              </div>
              <div>
                <span>答对</span>
                <strong>{correctCount}</strong>
              </div>
              <div>
                <span>答错</span>
                <strong>{wrongCount}</strong>
              </div>
            </div>
            {sessionWrongWords.length > 0 ? (
              <div className="summary-wrong">
                <h3>本次仍答错的词 · {sessionWrongWords.length}</h3>
                <div className="summary-chips">
                  {sessionWrongWords.map((item) => (
                    <span key={item.id} className="summary-chip">
                      {item.word}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="study-summary__note">本次没有错题，错题簿清了一页。</p>
            )}
            <div className="form-actions study-summary__actions">
              {sessionWrongWords.length > 0 ? (
                <Button
                  variant="primary"
                  onClick={() =>
                    void startSession(
                      'wrong',
                      '',
                      sessionWrongWords.map((item) => item.id),
                    )
                  }
                  icon={<Icon name="refresh" size={15} />}
                >
                  只练本次错题 · {sessionWrongWords.length}
                </Button>
              ) : null}
              <Button onClick={() => void startSession('wrong')} icon={<Icon name="target" size={15} />}>
                再练全部错题
              </Button>
              <Button onClick={() => setChooserOpen(true)} icon={<Icon name="cards" size={15} />}>
                更换模式
              </Button>
              <Button onClick={() => navigate('/stats')} icon={<Icon name="chart" size={15} />}>
                查看统计
              </Button>
              <Button onClick={() => navigate('/')} icon={<Icon name="home" size={15} />}>
                返回书桌
              </Button>
            </div>
          </section>
        ) : (
          <section className="panel panel--paper study-end">
            <EmptyState
              icon={
                error
                  ? 'x'
                  : dueDone || mode === 'all' || mode === 'category'
                    ? 'check'
                    : dueEmpty
                      ? 'clock'
                      : 'book'
              }
              title={
                error
                  ? '题目加载失败'
                  : dueDone
                    ? '到期复习完成'
                    : dueEmpty
                      ? '没有到期单词'
                      : mode === 'wrong'
                        ? '没有错题可重练'
                        : '本组练习完成'
              }
              description={
                error ??
                (dueDone
                  ? `本次清掉 ${answeredCount} 题，正确率 ${formatPercent(sessionAccuracy)}。`
                  : emptyReason ??
                    `本组共作答 ${answeredCount} 题，正确率 ${formatPercent(sessionAccuracy)}。`)
              }
            >
              {error ? (
                <Button variant="primary" onClick={() => void loadNextQuestion()} icon={<Icon name="refresh" />}>
                  重新加载
                </Button>
              ) : (
                <>
                  <Button variant="primary" onClick={() => navigate('/')} icon={<Icon name="home" />}>
                    返回书桌
                  </Button>
                  <Button onClick={() => navigate('/words')} icon={<Icon name="book" />}>
                    管理词库
                  </Button>
                  {mode === 'due' || mode === 'wrong' ? (
                    <Button onClick={() => beginMode('all')} icon={<Icon name="target" />}>
                      进入无尽模式
                    </Button>
                  ) : null}
                  <Button onClick={() => setChooserOpen(true)} icon={<Icon name="cards" />}>
                    更换模式
                  </Button>
                </>
              )}
            </EmptyState>
          </section>
        )}
      </div>
    );
  }

  if (!currentWord || !currentQuestion) {
    return (
      <div className="study-page page-enter">
        {header}
        <LoadingState label="正在整理纸张…" />
      </div>
    );
  }

  const isAnswering = phase === 'answering';
  const isCorrect = phase === 'correct';
  const isWrong = phase === 'wrong';
  const isSkipped = phase === 'skipped';
  const gaveUp = isWrong && lastLog?.answerText === '';
  const primaryMeaning = currentQuestion.meanings[0] ?? '';
  const secondaryMeanings = currentQuestion.meanings.slice(1);
  const dictationLetterCount = currentWord.word.replace(/[^a-z]/gi, '').length;

  return (
    <div className="study-page page-enter">
      {header}

      <div className="study-layout">
        <div className="study-main">
          <StudyCard status={isCorrect ? 'correct' : isWrong ? 'wrong' : 'neutral'}>
            <div className="study-card__top">
              <div className="study-tags">
                <span className="tag">{currentQuestion.category}</span>
                <span className="tag tag--quiet">
                  难度 <DifficultyMeter value={currentQuestion.difficulty} />
                </span>
                {hintUsed ? <span className="tag tag--accent">已请求额外提示</span> : null}
              </div>
              <span className="study-card__serial">
                {currentQuestion.wordId.slice(-4).toUpperCase()}
              </span>
            </div>

            {mode === 'dictation' ? (
              <div className="meaning-block dictation-block">
                <p className="eyebrow">听写 · LISTEN &amp; SPELL</p>
                <h1>听读音，写出单词</h1>
                <div className="dictation-controls">
                  <button
                    type="button"
                    className="dictation-replay"
                    onClick={replayWord}
                    disabled={!speechReady}
                    title="重播读音（S / Ctrl+Space）"
                  >
                    <Icon name="sound" size={15} />
                    重播读音
                    <kbd>S</kbd>
                  </button>
                  <span className="dictation-meta">
                    共 {dictationLetterCount} 个字母 · 读音已自动播放
                  </span>
                </div>
              </div>
            ) : (
              <div className="meaning-block">
                <p className="eyebrow">中文释义 · MEANING</p>
                <h1>{primaryMeaning}</h1>
                {secondaryMeanings.length > 0 ? (
                  <p className="meaning-extra">{secondaryMeanings.join(' · ')}</p>
                ) : null}
              </div>
            )}

            <div className="hint-block">
              <div className="hint-block__head">
                <span className="hint-block__label">
                  字母提示
                  <small>
                    {revealedCount} / {Math.max(1, maxHints)} 个字母
                  </small>
                </span>
                <button
                  className="text-link"
                  onClick={() => requestExtraHint()}
                  disabled={!isAnswering || hintExhausted || !hintEnabled}
                  title={hintEnabled ? '再揭示一个字母（H）' : '提示已在设置中关闭'}
                >
                  <Icon name="hint" size={14} />
                  {hintExhausted ? '提示已满' : '再提示一个字母'}
                </button>
              </div>
              <HintDisplay
                displayChars={currentQuestion.displayChars}
                ariaLabel={currentQuestion.maskedWord}
                disabled={!hintEnabled}
              />
            </div>

            <AnswerInput
              value={isAnswering || isSkipped ? answer : lastLog?.answerText ?? answer}
              onChange={setAnswer}
              onEnter={() => {
                if (isAnswering) void handleSubmit();
                else if (isCorrect || isWrong || isSkipped) void loadNextQuestion();
              }}
              inputRef={inputRef}
              disabled={!isAnswering}
              status={isCorrect ? 'correct' : isWrong ? 'wrong' : 'idle'}
              hintUsed={hintUsed}
            />

            {error && (isAnswering || isWrong) ? (
              <p className="inline-error" role="alert">
                {error}
              </p>
            ) : null}

            {isAnswering ? (
              <div className="study-actions">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => {
                    audioService.playSubmit();
                    void handleSubmit();
                  }}
                  disabled={submitting || !answer.trim()}
                  icon={<Icon name="enter" size={17} />}
                >
                  {submitting ? '正在落墨…' : '提交答案'}
                </Button>
                <Button
                  size="lg"
                  onClick={() => void handleGiveUp()}
                  disabled={submitting}
                  icon={<Icon name="question" size={16} />}
                  title="直接查看标准答案，并按答错记录"
                >
                  我不会
                </Button>
                <Button size="lg" onClick={() => void skipQuestion()} icon={<Icon name="skip" size={16} />}>
                  跳过
                </Button>
                <span className="study-actions__hint">
                  <kbd>Enter</kbd> 提交 <kbd>Esc</kbd> 跳过
                </span>
              </div>
            ) : isSkipped ? (
              <div className="feedback feedback--skipped" role="status" aria-live="polite">
                <div className="feedback__stamp">
                  <Icon name="skip" size={18} />
                  SKIPPED
                </div>
                <div className="feedback__copy">
                  <h3>已按「手滑」跳过，本题不计入成绩。</h3>
                  <p>单词状态保持作答前的样子，不会降低权重，也不会写入错题统计。</p>
                </div>

                {currentWord.notes ? (
                  <div className="word-forms">
                    <span className="word-forms__label">词形变化 · 备注</span>
                    <p>{currentWord.notes}</p>
                  </div>
                ) : null}
                {currentWord.exampleSentence ? (
                  <p className="word-note">
                    <span>例句</span> {currentWord.exampleSentence}
                    <SpeakButton
                      text={currentWord.exampleSentence}
                      label="例句"
                      ariaLabel="朗读例句"
                      showLabel
                    />
                  </p>
                ) : null}

                <dl className="feedback__grid">
                  <div>
                    <dt>标准答案</dt>
                    <dd className="answer-word">
                      {currentWord.word}
                      {currentWord.phonetic ? <span> {currentWord.phonetic}</span> : null}
                      <SpeakButton text={currentWord.word} />
                    </dd>
                  </div>
                  <div>
                    <dt>本次输入</dt>
                    <dd className="answer-slip">{answer || '（空）'}</dd>
                  </div>
                  <div>
                    <dt>当前状态</dt>
                    <dd>
                      权重 {formatWeight(feedbackState?.weight ?? currentWord.weight)} · 已答题{' '}
                      {feedbackState?.attemptCount ?? currentWord.attemptCount} 次
                    </dd>
                  </div>
                </dl>

                <div className="feedback__actions">
                  <Button
                    variant="primary"
                    onClick={() => void loadNextQuestion()}
                    icon={<Icon name="enter" size={16} />}
                  >
                    下一题
                  </Button>
                  <span className="auto-next">本题不会计入右侧的本次统计。</span>
                </div>
              </div>
            ) : (
              <div className={`feedback feedback--${isCorrect ? 'correct' : 'wrong'}`} role="status" aria-live="polite">
                <div className="feedback__stamp">
                  <Icon name={isCorrect ? 'check' : 'x'} size={18} />
                  {isCorrect ? 'CORRECT' : gaveUp ? 'NOT YET' : 'INCORRECT'}
                </div>
                <div className="feedback__copy">
                  <h3>
                    {isCorrect
                      ? lastEvaluation?.result === 'correct_with_hint'
                        ? '敲对了，但提示帮了忙。'
                        : '敲对了，记忆又深了一分。'
                      : gaveUp
                        ? '没关系，先认识一下这个词。'
                        : '这次没有敲对，再看一眼。'}
                  </h3>
                  <p>
                    {isCorrect
                      ? `连续答对 ${feedbackState?.consecutiveCorrect ?? currentWord.consecutiveCorrect} 次。`
                      : gaveUp
                        ? '已按答错记录，这道题很快会再次出现。'
                        : '拼写需要完全一致；空格与连字符也会参与判断。只是手滑打错，可选下方「手滑打错了」。'}
                  </p>
                </div>

                {currentWord.notes ? (
                  <div className="word-forms">
                    <span className="word-forms__label">词形变化 · 备注</span>
                    <p>{currentWord.notes}</p>
                  </div>
                ) : null}
                {currentWord.exampleSentence ? (
                  <p className="word-note">
                    <span>例句</span> {currentWord.exampleSentence}
                    <SpeakButton
                      text={currentWord.exampleSentence}
                      label="例句"
                      ariaLabel="朗读例句"
                      showLabel
                    />
                  </p>
                ) : null}

                <dl className="feedback__grid">
                  <div>
                    <dt>标准答案</dt>
                    <dd className="answer-word">
                      {lastApplication?.word.word}
                      {currentWord.phonetic ? <span> {currentWord.phonetic}</span> : null}
                      <SpeakButton text={lastApplication?.word.word ?? currentWord.word} />
                    </dd>
                  </div>
                  {!isCorrect ? (
                    <div>
                      <dt>{gaveUp ? '你的选择' : '你的输入'}</dt>
                      <dd className="answer-wrong">{gaveUp ? '（我不会）' : lastLog?.answerText || '（空）'}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>权重变化</dt>
                    <dd>
                      {formatWeight(lastApplication?.weightBefore ?? feedbackState?.weight ?? currentWord.weight)} →{' '}
                      <strong>
                        {formatWeight(lastApplication?.weightAfter ?? feedbackState?.weight ?? currentWord.weight)}
                      </strong>
                    </dd>
                  </div>
                  <div>
                    <dt>下次复习</dt>
                    <dd>
                      {formatNextReview(
                        lastApplication?.nextReviewAt ??
                          feedbackState?.nextReviewAt ??
                          currentWord.nextReviewAt,
                        Date.now(),
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>答题次数</dt>
                    <dd>{feedbackState?.attemptCount ?? currentWord.attemptCount}</dd>
                  </div>
                  <div>
                    <dt>累计正确率</dt>
                    <dd>
                      {formatPercent(
                        feedbackState && feedbackState.attemptCount > 0
                          ? (feedbackState.correctCount / feedbackState.attemptCount) * 100
                          : 0,
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="feedback__actions">
                  <Button
                    variant="primary"
                    onClick={() => void loadNextQuestion()}
                    icon={<Icon name="enter" size={16} />}
                  >
                    下一题
                  </Button>
                  {isWrong && !gaveUp ? (
                    <Button
                      onClick={() => void handleSlip()}
                      disabled={submitting}
                      icon={<Icon name="edit" size={15} />}
                      title="本次不计入成绩，按跳过处理"
                    >
                      手滑打错了
                    </Button>
                  ) : null}
                  {isWrong ? (
                    <Button onClick={handleRetry} icon={<Icon name="refresh" size={15} />}>
                      再试一次
                    </Button>
                  ) : null}
                  {autoNext && isCorrect ? (
                    <span className="auto-next">即将自动进入下一题…</span>
                  ) : null}
                </div>
              </div>
            )}
          </StudyCard>
        </div>

        <aside className="study-aside">
          <section className="panel session-panel">
            <p className="eyebrow">THIS SESSION</p>
            <div className="session-stats">
              <div>
                <span>已作答</span>
                <strong>{answeredCount}</strong>
              </div>
              <div>
                <span>正确率</span>
                <strong>{formatPercent(sessionAccuracy)}</strong>
              </div>
              <div>
                <span>连击</span>
                <strong>{streak}</strong>
              </div>
              <div>
                <span>错题</span>
                <strong>{wrongCount}</strong>
              </div>
            </div>
            <div className="session-rule" />
            <p className="session-note">
              {mode === 'wrong'
                ? '错题重练按本轮快照逐个过一遍，每个词只出现一次；答错与跳过的词会记入完成汇总。'
                : '题目按“权重 × 遗忘系数 × 到期系数”抽取；最近 3 题会短暂冷却。'}
            </p>
          </section>

          <section className="panel shortcut-panel">
            <p className="eyebrow">KEYS</p>
            <ul>
              <li><kbd>Enter</kbd><span>提交 / 下一题</span></li>
              <li><kbd>Esc</kbd><span>跳过当前题</span></li>
              <li><kbd>H</kbd><span>额外提示（输入框外）</span></li>
              <li><kbd>/</kbd><span>聚焦答案框</span></li>
              {speechReady ? (
                <li><kbd>S</kbd><span>重播读音 · 或 Ctrl+Space</span></li>
              ) : null}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
