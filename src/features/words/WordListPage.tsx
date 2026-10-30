import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Icon } from '../../components/Icons';
import { ImportOptionsModal } from '../../components/ImportOptionsModal';
import { LoadingState } from '../../components/LoadingState';
import { Modal } from '../../components/Modal';
import type { Word, WordGroup, WordInput } from '../../domain/types';
import { filterSelectableWords } from '../../domain/scheduler';
import { formatImportSummary } from '../../services/importExportService';
import { useSettingsStore } from '../../stores/settingsStore';
import { useUiStore } from '../../stores/uiStore';
import { WordEditor } from './WordEditor';
import { GroupBar } from './GroupBar';
import { GroupWordsModal } from './GroupWordsModal';
import { ImportGuideModal } from './ImportGuideModal';
import { WordTable } from './WordTable';
import {
  collectCategories,
  filterWords,
  useWordStore,
  type ImportFileResult,
} from './wordStore';

export function WordListPage() {
  const words = useWordStore((state) => state.words);
  const groups = useWordStore((state) => state.groups);
  const loading = useWordStore((state) => state.loading);
  const error = useWordStore((state) => state.error);
  const search = useWordStore((state) => state.search);
  const category = useWordStore((state) => state.category);
  const difficulty = useWordStore((state) => state.difficulty);
  const mark = useWordStore((state) => state.mark);
  const pool = useWordStore((state) => state.pool);
  const load = useWordStore((state) => state.load);
  const createWord = useWordStore((state) => state.create);
  const updateWord = useWordStore((state) => state.update);
  const removeWord = useWordStore((state) => state.remove);
  const importFile = useWordStore((state) => state.importFile);
  const exportFile = useWordStore((state) => state.exportFile);
  const restoreSeed = useWordStore((state) => state.restoreSeed);
  const createGroup = useWordStore((state) => state.createGroup);
  const renameGroup = useWordStore((state) => state.renameGroup);
  const deleteGroup = useWordStore((state) => state.deleteGroup);
  const setGroupEnabled = useWordStore((state) => state.setGroupEnabled);
  const setWordsEnabled = useWordStore((state) => state.setWordsEnabled);
  const setWordsDictationEnabled = useWordStore((state) => state.setWordsDictationEnabled);
  const setWordsGroup = useWordStore((state) => state.setWordsGroup);
  const setSearch = useWordStore((state) => state.setSearch);
  const setCategory = useWordStore((state) => state.setCategory);
  const setDifficulty = useWordStore((state) => state.setDifficulty);
  const setMark = useWordStore((state) => state.setMark);
  const setPool = useWordStore((state) => state.setPool);
  const defaultCategory = useSettingsStore((state) => state.settings.defaultStudyCategory);
  const pushToast = useUiStore((state) => state.pushToast);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [managingGroup, setManagingGroup] = useState<WordGroup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Word | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [importReport, setImportReport] = useState<ImportFileResult | null>(null);
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const [importGuideOpen, setImportGuideOpen] = useState(false);
  const [enabledOnly, setEnabledOnly] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const now = Date.now();

  useEffect(() => {
    void load();
  }, [load]);

  const categories = collectCategories(words);
  const matched = filterWords(words, search, category, difficulty, mark);
  const practiceSelected = words.filter((word) => word.enabled).length;
  const dictationSelected = words.filter((word) => word.dictationEnabled).length;
  const selectedCount = pool === 'dictation' ? dictationSelected : practiceSelected;
  const matchedSelected = matched.filter((word) =>
    pool === 'dictation' ? word.dictationEnabled : word.enabled,
  ).length;
  const filtered = enabledOnly ? filterSelectableWords(matched, groups, pool) : matched;
  const hasFilters = Boolean(search.trim() || category || difficulty !== null || mark);
  const clearFilters = () => {
    setSearch('');
    setCategory('');
    setDifficulty(null);
    setMark('');
  };
  const selectableCount = filterSelectableWords(words, groups, pool).length;
  const poolLabel = pool === 'dictation' ? '听写池' : '练习池';
  const groupCounts = Object.fromEntries(
    groups.map((group) => [
      group.id,
      words.filter((word) => word.groupId === group.id).length,
    ]),
  );

  const handleToggleEnabled = (id: string, enabled: boolean) => {
    const save = pool === 'dictation' ? setWordsDictationEnabled : setWordsEnabled;
    void save([id], enabled).catch((cause) => {
      pushToast(cause instanceof Error ? cause.message : '勾选状态保存失败', 'error');
    });
  };

  const handleSetAllEnabled = (enabled: boolean) => {
    const save = pool === 'dictation' ? setWordsDictationEnabled : setWordsEnabled;
    void save(
      filtered.map((word) => word.id),
      enabled,
    ).catch((cause) => {
      pushToast(cause instanceof Error ? cause.message : '勾选状态保存失败', 'error');
    });
  };

  const handleCreateGroup = async (name: string) => {
    const group = await createGroup(name);
    pushToast(`已创建分组「${group.name}」`, 'success');
    return group;
  };

  const handleRenameGroup = async (id: string, name: string) => {
    await renameGroup(id, name);
    pushToast('分组已重命名', 'success');
  };

  const handleDeleteGroup = async (id: string) => {
    await deleteGroup(id);
    pushToast('分组已删除，组内词条与进度保留', 'success');
  };

  const handleSaveGroupWords = async (addIds: string[], removeIds: string[]) => {
    if (!managingGroup) return;
    if (addIds.length > 0) await setWordsGroup(addIds, managingGroup.id);
    if (removeIds.length > 0) await setWordsGroup(removeIds, null);
    const parts = [
      addIds.length > 0 ? `加入 ${addIds.length} 个` : '',
      removeIds.length > 0 ? `移出 ${removeIds.length} 个` : '',
    ].filter(Boolean);
    pushToast(
      parts.length > 0 ? `「${managingGroup.name}」已更新：${parts.join('，')}` : '分组没有变化',
      'success',
    );
  };

  const openCreate = () => {
    setEditingWord(null);
    setEditorOpen(true);
  };

  const openEdit = (word: Word) => {
    setEditingWord(word);
    setEditorOpen(true);
  };

  const handleSubmit = async (input: WordInput) => {
    if (editingWord) {
      await updateWord(editingWord.id, input);
      pushToast('词条已更新', 'success');
    } else {
      await createWord(input);
      pushToast('词条已加入词库', 'success');
    }
    setEditorOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await removeWord(deleteTarget.id);
      pushToast(`已删除「${deleteTarget.word}」及其复习记录`, 'success');
      setDeleteTarget(null);
    } catch (cause) {
      pushToast(cause instanceof Error ? cause.message : '删除失败', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleImport = async (groupName: string | null) => {
    if (!pendingImport) return;
    const result = await importFile(pendingImport, { groupName });
    setPendingImport(null);
    setImportReport(result);
    const groupText = result.group ? `，已创建分组「${result.group.name}」` : '';
    pushToast(
      `${formatImportSummary(result)}${groupText}`,
      result.issues.length > 0 ? 'info' : 'success',
    );
  };

  const handleExport = async () => {
    try {
      const path = await exportFile();
      if (path) pushToast(`已导出：${path}`, 'success');
    } catch (cause) {
      pushToast(cause instanceof Error ? cause.message : '导出失败', 'error');
    }
  };

  const handleRestoreSeed = async () => {
    try {
      const result = await restoreSeed();
      pushToast(
        `初始词库已补入：新增 ${result.inserted} 个，已有 ${result.skipped} 个`,
        'success',
      );
    } catch (cause) {
      pushToast(cause instanceof Error ? cause.message : '恢复初始词库失败', 'error');
    }
  };

  return (
    <div className="words-page page-enter">
      <header className="page-head">
        <div>
          <p className="eyebrow">WORD LEDGER · 词汇账本</p>
          <h1>词库</h1>
          <p className="page-head__lead">
            共 {words.length} 个词条，练习池勾选 {practiceSelected} 个、听写池勾选 {dictationSelected} 个；当前{poolLabel}
            实际出题 {selectableCount} 个。两个池独立勾选、独立计算权重；列表默认只显示当前池的有效词条，分组暂停会排除整组。
          </p>
        </div>
        <div className="page-head__actions">
          <Button variant="primary" onClick={openCreate} icon={<Icon name="plus" size={16} />}>
            新增单词
          </Button>
        </div>
      </header>

      <section className="panel ledger-panel">
        <GroupBar
          groups={groups}
          counts={groupCounts}
          onCreate={handleCreateGroup}
          onRename={handleRenameGroup}
          onDelete={handleDeleteGroup}
          onToggle={setGroupEnabled}
          onManageWords={setManagingGroup}
        />

        <div className="toolbar">
          <div className="search-box">
            <Icon name="search" size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索单词、释义、标签…"
              aria-label="搜索词库"
            />
            {search ? (
              <button className="search-box__clear" onClick={() => setSearch('')} aria-label="清除搜索">
                <Icon name="x" size={13} />
              </button>
            ) : null}
          </div>

          <div className="pool-switch" role="group" aria-label="切换词库池">
            <button
              type="button"
              className={`pool-switch__option ${pool === 'practice' ? 'is-active' : ''}`}
              aria-pressed={pool === 'practice'}
              onClick={() => setPool('practice')}
              title="查看并勾选练习模式的单词"
            >
              <Icon name="target" size={13} />
              练习池
              <span className="pool-switch__count">{practiceSelected}</span>
            </button>
            <button
              type="button"
              className={`pool-switch__option ${pool === 'dictation' ? 'is-active' : ''}`}
              aria-pressed={pool === 'dictation'}
              onClick={() => setPool('dictation')}
              title="查看并勾选听写模式的单词"
            >
              <Icon name="sound" size={13} />
              听写池
              <span className="pool-switch__count">{dictationSelected}</span>
            </button>
          </div>

          <button
            type="button"
            className={`filter-toggle ${enabledOnly ? 'is-active' : ''}`}
            onClick={() => setEnabledOnly((value) => !value)}
            aria-pressed={enabledOnly}
            title={enabledOnly ? '切换为显示全部词条' : `只显示${poolLabel}中勾选且分组启用的词条`}
          >
            <Icon name={enabledOnly ? 'check' : 'book'} size={14} />
            只看勾选
            <span className="filter-toggle__count">{selectedCount}</span>
          </button>

          <select
            className="input input--select toolbar__select"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            aria-label="按分类筛选"
          >
            <option value="">全部分类</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <select
            className="input input--select toolbar__select"
            value={difficulty ?? ''}
            onChange={(event) =>
              setDifficulty(event.target.value === '' ? null : Number(event.target.value))
            }
            aria-label="按难度筛选"
          >
            <option value="">全部难度</option>
            {[1, 2, 3, 4, 5].map((level) => (
              <option key={level} value={level}>
                难度 {level}
              </option>
            ))}
          </select>

          <select
            className="input input--select toolbar__select"
            value={mark}
            onChange={(event) => setMark(event.target.value as typeof mark)}
            aria-label="按标记筛选"
          >
            <option value="">全部标记</option>
            <option value="starred">收藏</option>
            <option value="later">稍后再看</option>
            <option value="mastered">已掌握</option>
            <option value="none">未标记</option>
          </select>

          {hasFilters ? (
            <button className="text-link toolbar__clear" onClick={clearFilters}>
              清除筛选
            </button>
          ) : null}

          <div className="toolbar__spacer" />

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) setPendingImport(file);
            }}
          />
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            icon={<Icon name="upload" size={15} />}
          >
            导入 JSON
          </Button>
          <button
            type="button"
            className="icon-btn toolbar__help"
            onClick={() => setImportGuideOpen(true)}
            aria-label="查看导入格式说明"
            title="查看导入 JSON 的格式与示例"
          >
            <Icon name="question" size={16} />
          </button>
          <Button
            size="sm"
            onClick={() => void handleExport()}
            disabled={words.length === 0}
            icon={<Icon name="download" size={15} />}
          >
            导出 JSON
          </Button>
        </div>

        {error ? <p className="inline-error">{error}</p> : null}

        {loading && words.length === 0 ? (
          <LoadingState label="正在打开词库…" />
        ) : words.length === 0 ? (
          <EmptyState
            icon="book"
            title="词库还是空的"
            description="添加第一个单词，或从 public/seed_words.json 恢复初始词库。"
          >
            <Button variant="primary" onClick={openCreate} icon={<Icon name="plus" />}>
              新增单词
            </Button>
            <Button onClick={() => void handleRestoreSeed()} icon={<Icon name="refresh" />}>
              恢复初始词库
            </Button>
          </EmptyState>
        ) : filtered.length === 0 && enabledOnly && matched.length > 0 ? (
          <EmptyState
            icon="check"
            title={matchedSelected > 0 ? '勾选的词被分组暂停' : '没有勾选的词条'}
            description={
              matchedSelected > 0
                ? `当前筛选结果里勾选的单词所在分组已暂停，${poolLabel}不会出题。到分组栏重新启用分组，或切回全部词条调整勾选。`
                : `当前筛选结果里没有勾选${poolLabel}的单词。切回全部词条即可查看并勾选。`
            }
          >
            <Button
              variant="primary"
              onClick={() => setEnabledOnly(false)}
              icon={<Icon name="book" />}
            >
              显示全部词条
            </Button>
            {hasFilters ? <Button onClick={clearFilters}>清除筛选</Button> : null}
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="search"
            title="没有匹配的词条"
            description="换一个关键词，或清除筛选条件。"
          >
            <Button onClick={clearFilters}>清除筛选</Button>
          </EmptyState>
        ) : (
          <>
            <div className="ledger-meta">
              <span>
                显示 {filtered.length} / {enabledOnly ? selectableCount : words.length} 条
                {enabledOnly ? `（${poolLabel}有效勾选）` : ''}
              </span>
              <span>最近更新 {words.length > 0 ? new Date(Math.max(...words.map((word) => word.updatedAt))).toLocaleDateString('zh-CN') : '—'}</span>
            </div>
            <WordTable
              words={filtered}
              groups={groups}
              now={now}
              pool={pool}
              onEdit={openEdit}
              onDelete={(word) => setDeleteTarget(word)}
              onToggleEnabled={handleToggleEnabled}
              onSetAllEnabled={handleSetAllEnabled}
            />
          </>
        )}
      </section>

      <Modal
        open={editorOpen}
        title={editingWord ? '编辑词条' : '新增词条'}
        subtitle="英文单词 · 中文释义 · 分类与难度"
        onClose={() => setEditorOpen(false)}
        wide
      >
        <WordEditor
          key={editingWord?.id ?? 'new-word'}
          word={editingWord}
          categories={categories}
          groups={groups}
          defaultCategory={defaultCategory}
          onCancel={() => setEditorOpen(false)}
          onSubmit={handleSubmit}
        />
      </Modal>

      <Modal
        open={deleteTarget !== null}
        title="删除这个单词？"
        subtitle="此操作不可撤销，关联的复习日志会一并删除。"
        onClose={() => setDeleteTarget(null)}
      >
        {deleteTarget ? (
          <div className="confirm-body">
            <div className="confirm-word">{deleteTarget.word}</div>
            <p>{deleteTarget.meanings.join('；')}</p>
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

      {managingGroup ? (
        <GroupWordsModal
          key={managingGroup.id}
          group={managingGroup}
          groups={groups}
          words={words}
          onClose={() => setManagingGroup(null)}
          onSave={handleSaveGroupWords}
        />
      ) : null}

      {importGuideOpen ? <ImportGuideModal onClose={() => setImportGuideOpen(false)} /> : null}

      {pendingImport ? (
        <ImportOptionsModal
          key={`${pendingImport.name}-${pendingImport.lastModified}`}
          file={pendingImport}
          onClose={() => setPendingImport(null)}
          onImport={handleImport}
        />
      ) : null}

      <Modal
        open={importReport !== null}
        title="导入结果"
        subtitle="有效词条已写入数据库，异常记录不会影响其余条目。"
        onClose={() => setImportReport(null)}
      >
        {importReport ? (
          <div className="import-report">
            <div className="import-report__summary">
              <div>
                <span>新增</span>
                <strong>{importReport.inserted}</strong>
              </div>
              <div>
                <span>更新</span>
                <strong>{importReport.updated}</strong>
              </div>
              <div>
                <span>跳过</span>
                <strong>{importReport.skipped}</strong>
              </div>
              <div>
                <span>无效</span>
                <strong>{importReport.issues.length}</strong>
              </div>
            </div>
            {importReport.group ? (
              <p className="import-report__group">
                已创建分组「{importReport.group.name}」，本次新增的词条已放入。
              </p>
            ) : null}
            {importReport.issues.length > 0 ? (
              <ul className="import-issues">
                {importReport.issues.slice(0, 30).map((issue, index) => (
                  <li key={`${issue.index}-${issue.word}-${index}`}>
                    <span>#{issue.index + 1}</span>
                    <strong>{issue.word || '（无单词）'}</strong>
                    <em>{issue.message}</em>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="import-report__ok">全部记录均已通过校验。</p>
            )}
            <div className="form-actions">
              <Button variant="primary" onClick={() => setImportReport(null)}>
                知道了
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
