import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { LearnPage } from './features/learn/LearnPage';
import { WordCardPage } from './features/learn/WordCardPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { StatisticsPage } from './features/statistics/StatisticsPage';
import { StudyPage } from './features/study/StudyPage';
import { WordListPage } from './features/words/WordListPage';
import { ambientSoundService } from './services/ambientSoundService';
import { audioService } from './services/audioService';
import { bootstrapDatabase } from './services/bootstrapService';
import { repository } from './services/repository';
import { speechService } from './services/speechService';
import { dayKey } from './domain/statistics';
import { useSettingsStore } from './stores/settingsStore';
import { useUiStore } from './stores/uiStore';

let bootstrapPromise: ReturnType<typeof bootstrapDatabase> | null = null;

function runBootstrap() {
  if (!bootstrapPromise) bootstrapPromise = bootstrapDatabase();
  return bootstrapPromise;
}

export function App() {
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const soundEnabled = useSettingsStore((state) => state.settings.soundEnabled);
  const soundVolume = useSettingsStore((state) => state.settings.soundVolume);
  const ambientSound = useSettingsStore((state) => state.settings.ambientSound);
  const ambientVolume = useSettingsStore((state) => state.settings.ambientVolume);
  const speechRate = useSettingsStore((state) => state.settings.speechRate);
  const speechVolume = useSettingsStore((state) => state.settings.speechVolume);
  const speechAccent = useSettingsStore((state) => state.settings.speechAccent);
  const setBootWarning = useUiStore((state) => state.setBootWarning);
  const setDatabasePath = useUiStore((state) => state.setDatabasePath);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        const result = await runBootstrap();
        await useSettingsStore.getState().load();
        const databasePath = await repository.getDatabasePath();
        if (cancelled) return;

        setDatabasePath(databasePath);
        if (result.seedWarning) setBootWarning(result.seedWarning);

        const settings = useSettingsStore.getState().settings;
        audioService.setEnabled(settings.soundEnabled);
        audioService.setVolume(settings.soundVolume);
        audioService.preload();
        setReady(true);

        if (repository.kind === 'tauri') {
          const now = Date.now();
          void repository
            .createBackup(dayKey(now), now, false)
            .catch((error) => console.warn('TypeWord 自动备份失败', error));
        }
      } catch (error) {
        if (cancelled) return;
        setFatal(error instanceof Error ? error.message : '本地数据库初始化失败');
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, [setBootWarning, setDatabasePath]);

  useEffect(() => {
    audioService.setEnabled(soundEnabled);
    audioService.setVolume(soundVolume);
  }, [soundEnabled, soundVolume]);

  useEffect(() => {
    ambientSoundService.sync(ambientSound, ambientVolume);
  }, [ambientSound, ambientVolume]);

  useEffect(() => {
    speechService.configure({
      rate: speechRate,
      volume: speechVolume,
      accent: speechAccent,
    });
  }, [speechAccent, speechRate, speechVolume]);

  useEffect(() => {
    const unlock = () => audioService.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  if (fatal) {
    return (
      <div className="boot-screen boot-screen--error">
        <div className="boot-card">
          <p className="eyebrow">BOOT FAILURE</p>
          <h1>纸张没有装好</h1>
          <p className="boot-card__message">{fatal}</p>
          <p className="boot-card__hint">
            请确认程序有写入本地应用数据目录的权限，然后重新启动。浏览器预览模式使用 localStorage。
          </p>
          <button className="btn btn--primary btn--md" onClick={() => window.location.reload()}>
            <span>重新载入</span>
          </button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="boot-screen">
        <div className="boot-card boot-card--quiet">
          <span className="boot-mark">T</span>
          <p className="eyebrow">TYPEWORD · 字里行间</p>
          <h1>正在装纸、上墨。</h1>
          <div className="boot-line">
            <span />
          </div>
          <p className="boot-card__hint">初始化本地数据库与初始词库…</p>
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="study" element={<StudyPage />} />
          <Route path="learn" element={<LearnPage />} />
          <Route path="card/:wordId" element={<WordCardPage />} />
          <Route path="words" element={<WordListPage />} />
          <Route path="stats" element={<StatisticsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
