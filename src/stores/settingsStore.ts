import { create } from 'zustand';
import {
  DEFAULT_AMBIENT_VOLUME,
  parseAmbientSound,
  type AmbientSoundId,
} from '../services/ambientSoundService';
import { repository } from '../services/repository';
import type { SpeechAccent } from '../services/speechService';

export interface AppSettings {
  soundEnabled: boolean;
  soundVolume: number;
  ambientSound: AmbientSoundId;
  ambientVolume: number;
  pronunciationEnabled: boolean;
  autoPronounceEnabled: boolean;
  speechRate: number;
  speechVolume: number;
  speechAccent: SpeechAccent;
  theme: 'paper';
  dailyGoal: number;
  hintEnabled: boolean;
  autoNextQuestion: boolean;
  defaultStudyCategory: string;
  defaultStudyDifficulty: number;
  learnAutoSpeak: boolean;
  learnListenOnly: boolean;
}

export const defaultSettings: AppSettings = {
  soundEnabled: true,
  soundVolume: 0.55,
  ambientSound: 'off',
  ambientVolume: DEFAULT_AMBIENT_VOLUME,
  pronunciationEnabled: true,
  autoPronounceEnabled: true,
  speechRate: 0.9,
  speechVolume: 1,
  speechAccent: 'auto',
  theme: 'paper',
  dailyGoal: 20,
  hintEnabled: true,
  autoNextQuestion: false,
  defaultStudyCategory: '',
  defaultStudyDifficulty: 0,
  learnAutoSpeak: false,
  learnListenOnly: false,
};

const KEY_MAP: Record<keyof AppSettings, string> = {
  soundEnabled: 'sound_enabled',
  soundVolume: 'sound_volume',
  ambientSound: 'ambient_sound',
  ambientVolume: 'ambient_volume',
  pronunciationEnabled: 'pronunciation_enabled',
  autoPronounceEnabled: 'auto_pronounce_enabled',
  speechRate: 'speech_rate',
  speechVolume: 'speech_volume',
  speechAccent: 'speech_accent',
  theme: 'theme',
  dailyGoal: 'daily_goal',
  hintEnabled: 'hint_enabled',
  autoNextQuestion: 'auto_next_question',
  defaultStudyCategory: 'default_study_category',
  defaultStudyDifficulty: 'default_study_difficulty',
  learnAutoSpeak: 'learn_auto_speak',
  learnListenOnly: 'learn_listen_only',
};

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function parseAccent(value: string | undefined): SpeechAccent {
  return value === 'us' || value === 'gb' ? value : 'auto';
}

export function settingsFromRecord(record: Record<string, string>): AppSettings {
  return {
    soundEnabled: parseBoolean(record[KEY_MAP.soundEnabled], defaultSettings.soundEnabled),
    soundVolume: clamp(
      parseNumber(record[KEY_MAP.soundVolume], defaultSettings.soundVolume),
      0,
      1,
    ),
    ambientSound: parseAmbientSound(record[KEY_MAP.ambientSound]),
    ambientVolume: clamp(
      parseNumber(record[KEY_MAP.ambientVolume], defaultSettings.ambientVolume),
      0,
      1,
    ),
    pronunciationEnabled: parseBoolean(
      record[KEY_MAP.pronunciationEnabled],
      defaultSettings.pronunciationEnabled,
    ),
    autoPronounceEnabled: parseBoolean(
      record[KEY_MAP.autoPronounceEnabled],
      defaultSettings.autoPronounceEnabled,
    ),
    speechRate: clamp(
      parseNumber(record[KEY_MAP.speechRate], defaultSettings.speechRate),
      0.5,
      1.5,
    ),
    speechVolume: clamp(
      parseNumber(record[KEY_MAP.speechVolume], defaultSettings.speechVolume),
      0,
      1,
    ),
    speechAccent: parseAccent(record[KEY_MAP.speechAccent]),
    theme: 'paper',
    dailyGoal: Math.max(
      1,
      Math.round(parseNumber(record[KEY_MAP.dailyGoal], defaultSettings.dailyGoal)),
    ),
    hintEnabled: parseBoolean(record[KEY_MAP.hintEnabled], defaultSettings.hintEnabled),
    autoNextQuestion: parseBoolean(
      record[KEY_MAP.autoNextQuestion],
      defaultSettings.autoNextQuestion,
    ),
    defaultStudyCategory: record[KEY_MAP.defaultStudyCategory] ?? '',
    defaultStudyDifficulty: Math.round(
      parseNumber(record[KEY_MAP.defaultStudyDifficulty], defaultSettings.defaultStudyDifficulty),
    ),
    learnAutoSpeak: parseBoolean(
      record[KEY_MAP.learnAutoSpeak],
      defaultSettings.learnAutoSpeak,
    ),
    learnListenOnly: parseBoolean(
      record[KEY_MAP.learnListenOnly],
      defaultSettings.learnListenOnly,
    ),
  };
}

function serializeSetting(value: AppSettings[keyof AppSettings]): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  load: () => Promise<void>;
  hydrate: (record: Record<string, string>) => void;
  update: (patch: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultSettings,
  loaded: false,

  hydrate: (record) => {
    set({ settings: settingsFromRecord(record), loaded: true });
  },

  load: async () => {
    const record = await repository.getSettings();
    set({ settings: settingsFromRecord(record), loaded: true });
  },

  update: async (patch) => {
    const previous = get().settings;
    const next = { ...previous, ...patch };
    set({ settings: next });

    try {
      const now = Date.now();
      await Promise.all(
        (Object.keys(patch) as Array<keyof AppSettings>).map((key) =>
          repository.setSetting(KEY_MAP[key], serializeSetting(next[key]), now),
        ),
      );
    } catch (error) {
      set({ settings: previous });
      throw error;
    }
  },
}));
