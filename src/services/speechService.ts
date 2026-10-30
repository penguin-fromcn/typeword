import { invoke } from '@tauri-apps/api/core';

const SPEECH_TIMEOUT_MS = 6_000;

export type SpeechAccent = 'auto' | 'us' | 'gb';
export type SpeechBackend = 'web' | 'sapi' | null;

export interface VoiceOption {
  name: string;
  lang: string;
  localService: boolean;
}

interface NativeVoice extends VoiceOption {
  id: string;
}

function matchesAccent(lang: string, accent: SpeechAccent): boolean {
  if (accent === 'us') return /^en[-_]US/i.test(lang);
  if (accent === 'gb') return /^en[-_]GB/i.test(lang);
  return true;
}

export function pickEnglishVoice<T extends VoiceOption>(
  voices: readonly T[],
  accent: SpeechAccent = 'auto',
): T | null {
  const english = voices.filter((voice) => /^en([-_]|$)/i.test(voice.lang));
  if (english.length === 0) return null;

  const preferred = english.filter((voice) => matchesAccent(voice.lang, accent));
  const pool = preferred.length > 0 ? preferred : english;
  const local = pool.filter((voice) => voice.localService);
  const candidates = local.length > 0 ? local : pool;

  return (
    candidates.find((voice) => /^en[-_]US/i.test(voice.lang)) ??
    candidates.find((voice) => /^en[-_]GB/i.test(voice.lang)) ??
    candidates[0] ??
    null
  );
}

function supportsWebSpeech(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.SpeechSynthesisUtterance === 'function'
  );
}

function hasTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

interface SpeechConfig {
  accent?: SpeechAccent;
  rate?: number;
  volume?: number;
}

interface ActiveSpeech {
  finish: () => void;
}

class SpeechService {
  private readonly webSupported = supportsWebSpeech();
  private readonly desktop = hasTauriRuntime();
  private readonly listeners = new Set<() => void>();

  private webVoices: SpeechSynthesisVoice[] = [];
  private webVoice: SpeechSynthesisVoice | null = null;
  private nativeVoices: NativeVoice[] = [];
  private nativeVoice: NativeVoice | null = null;
  private backend: SpeechBackend = null;
  private available = false;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private fallbackPromise: Promise<void> | null = null;

  private accent: SpeechAccent = 'auto';
  private rate = 0.9;
  private volume = 1;
  private generation = 0;
  private nativeSpeaking = false;
  private active: ActiveSpeech | null = null;

  constructor() {
    if (this.webSupported) this.bindVoices();
    void this.initialize();
  }

  isSupported(): boolean {
    return this.webSupported || this.desktop;
  }

  isAvailable(): boolean {
    return this.available;
  }

  initialize(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.resolveBackend().finally(() => {
        this.initialized = true;
      });
    }
    return this.initPromise;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): boolean => this.available;

  getBackendSnapshot = (): SpeechBackend => this.backend;

  configure(config: SpeechConfig): void {
    const accentChanged = config.accent !== undefined && config.accent !== this.accent;
    if (config.accent !== undefined) this.accent = config.accent;
    if (config.rate !== undefined && Number.isFinite(config.rate)) {
      this.rate = Math.min(Math.max(config.rate, 0.5), 1.5);
    }
    if (config.volume !== undefined && Number.isFinite(config.volume)) {
      this.volume = Math.min(Math.max(config.volume, 0), 1);
    }
    if (accentChanged) this.applyAccent();
  }

  async speak(text: string): Promise<void> {
    const value = text.trim();
    if (value.length === 0) return;

    this.stop();
    const generation = this.generation;
    if (!this.initialized) await this.initialize();
    if (generation !== this.generation) return;

    if (this.backend === 'web' && this.webVoice) {
      return this.speakWeb(value);
    }
    if (this.backend === 'sapi' && this.nativeVoice) {
      return this.speakNative(value);
    }
  }

  stop(): void {
    this.generation += 1;
    this.stopPlayback();
  }

  private async resolveBackend(): Promise<void> {
    let webVoice: SpeechSynthesisVoice | null = null;
    if (this.webSupported) {
      await this.waitForWebVoices();
      this.webVoices = this.readWebVoices();
      webVoice = pickEnglishVoice(this.webVoices, this.accent);
      if (webVoice?.localService) {
        this.webVoice = webVoice;
        this.setBackend('web');
        return;
      }
    }

    if (this.desktop) {
      const voices = await this.loadNativeVoices();
      this.nativeVoices = voices;
      this.nativeVoice = pickEnglishVoice(voices, this.accent);
      if (this.nativeVoice) {
        this.setBackend('sapi');
        return;
      }
    }

    if (webVoice) {
      this.webVoice = webVoice;
      this.setBackend('web');
      return;
    }
    this.setBackend(null);
  }

  private speakWeb(value: string): Promise<void> {
    const voice = this.webVoice;
    if (!voice) return Promise.resolve();

    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = voice.lang;
    utterance.rate = this.rate;
    utterance.pitch = 1;
    utterance.volume = this.volume;
    utterance.voice = voice;

    return new Promise<void>((resolve) => {
      let settled = false;
      let timer = 0;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (this.active?.finish === finish) this.active = null;
        resolve();
      };

      utterance.onend = finish;
      utterance.onerror = finish;
      this.active = { finish };
      timer = window.setTimeout(finish, Math.max(SPEECH_TIMEOUT_MS, value.length * 180));

      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        finish();
      }
    });
  }

  private speakNative(value: string): Promise<void> {
    const voice = this.nativeVoice;
    if (!voice) return Promise.resolve();

    return new Promise<void>((resolve) => {
      let settled = false;
      let timer = 0;
      const finish = (cancelled = false) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (cancelled && this.desktop) {
          void invoke('tts_stop').catch(() => undefined);
        }
        if (this.active?.finish === finish) {
          this.active = null;
          this.nativeSpeaking = false;
        }
        resolve();
      };

      this.active = { finish };
      this.nativeSpeaking = true;
      timer = window.setTimeout(
        () => finish(true),
        Math.max(SPEECH_TIMEOUT_MS, value.length * 400 + 4_000),
      );

      invoke<void>('tts_speak', {
        text: value,
        voiceId: voice.id,
        rate: this.rate,
        volume: this.volume,
      })
        .catch((error) => {
          console.warn('TypeWord 系统语音朗读失败', error);
        })
        .finally(() => finish());
    });
  }

  private stopPlayback(): void {
    if (this.webSupported) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // 系统语音不可用时不影响页面操作
      }
    }
    if (this.desktop && this.nativeSpeaking) {
      this.nativeSpeaking = false;
      void invoke('tts_stop').catch(() => undefined);
    }
    const active = this.active;
    this.active = null;
    active?.finish();
  }

  private bindVoices(): void {
    try {
      window.speechSynthesis.addEventListener('voiceschanged', this.handleVoicesChanged);
    } catch {
      // 部分 WebView 不支持 voiceschanged，会在首次朗读时重新读取
    }
  }

  private handleVoicesChanged = (): void => {
    if (!this.webSupported) return;
    this.webVoices = this.readWebVoices();
    const next = pickEnglishVoice(this.webVoices, this.accent);

    if (this.backend === null) {
      if (next) {
        this.webVoice = next;
        this.setBackend('web');
      }
      return;
    }
    if (this.backend !== 'web') return;

    if (!next) {
      this.webVoice = null;
      void this.fallbackFromWeb();
      return;
    }
    this.webVoice = next;
  };

  private async fallbackFromWeb(): Promise<void> {
    if (this.fallbackPromise) return this.fallbackPromise;
    this.fallbackPromise = (async () => {
      if (!this.desktop) {
        this.setBackend(null);
        return;
      }
      const voices =
        this.nativeVoices.length > 0 ? this.nativeVoices : await this.loadNativeVoices();
      this.nativeVoices = voices;
      this.nativeVoice = pickEnglishVoice(voices, this.accent);
      this.setBackend(this.nativeVoice ? 'sapi' : null);
    })().finally(() => {
      this.fallbackPromise = null;
    });
    return this.fallbackPromise;
  }

  private applyAccent(): void {
    if (this.backend === 'web') {
      const next = pickEnglishVoice(this.webVoices, this.accent);
      if (next) {
        this.webVoice = next;
        return;
      }
      void this.fallbackFromWeb();
      return;
    }
    if (this.backend === 'sapi') {
      this.nativeVoice = pickEnglishVoice(this.nativeVoices, this.accent);
      if (!this.nativeVoice) void this.fallbackFromWeb();
    }
  }

  private setBackend(next: SpeechBackend): void {
    const available = next !== null;
    const changed = next !== this.backend || available !== this.available;
    this.backend = next;
    this.available = available;
    if (changed) {
      for (const listener of this.listeners) listener();
    }
  }

  private readWebVoices(): SpeechSynthesisVoice[] {
    try {
      return Array.from(window.speechSynthesis.getVoices());
    } catch {
      return [];
    }
  }

  private async waitForWebVoices(): Promise<void> {
    if (this.readWebVoices().length > 0) return;
    await new Promise<void>((resolve) => {
      let settled = false;
      let timer = 0;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        try {
          window.speechSynthesis.removeEventListener('voiceschanged', finish);
        } catch {
          // 不支持事件时直接结束等待
        }
        resolve();
      };
      timer = window.setTimeout(finish, 400);
      try {
        window.speechSynthesis.addEventListener('voiceschanged', finish);
      } catch {
        finish();
      }
    });
  }

  private async loadNativeVoices(): Promise<NativeVoice[]> {
    try {
      const voices = await invoke<NativeVoice[]>('tts_list_voices');
      if (!Array.isArray(voices)) return [];
      return voices
        .filter(
          (voice) =>
            voice !== null &&
            typeof voice.id === 'string' &&
            typeof voice.lang === 'string' &&
            /^en([-_]|$)/i.test(voice.lang),
        )
        .map((voice) => ({
          ...voice,
          name: typeof voice.name === 'string' && voice.name.trim() ? voice.name : voice.id,
          localService: true,
        }));
    } catch (error) {
      console.warn('TypeWord 无法读取 Windows 系统语音', error);
      return [];
    }
  }
}

export const speechService = new SpeechService();
