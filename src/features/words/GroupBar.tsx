import { useState } from 'react';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icons';
import { Modal } from '../../components/Modal';
import type { WordGroup } from '../../domain/types';

interface GroupBarProps {
  groups: WordGroup[];
  counts: Record<string, number>;
  onCreate: (name: string) => Promise<WordGroup>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onManageWords: (group: WordGroup) => void;
}

type EditTarget = { mode: 'create' } | { mode: 'rename'; group: WordGroup };

export function GroupBar({
  groups,
  counts,
  onCreate,
  onRename,
  onDelete,
  onToggle,
  onManageWords,
}: GroupBarProps) {
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WordGroup | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const openCreate = () => {
    setName('');
    setError(null);
    setEditTarget({ mode: 'create' });
  };

  const openRename = (group: WordGroup) => {
    setName(group.name);
    setError(null);
    setEditTarget({ mode: 'rename', group });
  };

  const closeEditor = () => {
    if (saving) return;
    setEditTarget(null);
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    setError(null);
    try {
      if (editTarget.mode === 'create') await onCreate(name);
      else await onRename(editTarget.group.id, name);
      setEditTarget(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '分组保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (group: WordGroup, enabled: boolean) => {
    setError(null);
    try {
      await onToggle(group.id, enabled);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '分组状态保存失败');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '分组删除失败');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="group-bar" aria-label="练习分组">
      <div className="group-bar__head">
        <div>
          <p className="eyebrow">STUDY GROUPS · 练习分组</p>
          <p className="group-bar__hint">
            分组和单词左侧的复选框共同决定出题范围；上方切换练习池或听写池后，复选框只改当前池的勾选。点分组右侧的 + 可批量加入或移出单词；取消勾选分组会暂停整组，练习与听写都不再出题。
          </p>
        </div>
        <Button size="sm" onClick={openCreate} icon={<Icon name="plus" size={14} />}>
          新建分组
        </Button>
      </div>

      {groups.length === 0 ? (
        <p className="group-bar__empty">
          还没有分组。新建分组后，点击分组右侧的 + 把单词加进来。
        </p>
      ) : (
        <div className="group-chips">
          {groups.map((group) => (
            <div key={group.id} className={`group-chip ${group.enabled ? '' : 'is-off'}`}>
              <label className="group-chip__toggle">
                <input
                  type="checkbox"
                  checked={group.enabled}
                  onChange={(event) => void handleToggle(group, event.target.checked)}
                  aria-label={`启用分组 ${group.name}`}
                />
                <Icon name="folder" size={13} />
                <span className="group-chip__name">{group.name}</span>
                <span className="group-chip__count">{counts[group.id] ?? 0}</span>
              </label>
              <button
                type="button"
                className="group-chip__action"
                onClick={() => onManageWords(group)}
                aria-label={`管理分组 ${group.name} 的单词`}
                title="往分组中添加或移出单词"
              >
                <Icon name="plus" size={12} />
              </button>
              <button
                type="button"
                className="group-chip__action"
                onClick={() => openRename(group)}
                aria-label={`重命名分组 ${group.name}`}
                title="重命名分组"
              >
                <Icon name="edit" size={12} />
              </button>
              <button
                type="button"
                className="group-chip__action group-chip__action--danger"
                onClick={() => setDeleteTarget(group)}
                aria-label={`删除分组 ${group.name}`}
                title="删除分组"
              >
                <Icon name="trash" size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && !editTarget ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}

      <Modal
        open={editTarget !== null}
        title={editTarget?.mode === 'rename' ? '重命名分组' : '新建分组'}
        subtitle="分组只影响练习范围，不会改变单词的学习进度。"
        onClose={closeEditor}
      >
        <form className="group-form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field__label">分组名称</span>
            <input
              data-autofocus
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：阅读高频词"
              maxLength={30}
            />
          </label>
          {error ? (
            <p className="inline-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="form-actions">
            <Button variant="primary" type="submit" disabled={saving || !name.trim()}>
              {saving ? '正在保存…' : editTarget?.mode === 'rename' ? '保存名称' : '创建分组'}
            </Button>
            <Button onClick={closeEditor} disabled={saving}>
              取消
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        title="删除这个分组？"
        subtitle="组内单词与学习进度都会保留，删除后它们会变成未分组。"
        onClose={() => setDeleteTarget(null)}
      >
        {deleteTarget ? (
          <div className="confirm-body">
            <div className="confirm-word">{deleteTarget.name}</div>
            <p>共 {counts[deleteTarget.id] ?? 0} 个单词将移出该分组。</p>
            <div className="form-actions">
              <Button
                variant="danger"
                onClick={() => void handleDelete()}
                disabled={deleting}
                icon={<Icon name="trash" size={15} />}
              >
                {deleting ? '正在删除…' : '确认删除'}
              </Button>
              <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
                取消
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
