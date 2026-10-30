import { useEffect, useRef } from 'react';
import type { StudyPool, Word, WordGroup, WordMark } from '../../domain/types';
import { MARK_LABELS } from '../../domain/marks';
import { poolFlag, stateForPool } from '../../domain/studyPools';
import { formatDateTime, formatNextReview, formatPercent, formatWeight } from '../../utils/date';
import { Icon, type IconName } from '../../components/Icons';
import { SpeakButton } from '../../components/SpeakButton';

const MARK_ICONS: Record<Exclude<WordMark, 'none'>, IconName> = {
  starred: 'star',
  later: 'bookmark',
  mastered: 'check',
};

interface WordTableProps {
  words: Word[];
  groups: WordGroup[];
  now: number;
  pool: StudyPool;
  onEdit: (word: Word) => void;
  onDelete: (word: Word) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onSetAllEnabled: (enabled: boolean) => void;
}

export function WordTable({
  words,
  groups,
  now,
  pool,
  onEdit,
  onDelete,
  onToggleEnabled,
  onSetAllEnabled,
}: WordTableProps) {
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const enabledCount = words.filter((word) => poolFlag(word, pool)).length;
  const allEnabled = words.length > 0 && enabledCount === words.length;
  const someEnabled = enabledCount > 0 && !allEnabled;
  const headerCheckRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (headerCheckRef.current) headerCheckRef.current.indeterminate = someEnabled;
  }, [someEnabled]);

  return (
    <div className="table-scroll">
      <table className="word-table">
        <thead>
          <tr>
            <th className="word-table__check-head">
              <input
                ref={headerCheckRef}
                className="word-check"
                type="checkbox"
                checked={allEnabled}
                onChange={() => onSetAllEnabled(!allEnabled)}
                aria-label={pool === 'dictation' ? '全选当前显示的听写词条' : '全选当前显示的练习词条'}
                title="全选 / 取消全选当前显示的词条"
              />
            </th>
            <th>英文单词</th>
            <th>中文释义</th>
            <th>分类 / 分组</th>
            <th>难度</th>
            <th>当前权重</th>
            <th>正确率</th>
            <th>下次复习</th>
            <th className="word-table__actions-head">操作</th>
          </tr>
        </thead>
        <tbody>
          {words.map((word) => {
            const state = stateForPool(word, pool);
            const selected = poolFlag(word, pool);
            const accuracy =
              state.attemptCount > 0
                ? formatPercent((state.correctCount / state.attemptCount) * 100)
                : '—';
            const overdue = state.nextReviewAt <= now;
            const group = word.groupId ? groupById.get(word.groupId) : undefined;
            const paused = !selected || (group ? !group.enabled : false);
            return (
              <tr key={word.id} className={paused ? 'is-paused' : ''}>
                <td className="word-table__check-cell">
                  <input
                    className="word-check"
                    type="checkbox"
                    checked={selected}
                    onChange={(event) => onToggleEnabled(word.id, event.target.checked)}
                    aria-label={`启用 ${word.word}${pool === 'dictation' ? '（听写）' : '（练习）'}`}
                    title={pool === 'dictation' ? '勾选后参与听写' : '勾选后参与练习'}
                  />
                </td>
                <td>
                  <div className="word-cell">
                    <span className="word-cell__word">{word.word}</span>
                    {word.phonetic ? <span className="word-cell__phonetic">{word.phonetic}</span> : null}
                    {word.mark !== 'none' ? (
                      <span
                        className={`word-mark word-mark--${word.mark}`}
                        title={`标记：${MARK_LABELS[word.mark]}`}
                      >
                        <Icon name={MARK_ICONS[word.mark]} size={10} />
                        {MARK_LABELS[word.mark]}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td>
                  <div className="meaning-cell">
                    {word.meanings.slice(0, 2).join('；')}
                    {word.meanings.length > 2 ? <span> 等 {word.meanings.length} 项</span> : null}
                  </div>
                </td>
                <td>
                  <div className="word-tags">
                    <span className="tag tag--quiet">{word.category}</span>
                    {group ? (
                      <span
                        className={`tag tag--group ${group.enabled ? '' : 'is-off'}`}
                        title={
                          group.enabled
                            ? `分组：${group.name}`
                            : `分组「${group.name}」已暂停，暂不出题`
                        }
                      >
                        <Icon name="folder" size={10} />
                        {group.name}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td>
                  <span className="table-difficulty">
                    {Array.from({ length: 5 }, (_, index) => (
                      <span key={index} className={index < word.difficulty ? 'is-on' : ''} />
                    ))}
                  </span>
                </td>
                <td>
                  <div className="weight-cell">
                    <strong>{formatWeight(state.weight)}</strong>
                    <span className="weight-cell__track">
                      <span style={{ width: `${Math.min(100, (state.weight / 8) * 100)}%` }} />
                    </span>
                  </div>
                </td>
                <td>
                  <span className="table-accuracy">{accuracy}</span>
                  <span className="table-sub">
                    {state.correctCount}/{state.attemptCount}
                  </span>
                </td>
                <td>
                  <span className={`table-review ${overdue ? 'is-overdue' : ''}`}>
                    {formatNextReview(state.nextReviewAt, now)}
                  </span>
                  <span className="table-sub">{formatDateTime(state.lastReviewedAt)}</span>
                </td>
                <td className="word-table__actions-cell">
                  <div className="row-actions">
                    <SpeakButton text={word.word} variant="row" showLabel />
                    <button
                      className="row-action"
                      onClick={() => onEdit(word)}
                      aria-label={`编辑 ${word.word}`}
                      title="编辑词条"
                    >
                      <Icon name="edit" size={14} />
                      <span className="row-action__label">编辑</span>
                    </button>
                    <button
                      className="row-action row-action--danger"
                      onClick={() => onDelete(word)}
                      aria-label={`删除 ${word.word}`}
                      title="删除词条"
                    >
                      <Icon name="trash" size={14} />
                      <span className="row-action__label">删除</span>
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
