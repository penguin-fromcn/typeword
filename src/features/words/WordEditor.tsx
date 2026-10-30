import { useState } from 'react';
import type { Word, WordGroup, WordInput } from '../../domain/types';
import { formValuesToWordInput, wordFormSchema, type WordFormValues } from '../../domain/schemas';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icons';

interface WordEditorProps {
  word: Word | null;
  categories: string[];
  groups: WordGroup[];
  defaultCategory: string;
  onCancel: () => void;
  onSubmit: (input: WordInput) => Promise<void>;
}

function initialValues(word: Word | null, defaultCategory: string): WordFormValues {
  if (!word) {
    return {
      word: '',
      meaningsText: '',
      acceptedAnswersText: '',
      phonetic: '',
      exampleSentence: '',
      notes: '',
      category: defaultCategory || '核心词汇',
      groupId: '',
      tagsText: '',
      difficulty: 2,
    };
  }
  return {
    word: word.word,
    meaningsText: word.meanings.join('\n'),
    acceptedAnswersText: word.acceptedAnswers.join('\n'),
    phonetic: word.phonetic ?? '',
    exampleSentence: word.exampleSentence ?? '',
    notes: word.notes ?? '',
    category: word.category,
    groupId: word.groupId ?? '',
    tagsText: word.tags.join(', '),
    difficulty: word.difficulty,
  };
}

const FIELD_LABELS: Record<string, string> = {
  word: '英文单词',
  meaningsText: '中文释义',
  category: '分类',
  groupId: '练习分组',
  difficulty: '难度',
  acceptedAnswersText: '备用答案',
  phonetic: '音标',
  exampleSentence: '例句',
  notes: '词形 / 备注',
  tagsText: '标签',
};

export function WordEditor({
  word,
  categories,
  groups,
  defaultCategory,
  onCancel,
  onSubmit,
}: WordEditorProps) {
  const [values, setValues] = useState<WordFormValues>(() => initialValues(word, defaultCategory));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setField = <Key extends keyof WordFormValues>(key: Key, value: WordFormValues[Key]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setGeneralError(null);
    const parsed = wordFormSchema.safeParse(values);

    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'general');
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      await onSubmit(formValuesToWordInput(parsed.data));
    } catch (error) {
      setGeneralError(error instanceof Error ? error.message : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="word-form" onSubmit={handleSubmit}>
      <div className="form-grid">
        <label className="field field--span2">
          <span className="field__label">英文单词 / 短语 *</span>
          <input
            data-autofocus
            className={`input ${errors.word ? 'input--error' : ''}`}
            value={values.word}
            onChange={(event) => setField('word', event.target.value)}
            placeholder="例如：reflection"
            autoComplete="off"
            spellCheck={false}
          />
          {errors.word ? <span className="field__error">{errors.word}</span> : null}
        </label>

        <label className="field field--span2">
          <span className="field__label">中文释义 *</span>
          <textarea
            className={`input input--textarea ${errors.meaningsText ? 'input--error' : ''}`}
            value={values.meaningsText}
            onChange={(event) => setField('meaningsText', event.target.value)}
            placeholder={'每行一个释义，例如：\n反射\n倒影\n深思'}
            rows={3}
          />
          <span className="field__hint">用换行或分号分隔多个释义，答题时全部展示。</span>
          {errors.meaningsText ? <span className="field__error">{errors.meaningsText}</span> : null}
        </label>

        <label className="field">
          <span className="field__label">分类</span>
          <input
            className="input"
            value={values.category}
            onChange={(event) => setField('category', event.target.value)}
            list="word-category-list"
            placeholder="核心词汇"
          />
          <datalist id="word-category-list">
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </label>

        <label className="field">
          <span className="field__label">练习分组</span>
          <select
            className="input input--select"
            value={values.groupId}
            onChange={(event) => setField('groupId', event.target.value)}
          >
            <option value="">未分组</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
                {group.enabled ? '' : '（已暂停）'}
              </option>
            ))}
          </select>
          <span className="field__hint">分组的勾选状态会决定组内单词是否参与练习。</span>
        </label>

        <label className="field">
          <span className="field__label">难度</span>
          <select
            className="input input--select"
            value={values.difficulty}
            onChange={(event) => setField('difficulty', Number(event.target.value))}
          >
            {[1, 2, 3, 4, 5].map((level) => (
              <option key={level} value={level}>
                {level} {level === 1 ? '· 轻松' : level === 5 ? '· 困难' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">音标</span>
          <input
            className="input"
            value={values.phonetic}
            onChange={(event) => setField('phonetic', event.target.value)}
            placeholder="/rɪˈflekʃn/"
          />
        </label>

        <label className="field">
          <span className="field__label">标签</span>
          <input
            className="input"
            value={values.tagsText}
            onChange={(event) => setField('tagsText', event.target.value)}
            placeholder="考研, 阅读"
          />
        </label>

        <label className="field field--span2">
          <span className="field__label">备用答案</span>
          <textarea
            className="input input--textarea"
            value={values.acceptedAnswersText}
            onChange={(event) => setField('acceptedAnswersText', event.target.value)}
            placeholder={'每行一个可接受答案，例如：\nmeagre'}
            rows={2}
          />
          <span className="field__hint">用于拼写变体（如 colour / color），仍要求完全匹配。</span>
        </label>

        <label className="field field--span2">
          <span className="field__label">例句</span>
          <textarea
            className="input input--textarea"
            value={values.exampleSentence}
            onChange={(event) => setField('exampleSentence', event.target.value)}
            placeholder="答案揭晓后展示，不参与答题。"
            rows={2}
          />
        </label>

        <label className="field field--span2">
          <span className="field__label">词形 / 备注</span>
          <textarea
            className="input input--textarea"
            value={values.notes}
            onChange={(event) => setField('notes', event.target.value)}
            placeholder="例如：reflect v. 反射；reflective adj. 沉思的"
            rows={2}
          />
        </label>
      </div>

      {Object.keys(errors).length > 0 ? (
        <p className="inline-error" role="alert">
          {Object.entries(errors)
            .map(([key, message]) => `${FIELD_LABELS[key] ?? key}：${message}`)
            .join('；')}
        </p>
      ) : null}
      {generalError ? (
        <p className="inline-error" role="alert">
          {generalError}
        </p>
      ) : null}

      <div className="form-actions">
        <Button variant="primary" type="submit" disabled={saving} icon={<Icon name="check" size={16} />}>
          {saving ? '正在保存…' : word ? '保存修改' : '加入词库'}
        </Button>
        <Button onClick={onCancel} disabled={saving}>
          取消
        </Button>
      </div>
    </form>
  );
}
