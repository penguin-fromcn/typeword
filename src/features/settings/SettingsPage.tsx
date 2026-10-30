import { useCallback, useEffect, useRef, useState } from 'react';
import { AmbientSoundPicker } from '../../components/AmbientSoundControl';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icons';
import { ImportOptionsModal } from '../../components/ImportOptionsModal';
import { Modal } from '../../components/Modal';
import { SpeakButton } from '../../components/SpeakButton';
import { Toggle } from '../../components/Toggle';
import { dayKey } from '../../domain/statistics';
import type { BackupInfo } from '../../domain/types';
import { useSpeechAvailability, useSpeechBackend } from '../../hooks/useSpeechAvailability';
import { formatImportSummary } from '../../services/importExportService';
import { isDesktopRuntime, repository } from '../../services/repository';
import { audioService } from '../../services/audioService';
import { speechService, type SpeechAccent } from '../../services/speechService';
import { formatDateTime } from '../../utils/date';
import { useSettingsStore } from '../../stores/settingsStore';
import { useUiStore } from '../../stores/uiStore';
import { useStudyStore } from '../../features/study/studyStore';
import { useStatisticsStore } from '../../features/statistics/statisticsStore';
import {
  collectCategories,
  useWordStore,
  type ImportFileResult,
} from '../../features/words/wordStore';

const DAILY_BACKUP_PATTERN = /^typeword-backup-\d{4}-\d{2}-\d{2}\.sqlite3$/;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function SettingsPage() {
  const settings = useSettingsStore((state) => state.settings);
  const update = useSettingsStore((state) => state.update);
  const words = useWordStore((state) => state.words);
  const loadWords = useWordStore((state) => state.load);
  const exportFile = useWordStore((state) => state.exportFile);
  const importFile = useWordStore((state) => state.importFile);
  const restoreSeed = useWordStore((state) => state.restoreSeed);
  const databasePath = useUiStore((state) => state.databasePath);
  const pushToast = useUiStore((state) => state.pushToast);
  const refreshStatistics = useStatisticsStore((state) => state.refresh);
  const resetStudySession = useStudyStore((state) => state.reset);

  const speechAvailable = useSpeechAvailability();
  const speechBackend = useSpeechBackend();
  const [volume, setVolume] = useState(settings.soundVolume);
  const [speechRate, setSpeechRate] = useState(settings.speechRate);
  const [speechVolume, setSpeechVolume] = useState(settings.speechVolume);
  const [goalText, setGoalText] = useState(String(settings.dailyGoal));
  const [importReport, setImportReport] = useState<ImportFileResult | null>(null);
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backupDir, setBackupDir] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupInfo | null>(null);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshBackups = useCallback(async () => {
    try {
      const [list, dir] = await Promise.all([
        repository.listBackups(),
        repository.getBackupDir(),
      ]);
      setBackups(list);
      setBackupDir(dir);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '备份列表读取失败', 'error');
    }
  }, [pushToast]);

  useEffect(() => {
    void refreshBackups();
  }, [refreshBackups]);

  useEffect(() => {
    void loadWords();
  }, [loadWords]);

  useEffect(() => {
    setVolume(settings.soundVolume);
    setGoalText(String(settings.dailyGoal));
    setSpeechRate(settings.speechRate);
    setSpeechVolume(settings.speechVolume);
  }, [
    settings.soundVolume,
    settings.dailyGoal,
    settings.speechRate,
    settings.speechVolume,
  ]);

  const categories = collectCategories(words);

  const apply = async (patch: Parameters<typeof update>[0]) => {
    try {
      await update(patch);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '设置保存失败', 'error');
    }
  };

  const commitVolume = async () => {
    if (Math.abs(volume - settings.soundVolume) < 0.001) return;
    await apply({ soundVolume: volume });
  };

  const commitSpeechRate = async () => {
    if (Math.abs(speechRate - settings.speechRate) < 0.001) return;
    await apply({ speechRate });
  };

  const commitSpeechVolume = async () => {
    if (Math.abs(speechVolume - settings.speechVolume) < 0.001) return;
    await apply({ speechVolume });
  };

  const commitGoal = async () => {
    const parsed = Number(goalText);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setGoalText(String(settings.dailyGoal));
      return;
    }
    const next = Math.min(500, Math.round(parsed));
    setGoalText(String(next));
    if (next !== settings.dailyGoal) await apply({ dailyGoal: next });
  };

  const handleImport = async (groupName: string | null) => {
    if (!pendingImport) return;
    const result = await importFile(pendingImport, { groupName });
    setPendingImport(null);
    setImportReport(result);
    void refreshStatistics().catch(() => undefined);
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
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '导出失败', 'error');
    }
  };

  const handleRestoreSeed = async () => {
    try {
      const result = await restoreSeed();
      await refreshStatistics();
      pushToast(
        `初始词库已补入：新增 ${result.inserted} 个，已有 ${result.skipped} 个`,
        'success',
      );
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '恢复初始词库失败', 'error');
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await repository.resetProgress(Date.now());
      resetStudySession();
      await loadWords();
      await refreshStatistics();
      setResetOpen(false);
      pushToast('学习进度已重置，词条内容保留', 'success');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '重置失败', 'error');
    } finally {
      setResetting(false);
    }
  };

  const handleBackupNow = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const now = Date.now();
      const info = await repository.createBackup(dayKey(now), now, true);
      await refreshBackups();
      pushToast(`已生成备份：${info.fileName}`, 'success');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '备份失败', 'error');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!restoreTarget || restoring) return;
    setRestoring(true);
    try {
      const now = Date.now();
      const safety = await repository.restoreBackup(
        restoreTarget.fileName,
        dayKey(now),
        now,
      );
      setRestoreTarget(null);
      pushToast(`已恢复备份，安全快照：${safety.fileName}`, 'success');
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '恢复备份失败', 'error');
    } finally {
      setRestoring(false);
    }
  };

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(databasePath);
      pushToast('数据库路径已复制', 'success');
    } catch {
      pushToast('复制失败，请手动选择路径', 'error');
    }
  };

  return (
    <div className="settings-page page-enter">
      <header className="page-head">
        <div>
          <p className="eyebrow">TUNE · 调整机器</p>
          <h1>设置</h1>
          <p className="page-head__lead">所有设置保存在本地数据库。音效缺失时会自动使用 Web Audio 回退。</p>
        </div>
        <span className={`env-badge ${isDesktopRuntime ? 'env-badge--desktop' : 'env-badge--web'}`}>
          <span />
          {isDesktopRuntime ? 'TAURI · SQLITE' : 'BROWSER FALLBACK'}
        </span>
      </header>

      <div className="settings-grid">
        <section className="panel settings-panel">
          <header className="panel__head">
            <div>
              <p className="eyebrow">PRACTICE</p>
              <h2>练习</h2>
            </div>
          </header>
          <div className="setting-list">
            <Toggle
              checked={settings.hintEnabled}
              onChange={(checked) => void apply({ hintEnabled: checked })}
              label="显示字母提示"
              description="关闭后题目不再自动显示字母，额外提示按钮也会禁用。"
            />
            <Toggle
              checked={settings.autoNextQuestion}
              onChange={(checked) => void apply({ autoNextQuestion: checked })}
              label="答对后自动下一题"
              description="反馈音效与朗读结束后，停留约 1.4 秒自动切换。"
            />
            <div className="setting-row">
              <div>
                <span className="toggle__label">每日目标</span>
                <span className="toggle__desc">首页进度与统计页使用这个目标。</span>
              </div>
              <input
                className="input input--number"
                type="number"
                min={1}
                max={500}
                value={goalText}
                onChange={(event) => setGoalText(event.target.value)}
                onBlur={() => void commitGoal()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
                aria-label="每日练习目标"
              />
            </div>
            <div className="setting-row">
              <div>
                <span className="toggle__label">默认分类</span>
                <span className="toggle__desc">新增词条时预填的分类。</span>
              </div>
              <select
                className="input input--select"
                value={settings.defaultStudyCategory}
                onChange={(event) => void apply({ defaultStudyCategory: event.target.value })}
                aria-label="默认分类"
              >
                <option value="">不限定</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
            <div className="setting-row">
              <div>
                <span className="toggle__label">默认难度</span>
                <span className="toggle__desc">新增词条时预填的难度等级。</span>
              </div>
              <select
                className="input input--select"
                value={settings.defaultStudyDifficulty}
                onChange={(event) =>
                  void apply({ defaultStudyDifficulty: Number(event.target.value) })
                }
                aria-label="默认难度"
              >
                <option value={0}>不限定</option>
                {[1, 2, 3, 4, 5].map((level) => (
                  <option key={level} value={level}>
                    难度 {level}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="panel settings-panel">
          <header className="panel__head">
            <div>
              <p className="eyebrow">SOUND</p>
              <h2>声音</h2>
            </div>
            <div className="panel__head-actions">
              <SpeakButton text="vocabulary" label="试听" showLabel />
              <Icon name={settings.soundEnabled ? 'sound' : 'mute'} size={20} />
            </div>
          </header>
          <div className="setting-list">
            <Toggle
              checked={settings.soundEnabled}
              onChange={(checked) => {
                audioService.setEnabled(checked);
                void apply({ soundEnabled: checked });
              }}
              label="打字机音效"
              description="按键、退格、提交、正确与错误反馈音。"
            />
            <div className="setting-row setting-row--stack">
              <div className="setting-row__head">
                <div>
                  <span className="toggle__label">音效音量</span>
                  <span className="toggle__desc">音效文件缺失时自动合成短音，不会阻塞答题。</span>
                </div>
                <span className="volume-value">{Math.round(volume * 100)}%</span>
              </div>
              <input
                className="range"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setVolume(next);
                  audioService.setVolume(next);
                  audioService.playKey();
                }}
                onPointerUp={() => void commitVolume()}
                onKeyUp={() => void commitVolume()}
                onBlur={() => void commitVolume()}
                disabled={!settings.soundEnabled}
                aria-label="音效音量"
              />
            </div>

            <div className="setting-divider" role="presentation" />

            <Toggle
              checked={settings.pronunciationEnabled}
              onChange={(checked) => {
                if (!checked) speechService.stop();
                void apply({ pronunciationEnabled: checked });
              }}
              label="单词朗读"
              description={
                !speechService.isSupported()
                  ? '当前系统不支持语音朗读。'
                  : !speechAvailable
                    ? '当前没有可用英文语音。请到 Windows「设置 → 时间和语言 → 语音」安装英文语音，安装后重新启动程序。'
                    : speechBackend === 'sapi'
                      ? 'WebView2 没有可用的英文语音，已自动改用 Windows 系统语音（SAPI）。'
                      : '在练习、词卡、词库与听写模式中显示朗读入口。'
              }
              disabled={!speechAvailable}
            />
            <Toggle
              checked={settings.autoPronounceEnabled}
              onChange={(checked) => void apply({ autoPronounceEnabled: checked })}
              label="答对后自动朗读"
              description="答对或揭示答案后，等反馈音效播完再朗读；关闭后仍可手动朗读。"
              disabled={!settings.pronunciationEnabled || !speechAvailable}
            />
            <div className="setting-row setting-row--stack">
              <div className="setting-row__head">
                <div>
                  <span className="toggle__label">朗读语速</span>
                  <span className="toggle__desc">0.50× 最慢，1.50× 最快。</span>
                </div>
                <span className="volume-value">{speechRate.toFixed(2)}×</span>
              </div>
              <input
                className="range"
                type="range"
                min={0.5}
                max={1.5}
                step={0.05}
                value={speechRate}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setSpeechRate(next);
                  speechService.configure({ rate: next });
                }}
                onPointerUp={() => void commitSpeechRate()}
                onKeyUp={() => void commitSpeechRate()}
                onBlur={() => void commitSpeechRate()}
                disabled={!settings.pronunciationEnabled || !speechAvailable}
                aria-label="朗读语速"
              />
            </div>
            <div className="setting-row setting-row--stack">
              <div className="setting-row__head">
                <div>
                  <span className="toggle__label">朗读音量</span>
                  <span className="toggle__desc">只影响系统语音，不影响打字机音效。</span>
                </div>
                <span className="volume-value">{Math.round(speechVolume * 100)}%</span>
              </div>
              <input
                className="range"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={speechVolume}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setSpeechVolume(next);
                  speechService.configure({ volume: next });
                }}
                onPointerUp={() => void commitSpeechVolume()}
                onKeyUp={() => void commitSpeechVolume()}
                onBlur={() => void commitSpeechVolume()}
                disabled={!settings.pronunciationEnabled || !speechAvailable}
                aria-label="朗读音量"
              />
            </div>
            <div className="setting-row">
              <div>
                <span className="toggle__label">语音口音</span>
                <span className="toggle__desc">优先使用对应的系统英文语音，没有时自动回退。</span>
              </div>
              <select
                className="input input--select"
                value={settings.speechAccent}
                onChange={(event) =>
                  void apply({ speechAccent: event.target.value as SpeechAccent })
                }
                disabled={!settings.pronunciationEnabled || !speechAvailable}
                aria-label="语音口音"
              >
                <option value="auto">自动（优先美音）</option>
                <option value="us">美音 en-US</option>
                <option value="gb">英音 en-GB</option>
              </select>
            </div>
          </div>
        </section>

        <section className="panel settings-panel settings-panel--wide">
          <header className="panel__head">
            <div>
              <p className="eyebrow">AMBIENT</p>
              <h2>环境音</h2>
            </div>
            <div className="panel__head-actions">
              <Icon name="music" size={20} />
            </div>
          </header>
          <AmbientSoundPicker />
        </section>

        <section className="panel settings-panel settings-panel--wide">
          <header className="panel__head">
            <div>
              <p className="eyebrow">ARCHIVE</p>
              <h2>数据与备份</h2>
            </div>
            <span className="panel__count">{words.length} 词条</span>
          </header>

          <div className="db-path">
            <div>
              <span className="db-path__label">数据库位置</span>
              <code>{databasePath || '读取中…'}</code>
            </div>
            <button className="icon-btn" onClick={() => void copyPath()} title="复制路径" aria-label="复制数据库路径">
              <Icon name="copy" size={16} />
            </button>
          </div>

          <div className="backup-block">
            <div className="backup-block__head">
              <div>
                <span className="db-path__label">本地备份快照</span>
                <p className="backup-block__desc">
                  每天首次启动自动保存一份快照，仅保留最近 12 份每日备份；手动备份不会被自动清理。
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => void handleBackupNow()}
                disabled={backupBusy}
                icon={<Icon name="download" size={14} />}
              >
                {backupBusy ? '正在备份…' : '立即备份'}
              </Button>
            </div>
            {backupDir ? (
              <p className="backup-block__dir">
                备份目录：<code>{backupDir}</code>
              </p>
            ) : null}
            {backups.length === 0 ? (
              <p className="panel__empty">还没有备份快照，点击“立即备份”生成第一份。</p>
            ) : (
              <ul className="backup-list">
                {backups.map((item) => (
                  <li key={item.fileName}>
                    <div className="backup-list__meta">
                      <strong>{item.fileName}</strong>
                      <span>
                        {DAILY_BACKUP_PATTERN.test(item.fileName) ? '自动 · ' : '手动 · '}
                        {formatDateTime(item.createdAt)} · {formatBytes(item.size)}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setRestoreTarget(item)}
                      icon={<Icon name="refresh" size={14} />}
                    >
                      恢复
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

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

          <div className="data-actions">
            <Button
              onClick={() => void handleExport()}
              disabled={words.length === 0}
              icon={<Icon name="download" size={16} />}
            >
              导出全部数据
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              icon={<Icon name="upload" size={16} />}
            >
              导入 JSON
            </Button>
            <Button onClick={() => void handleRestoreSeed()} icon={<Icon name="refresh" size={16} />}>
              恢复初始词库
            </Button>
            <Button
              variant="danger"
              onClick={() => setResetOpen(true)}
              icon={<Icon name="trash" size={16} />}
            >
              重置学习进度
            </Button>
          </div>

          <div className="data-notes">
            <p>
              <strong>导出</strong>包含词条、权重、复习间隔、答题次数、标记与下次复习时间。导入带进度字段的备份时会覆盖同名单词的学习状态。
            </p>
            <p>
              <strong>自动备份</strong>保存在数据库旁的 backups 目录，每日一份；恢复前还会额外生成安全快照。JSON 导出适合跨设备迁移。
            </p>
            <p>
              <strong>初始词库</strong>位于 <code>public/seed_words.json</code>。替换该文件后重新构建，可让全新安装使用你的词表；“恢复初始词库”只补入缺失词条，不重置已有进度。
            </p>
          </div>
        </section>

        <section className="panel settings-panel">
          <header className="panel__head">
            <div>
              <p className="eyebrow">ABOUT</p>
              <h2>关于</h2>
            </div>
          </header>
          <div className="about-list">
            <div>
              <span>程序</span>
              <strong>TypeWord · 字里行间</strong>
            </div>
            <div>
              <span>版本</span>
              <strong>{__APP_VERSION__}</strong>
            </div>
            <div>
              <span>技术栈</span>
              <strong>Tauri 2 · React · SQLite</strong>
            </div>
            <div>
              <span>网络</span>
              <strong>完全离线，无远程 API</strong>
            </div>
          </div>
          <p className="about-note">
            学习状态与复习日志保存在本机 SQLite。关闭程序不会丢失数据；卸载或迁移前请先导出 JSON。
          </p>
        </section>
      </div>

      {pendingImport ? (
        <ImportOptionsModal
          key={`${pendingImport.name}-${pendingImport.lastModified}`}
          file={pendingImport}
          onClose={() => setPendingImport(null)}
          onImport={handleImport}
        />
      ) : null}

      <Modal
        open={resetOpen}
        title="重置全部学习进度？"
        subtitle="单词内容会保留，权重、答题统计与全部复习日志将被清除。"
        onClose={() => setResetOpen(false)}
      >
        <div className="confirm-body">
          <p>
            重置后所有单词回到初始权重 3.00，复习时间为现在。此操作不可撤销，建议先导出备份。
          </p>
          <div className="form-actions">
            <Button
              variant="danger"
              onClick={() => void handleReset()}
              disabled={resetting}
              icon={<Icon name="refresh" size={15} />}
            >
              {resetting ? '正在重置…' : '确认重置'}
            </Button>
            <Button onClick={() => setResetOpen(false)} disabled={resetting}>
              取消
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={restoreTarget !== null}
        title="恢复这份备份？"
        subtitle="当前词库、分组、学习进度与复习日志都会被备份内容覆盖。"
        onClose={() => setRestoreTarget(null)}
      >
        {restoreTarget ? (
          <div className="confirm-body">
            <div className="confirm-word">{restoreTarget.fileName}</div>
            <p>
              {formatDateTime(restoreTarget.createdAt)} · {formatBytes(restoreTarget.size)}
            </p>
            <p>
              恢复前会自动生成一份安全快照；恢复完成后程序会自动重新载入。若当前有未备份的进度，请先取消并点击“立即备份”。
            </p>
            <div className="form-actions">
              <Button
                variant="danger"
                onClick={() => void handleRestoreBackup()}
                disabled={restoring}
                icon={<Icon name="refresh" size={15} />}
              >
                {restoring ? '正在恢复…' : '确认恢复'}
              </Button>
              <Button onClick={() => setRestoreTarget(null)} disabled={restoring}>
                取消
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={importReport !== null}
        title="导入结果"
        subtitle="采用逐条校验，异常记录不会打断其余词条的导入。"
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
