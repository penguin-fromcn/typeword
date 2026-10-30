import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icons';
import { SpeakButton } from '../../components/SpeakButton';
import type { CardDirection } from '../../domain/cardDeck';
import { MARK_LABELS, MARK_OPTIONS } from '../../domain/marks';
import type { ReviewLogResult, Word, WordGroup, WordMark } from '../../domain/types';
import { speechService } from '../../services/speechService';
import { useUiStore } from '../../stores/uiStore';
import {
  formatDate,
  formatDateTime,
  formatInterval,
  formatNextReview,
  formatPercent,
  formatWeight,
} from '../../utils/date';
import { useWordStore } from '../words/wordStore';

const RESULT_LABELS: Record<ReviewLogResult, string> = {
  correct: '答对',
  correct_with_hint: '提示后答对',
  wrong: '答错',
  skipped: '跳过',
};

function DifficultyMeter({ value }: { value: number }) {
  return (
    <span className="difficulty-meter" aria-label={`难度 ${value} / 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} className={index < value ? 'is-on' : ''} />
      ))}
    </span>
  );
}

interface WordReaderCardProps {
  word: Word;
  group?: WordGroup;
  direction?: CardDirection;
  autoSpeak?: boolean;
  listenOnly?: boolean;
}

export function WordReaderCard({
  word,
  group,
  direction = 'next',
  autoSpeak = false,
  listenOnly = false,
}: WordReaderCardProps) {
  const setWordMark = useWordStore((state) => state.setWordMark);
  const pushToast = useUiStore((state) => state.pushToast);
  const [markBusy, setMarkBusy] = useState(false);
  const [detailsRevealed, setDetailsRevealed] = useState(false);

  useEffect(() => {
    return () => speechService.stop();
  }, [word.id]);

  useEffect(() => {
    if (!autoSpeak) return undefined;
    const timer = window.setTimeout(() => {
      void speechService.speak(word.word);
    }, 300);
    return () => {
      window.clearTimeout(timer);
      speechService.stop();
    };
  }, [autoSpeak, word.id, word.word]);

  useEffect(() => {
    if (!listenOnly) setDetailsRevealed(false);
  }, [listenOnly]);

  const handleMark = async (mark: Exclude<WordMark, 'none'>) => {
    if (markBusy) return;
    const next: WordMark = word.mark === mark ? 'none' : mark;
    setMarkBusy(true);
    try {
      await setWordMark(word.id, next);
      pushToast(
        next === 'none' ? '已清除标记' : `已标记为「${MARK_LABELS[next]}」`,
        'success',
      );
    } catch (cause) {
      pushToast(cause instanceof Error ? cause.message : '标记保存失败', 'error');
    } finally {
      setMarkBusy(false);
    }
  };

  const primaryMeaning = word.meanings[0] ?? '';
  const secondaryMeanings = word.meanings.slice(1);
  const extraAnswers = word.acceptedAnswers.filter(
    (answer) => answer.toLowerCase() !== word.word.toLowerCase(),
  );
  const correctRate =
    word.attemptCount > 0
      ? formatPercent((word.correctCount / word.attemptCount) * 100)
      : '—';

  return (
    <article
      className={`reader-page reader-page--${direction}${
        listenOnly ? ' reader-page--listen' : ''
      }${listenOnly && detailsRevealed ? ' is-revealed' : ''}`}
      aria-label={`词卡 ${word.word}`}
    >
      <span className="reader-page__rule" aria-hidden="true" />
      <header className="reader-page__top">
        <div className="study-tags">
          <span className="tag">{word.category}</span>
          <span className="tag tag--quiet">
            难度 <DifficultyMeter value={word.difficulty} />
          </span>
          {group ? (
            <span className={`tag tag--group ${group.enabled ? '' : 'is-off'}`}>
              <Icon name="folder" size={10} />
              {group.name}
            </span>
          ) : (
            <span className="tag tag--quiet">未分组</span>
          )}
          {!word.enabled || (group && !group.enabled) ? (
            <span className="tag tag--accent">练习已暂停</span>
          ) : null}
        </div>
        <span className="reader-page__serial">
          NO. {word.id.slice(-6).toUpperCase()}
        </span>
      </header>

      <div className="reader-word">
        <p className="eyebrow">WORD · 词卡</p>
        <div className="reader-word__line">
          <h1>{word.word}</h1>
          {word.phonetic ? (
            <span className="reader-word__phonetic">{word.phonetic}</span>
          ) : null}
          <SpeakButton text={word.word} showLabel />
        </div>
        <div className="reader-meanings">
          <p className="reader-meanings__primary">{primaryMeaning}</p>
          {secondaryMeanings.length > 0 ? (
            <p className="reader-meanings__extra">{secondaryMeanings.join(' · ')}</p>
          ) : null}
        </div>
        {extraAnswers.length > 0 ? (
          <p className="reader-accepted">可接受拼写：{extraAnswers.join(' / ')}</p>
        ) : null}
      </div>

      {listenOnly ? (
        <div className="reader-listen">
          <span>
            {detailsRevealed
              ? '完整词卡已展开，再次收起可继续只听。'
              : '只听模式：释义、例句与学习数据已隐藏。'}
          </span>
          <button
            type="button"
            className="text-link"
            onClick={() => setDetailsRevealed((value) => !value)}
          >
            {detailsRevealed ? '收起完整词卡' : '显示完整词卡'}
          </button>
        </div>
      ) : null}

      <div className="reader-marks" role="group" aria-label="词卡标记">
        <span className="reader-marks__label">标记</span>
        {MARK_OPTIONS.map((option) => {
          const active = word.mark === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={`mark-btn mark-btn--${option.value}${active ? ' is-active' : ''}`}
              aria-pressed={active}
              disabled={markBusy}
              onClick={() => void handleMark(option.value)}
              title={active ? `取消「${option.label}」标记` : `标记为「${option.label}」`}
            >
              <Icon name={option.icon} size={13} />
              {option.label}
            </button>
          );
        })}
        <span className="reader-marks__hint">
          {word.mark === 'none' ? '标记不影响复习进度' : '再次点击当前标记可取消'}
        </span>
      </div>

      {word.exampleSentence || word.notes ? (
        <div className="reader-body">
          {word.exampleSentence ? (
            <figure className="reader-example">
              <figcaption>
                <span>EXAMPLE · 例句</span>
                <SpeakButton
                  text={word.exampleSentence}
                  label="朗读例句"
                  ariaLabel="朗读例句"
                  showLabel
                />
              </figcaption>
              <blockquote>{word.exampleSentence}</blockquote>
            </figure>
          ) : null}
          {word.notes ? (
            <div className="reader-note">
              <span>NOTES · 词形 / 备注</span>
              <p>{word.notes}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {word.tags.length > 0 ? (
        <div className="reader-tags">
          <span className="reader-tags__label">标签</span>
          {word.tags.map((tag) => (
            <span key={tag} className="tag tag--quiet">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <dl className="reader-stats">
        <div>
          <dt>当前权重</dt>
          <dd>{formatWeight(word.weight)}</dd>
        </div>
        <div>
          <dt>复习间隔</dt>
          <dd>{formatInterval(word.intervalDays)}</dd>
        </div>
        <div>
          <dt>答题次数</dt>
          <dd>{word.attemptCount}</dd>
        </div>
        <div>
          <dt>正确率</dt>
          <dd>{correctRate}</dd>
        </div>
        <div>
          <dt>连续答对</dt>
          <dd>{word.consecutiveCorrect}</dd>
        </div>
        <div>
          <dt>下次复习</dt>
          <dd>{formatNextReview(word.nextReviewAt, Date.now())}</dd>
        </div>
      </dl>

      <div className="reader-meta">
        <span>稳定度 {word.stabilityDays.toFixed(1)} 天</span>
        <span>难度系数 {word.easeFactor.toFixed(2)}</span>
        <span>重复 {word.repetitions} 次</span>
        <span>答对 {word.correctCount} · 答错 {word.wrongCount}</span>
        <span>提示 {word.hintCount} 次</span>
        <span>上次复习 {formatDateTime(word.lastReviewedAt)}</span>
        <span>上次结果 {word.lastResult ? RESULT_LABELS[word.lastResult] : '未练习'}</span>
      </div>

      <footer className="reader-page__foot">
        <span>
          {group ? `分组：${group.name}` : '未分组'} · 录入 {formatDate(word.createdAt)} · 更新{' '}
          {formatDate(word.updatedAt)}
        </span>
        <span>只读浏览 · 不写入复习日志</span>
      </footer>
    </article>
  );
}
