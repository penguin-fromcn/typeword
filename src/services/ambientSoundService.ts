export type AmbientTrackId =
  | 'rain'
  | 'coffee-shop'
  | 'fireplace'
  | 'birds'
  | 'summer-night'
  | 'wind';

export type AmbientSoundId = 'off' | AmbientTrackId;

export interface AmbientTrack {
  id: AmbientTrackId;
  label: string;
  en: string;
  file: string;
  credit: string;
}

export const AMBIENT_TRACKS: readonly AmbientTrack[] = [
  {
    id: 'rain',
    label: '雨声',
    en: 'RAIN',
    file: 'rain.ogg',
    credit:
      'alex36917 · Freesound #524605 · CC BY 3.0 · 编辑：Porrumentzio',
  },
  {
    id: 'coffee-shop',
    label: '咖啡馆',
    en: 'CAFÉ',
    file: 'coffee-shop.ogg',
    credit: 'stephan · SoundBible #1664 · Public Domain',
  },
  {
    id: 'fireplace',
    label: '壁炉',
    en: 'HEARTH',
    file: 'fireplace.ogg',
    credit: 'ezwa · SoundBible #1543 · Public Domain',
  },
  {
    id: 'birds',
    label: '鸟鸣',
    en: 'BIRDS',
    file: 'birds.ogg',
    credit: 'kvgarlic · Freesound #156826 · CC0 · 编辑：Porrumentzio',
  },
  {
    id: 'summer-night',
    label: '夏夜虫鸣',
    en: 'NIGHT',
    file: 'summer-night.ogg',
    credit: 'Lisa Redfern · SoundBible #2083 · Public Domain',
  },
  {
    id: 'wind',
    label: '风声',
    en: 'WIND',
    file: 'wind.ogg',
    credit: 'felix.blume · Freesound #217506 · CC0 · 编辑：Porrumentzio',
  },
];

export const DEFAULT_AMBIENT_VOLUME = 0.35;

const TRACK_BY_ID = new Map(AMBIENT_TRACKS.map((track) => [track.id, track]));
const FADE_IN_MS = 700;
const FADE_OUT_MS = 320;
const FADE_STEP_MS = 40;

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AMBIENT_VOLUME;
  return Math.min(Math.max(value, 0), 1);
}

export function parseAmbientSound(value: string | undefined): AmbientSoundId {
  if (!value || value === 'off') return 'off';
  return TRACK_BY_ID.has(value as AmbientTrackId) ? (value as AmbientTrackId) : 'off';
}

export function getAmbientTrack(id: AmbientSoundId): AmbientTrack | null {
  return id === 'off' ? null : (TRACK_BY_ID.get(id) ?? null);
}

export function ambientSource(id: AmbientTrackId): string {
  const track = TRACK_BY_ID.get(id);
  return track ? `/ambient/${track.file}` : '';
}

class AmbientSoundService {
  private audio: HTMLAudioElement | null = null;
  private current: AmbientSoundId = 'off';
  private volume = DEFAULT_AMBIENT_VOLUME;
  private token = 0;
  private playing = false;
  private fadeActive = false;
  private cancelFade: (() => void) | null = null;
  private retryPending = false;
  private unlockBound = false;

  sync(sound: AmbientSoundId, volume: number): void {
    this.setVolume(volume);
    if (sound === this.current) return;
    this.current = sound;
    void this.transition(sound);
  }

  setVolume(volume: number): void {
    this.volume = clampVolume(volume);
    if (this.audio && this.playing && !this.fadeActive) {
      this.audio.volume = this.volume;
    }
  }

  private async transition(next: AmbientSoundId): Promise<void> {
    const token = ++this.token;
    this.retryPending = false;
    const audio = this.ensureAudio();
    if (!audio) return;

    if (next === 'off') {
      if (this.playing) {
        const faded = await this.fade(audio, 0, FADE_OUT_MS, token);
        if (!faded || token !== this.token) return;
      }
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      this.playing = false;
      return;
    }

    if (this.playing) {
      const faded = await this.fade(audio, 0, FADE_OUT_MS, token);
      if (!faded || token !== this.token) return;
      audio.pause();
      this.playing = false;
    }

    audio.src = ambientSource(next);
    audio.loop = true;
    audio.volume = 0;

    try {
      await audio.play();
    } catch (error) {
      if (token !== this.token) return;
      this.playing = false;
      this.retryPending = true;
      this.bindUnlock();
      const name = error instanceof Error ? error.name : '';
      if (name !== 'NotAllowedError') {
        console.warn('TypeWord 环境音播放失败', error);
      }
      return;
    }

    if (token !== this.token) return;
    this.playing = true;
    await this.fade(audio, () => this.volume, FADE_IN_MS, token);
  }

  private fade(
    audio: HTMLAudioElement,
    target: number | (() => number),
    duration: number,
    token: number,
  ): Promise<boolean> {
    this.cancelFade?.();

    return new Promise<boolean>((resolve) => {
      let settled = false;
      let timer = 0;
      let cancel: () => void = () => undefined;

      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (this.cancelFade === cancel) this.cancelFade = null;
        if (token === this.token) this.fadeActive = false;
        resolve(value);
      };

      cancel = () => finish(false);
      this.cancelFade = cancel;
      this.fadeActive = true;

      if (!Number.isFinite(duration) || duration <= 0) {
        audio.volume = clampVolume(typeof target === 'function' ? target() : target);
        finish(token === this.token);
        return;
      }

      const started = Date.now();
      const from = audio.volume;
      const step = () => {
        if (token !== this.token) {
          finish(false);
          return;
        }
        const progress = Math.min(Math.max((Date.now() - started) / duration, 0), 1);
        const to = typeof target === 'function' ? target() : target;
        audio.volume = clampVolume(from + (to - from) * progress);
        if (progress >= 1) {
          finish(token === this.token);
          return;
        }
        timer = window.setTimeout(step, FADE_STEP_MS);
      };
      step();
    });
  }

  private ensureAudio(): HTMLAudioElement | null {
    if (this.audio) return this.audio;
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;

    const audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0;
    this.audio = audio;
    return audio;
  }

  private bindUnlock(): void {
    if (this.unlockBound || typeof window === 'undefined') return;
    this.unlockBound = true;
    window.addEventListener('pointerdown', this.handleUnlock, { once: true, capture: true });
    window.addEventListener('keydown', this.handleUnlock, { once: true, capture: true });
  }

  private unbindUnlock(): void {
    if (!this.unlockBound || typeof window === 'undefined') return;
    this.unlockBound = false;
    window.removeEventListener('pointerdown', this.handleUnlock, { capture: true });
    window.removeEventListener('keydown', this.handleUnlock, { capture: true });
  }

  private handleUnlock = (): void => {
    this.unbindUnlock();
    if (!this.retryPending || this.current === 'off') return;
    this.retryPending = false;
    void this.transition(this.current);
  };
}

export const ambientSoundService = new AmbientSoundService();
