import { useEffect, useLayoutEffect, useState } from 'react';
import type { ReviewLogResult, Word } from '../../domain/types';
import { Icon } from '../../components/Icons';
import { SpeakButton } from '../../components/SpeakButton';
import { speechService } from '../../services/speechService';

const SLIP_ROTATION_MS = 10_000;

const RESULT_LABELS: Record<ReviewLogResult, string> = {
  correct: '// correct',
  correct_with_hint: '// hinted',
  wrong: '// retry',
  skipped: '// skipped',
};

function pickNextId(words: Word[], currentId: string | null): string | null {
  if (words.length === 0) return null;
  const candidates = currentId
    ? words.filter((word) => word.id !== currentId)
    : words;
  const pool = candidates.length > 0 ? candidates : words;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

interface WordSlipProps {
  words: Word[];
  onRotate?: () => void;
  onOpenWord?: (id: string) => void;
}

export function WordSlip({ words, onRotate, onOpenWord }: WordSlipProps) {
  const [currentId, setCurrentId] = useState<string | null>(null);

  useLayoutEffect(() => {
    setCurrentId((previous) =>
      previous && words.some((word) => word.id === previous)
        ? previous
        : pickNextId(words, null),
    );
  }, [words]);

  useEffect(() => {
    if (words.length === 0) return;
    const timer = window.setInterval(() => {
      if (words.length > 1) {
        setCurrentId((previous) => pickNextId(words, previous));
      }
      onRotate?.();
    }, SLIP_ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [words, onRotate]);

  useEffect(() => {
    return () => speechService.stop();
  }, [currentId]);

  const current = words.find((word) => word.id === currentId) ?? null;

  if (!current) {
    return (
      <div className="slip-scene">
        <div className="hero__slip hero__slip--pending" aria-hidden="true">
          <span>正在抽取词卡…</span>
        </div>
      </div>
    );
  }

  const currentIndex = Math.max(
    0,
    words.findIndex((word) => word.id === current.id),
  );
  const letters = [...current.word];
  const density =
    letters.length > 18
      ? 'slip-type--tiny'
      : letters.length > 12
        ? 'slip-type--compact'
        : '';
  const resultLabel = current.lastResult
    ? RESULT_LABELS[current.lastResult]
    : '// new';

  return (
    <div className="slip-scene">
      <div className="hero__slip" key={current.id} aria-hidden="true">
        <div className="slip-head">
          <span>No. {String(currentIndex + 1).padStart(3, '0')}</span>
          <span>VOCABULARY</span>
        </div>
        <div className="slip-meaning">
          <span className="slip-label">中文释义</span>
          <strong>{current.meanings.slice(0, 3).join('；')}</strong>
        </div>
        <div className={`slip-type ${density}`}>
          <span className="slip-cursor">▌</span>
          {letters.map((letter, index) =>
            letter === ' ' ? (
              <span key={`space-${index}`} className="slip-space" />
            ) : (
              <span key={`${letter}-${index}`}>{letter}</span>
            ),
          )}
        </div>
        <div className="slip-rule" />
        <div className="slip-foot">
          <span>
            weight {current.weight.toFixed(2)} · {current.attemptCount} 次
          </span>
          <span>{resultLabel}</span>
        </div>
      </div>
      <div className="slip-actions">
        <SpeakButton
          text={current.word}
          label="朗读单词"
          ariaLabel={`朗读 ${current.word}`}
          showLabel
        />
        {onOpenWord ? (
          <button
            type="button"
            className="slip-open"
            onClick={() => onOpenWord(current.id)}
            aria-label={`打开 ${current.word} 的词卡`}
          >
            打开这张词卡
            <Icon name="arrow-right" size={13} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
