import { useState, type FormEvent } from 'react';
import { Button } from './Button';
import { Icon } from './Icons';
import { Modal } from './Modal';
import { Toggle } from './Toggle';

export function suggestGroupName(fileName: string): string {
  const base = fileName.replace(/\.json$/i, '').trim();
  return (base || '导入词表').slice(0, 30);
}

interface ImportOptionsModalProps {
  file: File;
  onClose: () => void;
  onImport: (groupName: string | null) => Promise<void>;
}

export function ImportOptionsModal({ file, onClose, onImport }: ImportOptionsModalProps) {
  const [createGroup, setCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState(() => suggestGroupName(file.name));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    if (!submitting) onClose();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = groupName.trim();
    if (createGroup && !trimmed) {
      setError('请填写分组名称');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onImport(createGroup ? trimmed : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导入失败');
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      title="导入设置"
      subtitle="文件已选好，导入前确认是否把这批词放进一个新分组。"
      onClose={close}
    >
      <form className="import-options" onSubmit={handleSubmit}>
        <div className="import-options__file">
          <Icon name="upload" size={15} />
          <span>{file.name}</span>
        </div>

        <Toggle
          checked={createGroup}
          onChange={(checked) => {
            setCreateGroup(checked);
            setError(null);
          }}
          label="创建新分组并放入"
          description="本次导入新增的词条会归入该分组；已有词条保留原分组，学习进度不受影响。"
          ariaLabel="创建新分组并放入"
          disabled={submitting}
        />

        {createGroup ? (
          <label className="field">
            <span className="field__label">分组名称</span>
            <input
              data-autofocus
              className="input"
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="例如：导入词表"
              maxLength={30}
              aria-label="导入分组名称"
              disabled={submitting}
            />
          </label>
        ) : null}

        <p className="import-options__note">
          分组只影响练习范围，不会改变学习进度。之后也可以在词库中调整。
        </p>

        {error ? (
          <p className="inline-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="form-actions">
          <Button variant="primary" type="submit" disabled={submitting}>
            {submitting ? '正在导入…' : '开始导入'}
          </Button>
          <Button onClick={close} disabled={submitting}>
            取消
          </Button>
        </div>
      </form>
    </Modal>
  );
}
