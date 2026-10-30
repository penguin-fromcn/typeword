import { useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icons';
import { Modal } from '../../components/Modal';
import type { Word, WordGroup } from '../../domain/types';

interface GroupWordsModalProps {
  group: WordGroup;
  groups: WordGroup[];
  words: Word[];
  onClose: () => void;
  onSave: (addIds: string[], removeIds: string[]) => Promise<void>;
}

export function GroupWordsModal({ group, groups, words, onClose, onSave }: GroupWordsModalProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(words.filter((word) => word.groupId === group.id).map((word) => word.id)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupNameById = useMemo(
    () => new Map(groups.map((item) => [item.id, item.name])),
    [groups],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...words]
      .filter((word) => {
        if (!needle) return true;
        return (
          word.word.toLowerCase().includes(needle) ||
          word.meanings.some((meaning) => meaning.toLowerCase().includes(needle)) ||
          word.category.toLowerCase().includes(needle) ||
          word.tags.some((tag) => tag.toLowerCase().includes(needle))
        );
      })
      .sort((a, b) => a.word.localeCompare(b.word, 'en', { sensitivity: 'base' }));
  }, [query, words]);

  const addIds = words
    .filter((word) => selected.has(word.id) && word.groupId !== group.id)
    .map((word) => word.id);
  const removeIds = words
    .filter((word) => !selected.has(word.id) && word.groupId === group.id)
    .map((word) => word.id);
  const dirty = addIds.length + removeIds.length > 0;

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectVisible = () =>
    setSelected((current) => {
      const next = new Set(current);
      filtered.forEach((word) => next.add(word.id));
      return next;
    });

  const clearVisible = () =>
    setSelected((current) => {
      const next = new Set(current);
      filtered.forEach((word) => next.delete(word.id));
      return next;
    });

  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(addIds, removeIds);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '分组保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      wide
      title="管理分组单词"
      subtitle={`「${group.name}」· 勾选即加入，取消勾选即移出；只改变分组，学习进度保持不变。`}
      onClose={onClose}
      footer={
        <div className="group-manager__foot">
          <span className="group-manager__summary">
            已选 {selected.size} 个
            {dirty ? ` · 将加入 ${addIds.length} 个，移出 ${removeIds.length} 个` : ' · 暂无改动'}
          </span>
          <div className="form-actions group-manager__actions">
            <Button
              variant="primary"
              onClick={() => void handleSave()}
              disabled={!dirty || saving}
              icon={<Icon name="check" size={16} />}
            >
              {saving ? '正在保存…' : '保存分组'}
            </Button>
            <Button onClick={onClose} disabled={saving}>
              取消
            </Button>
          </div>
        </div>
      }
    >
      <div className="group-manager">
        <div className="group-manager__toolbar">
          <div className="search-box group-manager__search">
            <Icon name="search" size={15} />
            <input
              data-autofocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索单词、释义、标签…"
              aria-label="搜索分组单词"
            />
            {query ? (
              <button
                className="search-box__clear"
                onClick={() => setQuery('')}
                aria-label="清除分组搜索"
              >
                <Icon name="x" size={13} />
              </button>
            ) : null}
          </div>
          <button className="text-link" onClick={selectVisible} disabled={filtered.length === 0}>
            全选当前
          </button>
          <button className="text-link" onClick={clearVisible} disabled={filtered.length === 0}>
            清空当前
          </button>
        </div>

        {error ? (
          <p className="inline-error" role="alert">
            {error}
          </p>
        ) : null}

        {filtered.length === 0 ? (
          <p className="group-manager__empty">
            {words.length === 0 ? '词库还是空的，请先新增单词。' : '没有匹配的单词，换个关键词试试。'}
          </p>
        ) : (
          <div className="group-manager__list">
            {filtered.map((word) => {
              const checked = selected.has(word.id);
              const otherGroup =
                word.groupId && word.groupId !== group.id
                  ? groupNameById.get(word.groupId)
                  : null;
              return (
                <label key={word.id} className={`group-word ${checked ? 'is-checked' : ''}`}>
                  <input
                    className="word-check"
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(word.id)}
                    aria-label={`分组词条 ${word.word}`}
                  />
                  <span className="group-word__main">
                    <span className="group-word__head">
                      <span className="group-word__word">{word.word}</span>
                      <span className="tag tag--quiet">{word.category}</span>
                      {otherGroup ? (
                        <span className="tag tag--group">
                          <Icon name="folder" size={10} />
                          {otherGroup}
                        </span>
                      ) : null}
                      {word.enabled ? null : <span className="tag tag--quiet">已暂停</span>}
                    </span>
                    <span className="group-word__meaning">{word.meanings.join('；')}</span>
                  </span>
                </label>
              );
            })}
          </div>
        )}

        <p className="group-manager__note">
          一个单词只能属于一个分组；勾选其他分组的单词会把它移入「{group.name}」。
        </p>
      </div>
    </Modal>
  );
}
