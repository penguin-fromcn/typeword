import { useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icons';
import { Modal } from '../../components/Modal';
import {
  groupMemberIds,
  groupStudySelection,
  selectionState,
} from '../../domain/cardDeck';
import type { Word, WordGroup } from '../../domain/types';
import { useWordStore } from '../words/wordStore';
import { StudyScopeChip } from './StudyScopeChip';

interface StudyScopeModalProps {
  words: Word[];
  groups: WordGroup[];
  onClose: () => void;
}

export function StudyScopeModal({ words, groups, onClose }: StudyScopeModalProps) {
  const applyStudySelection = useWordStore((state) => state.applyStudySelection);
  const [selectedIds, setSelectedIds] = useState(
    () => new Set(words.filter((word) => word.studyEnabled).map((word) => word.id)),
  );
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  const unassignedTotal = words.filter((word) => word.groupId === null).length;
  const allSelected = words.length > 0 && selectedIds.size === words.length;

  const draftWords = useMemo(
    () =>
      words.map((word) =>
        selectedIds.has(word.id)
          ? { ...word, studyEnabled: true }
          : { ...word, studyEnabled: false },
      ),
    [words, selectedIds],
  );

  const needle = query.trim().toLowerCase();
  const filteredWords = useMemo(() => {
    if (!needle) return words;
    return words.filter(
      (word) =>
        word.word.toLowerCase().includes(needle) ||
        word.meanings.some((meaning) => meaning.toLowerCase().includes(needle)) ||
        word.category.toLowerCase().includes(needle) ||
        word.tags.some((tag) => tag.toLowerCase().includes(needle)),
    );
  }, [words, needle]);

  const close = () => {
    if (saving) return;
    onClose();
  };

  const toggleWord = (id: string, checked: boolean) => {
    if (saving) return;
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (saving) return;
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(words.map((word) => word.id)));
  };

  const toggleGroup = (groupId: string | null) => {
    if (saving) return;
    const ids = groupMemberIds(words, groupId);
    const state = selectionState(
      ids.filter((id) => selectedIds.has(id)).length,
      ids.length,
    );
    const enable = state !== 'all';
    setSelectedIds((previous) => {
      const next = new Set(previous);
      for (const id of ids) {
        if (enable) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const save = async () => {
    const enableIds = words
      .filter((word) => selectedIds.has(word.id))
      .map((word) => word.id);
    const disableIds = words
      .filter((word) => !selectedIds.has(word.id))
      .map((word) => word.id);

    setSaving(true);
    setError(null);
    try {
      await applyStudySelection(enableIds, disableIds);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '学习范围保存失败');
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      wide
      title="选择学习范围"
      subtitle="学习范围独立于练习勾选。翻卡不会写入复习记录，也不会改变权重。"
      onClose={close}
      footer={
        <div className="scope-modal__foot">
          <span className="scope-modal__foot-count">
            已选 <strong>{selectedIds.size}</strong> / {words.length} 个词条
          </span>
          <div className="form-actions">
            <Button onClick={close} disabled={saving}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={() => void save()}
              disabled={saving || words.length === 0}
              icon={<Icon name="check" size={15} />}
            >
              {saving ? '正在保存…' : '保存选择'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="scope-modal">
        <div className="scope-summary">
          <div>
            <p className="eyebrow">CARD DECK</p>
            <p className="scope-summary__line">
              <strong>{selectedIds.size}</strong> 个词条会出现在翻卡中
            </p>
          </div>
          <div className="scope-summary__actions">
            <button className="text-link" onClick={toggleAll} disabled={saving || words.length === 0}>
              {allSelected ? '全部取消' : '全部选中'}
            </button>
          </div>
        </div>

        <div className="scope-groups" aria-label="按分组选择学习范围">
          <StudyScopeChip
            label="全部词条"
            selected={selectedIds.size}
            total={words.length}
            onToggle={toggleAll}
            disabled={saving}
          />
          {groups.map((group) => {
            const selection = groupStudySelection(draftWords, group.id);
            return (
              <StudyScopeChip
                key={group.id}
                label={group.name}
                selected={selection.selected}
                total={selection.total}
                onToggle={() => toggleGroup(group.id)}
                disabled={saving}
              />
            );
          })}
          {groups.length > 0 && unassignedTotal > 0 ? (
            <StudyScopeChip
              label="未分组"
              selected={draftWords.filter(
                (word) => word.groupId === null && word.studyEnabled,
              ).length}
              total={unassignedTotal}
              onToggle={() => toggleGroup(null)}
              disabled={saving}
            />
          ) : null}
        </div>

        <label className="scope-search">
          <Icon name="search" size={15} />
          <input
            data-autofocus
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索单词、释义、分类或标签…"
            aria-label="搜索词条"
          />
        </label>

        <div className="scope-list-head">
          <span>
            显示 {filteredWords.length} / {words.length} 个词条
          </span>
          <span>点击分组可整组选中或取消</span>
        </div>

        <div className="scope-words" role="group" aria-label="单词学习范围">
          {filteredWords.length === 0 ? (
            <p className="scope-words__empty">没有匹配的词条，换个关键词试试。</p>
          ) : (
            filteredWords.map((word) => {
              const group = word.groupId ? groupById.get(word.groupId) : undefined;
              const checked = selectedIds.has(word.id);
              return (
                <label
                  key={word.id}
                  className={`scope-word ${checked ? 'is-selected' : ''}`}
                >
                  <input
                    className="word-check"
                    type="checkbox"
                    checked={checked}
                    disabled={saving}
                    onChange={(event) => toggleWord(word.id, event.target.checked)}
                  />
                  <span className="scope-word__copy">
                    <span className="scope-word__line">
                      <strong>{word.word}</strong>
                      {word.phonetic ? <span>{word.phonetic}</span> : null}
                    </span>
                    <span className="scope-word__meaning">{word.meanings.join('；')}</span>
                  </span>
                  <span className="scope-word__meta">
                    <span className="tag tag--quiet">{group?.name ?? '未分组'}</span>
                    <span className="scope-word__category">{word.category}</span>
                  </span>
                </label>
              );
            })
          )}
        </div>

        {error ? (
          <p className="inline-error" role="alert">
            {error}
          </p>
        ) : null}

        <p className="scope-note">
          取消选中只会把单词移出翻卡队列，不会暂停练习，也不会重置学习进度。
        </p>
      </div>
    </Modal>
  );
}
