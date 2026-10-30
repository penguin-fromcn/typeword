import { pickRandom } from '../utils/random';

type SoundName =
  | 'key'
  | 'backspace'
  | 'submit'
  | 'correct'
  | 'wrong'
  | 'pageTurn'
  | 'pageTurnBack';

const SOURCES: Record<Exclude<SoundName, 'key'>, string> = {
  backspace: '/audio/backspace.wav',
  submit: '/audio/submit.wav',
  correct: '/audio/correct.wav',
  wrong: '/audio/wrong.wav',
  pageTurn: '/audio/page-turn.wav',
  pageTurnBack: '/audio/page-turn-back.wav',
};

const KEY_SOURCES = ['/audio/key-01.wav', '/audio/key-02.wav', '/audio/key-03.wav'];

const FALLBACK_MS: Record<SoundName, number> = {
  key: 60,
  backspace: 120,
  submit: 80,
  correct: 340,
  wrong: 320,
  pageTurn: 460,
  pageTurnBack: 460,
};

interface Pool {
  elements: HTMLAudioElement[];
  cursor: number;
  missing: boolean;
}

class AudioService {
  private enabled = true;
  private volume = 0.55;
  private pools = new Map<string, Pool>();
  private preloaded = false;
  private context: AudioContext | null = null;
  private feedbackCompletion: Promise<void> = Promise.resolve();

  preload(): void {
    if (this.preloaded || typeof window === 'undefined' || typeof Audio === 'undefined') return;
    this.preloaded = true;

    for (const source of [...KEY_SOURCES, ...Object.values(SOURCES)]) {
      this.createPool(source);
    }
  }

  private createPool(source: string): Pool {
    const existing = this.pools.get(source);
    if (existing) return existing;

    const elements: HTMLAudioElement[] = [];
    for (let index = 0; index < 2; index += 1) {
      const audio = new Audio(source);
      audio.preload = 'auto';
      audio.volume = this.volume;
      audio.addEventListener('error', () => {
        const pool = this.pools.get(source);
        if (pool) pool.missing = true;
        console.warn(`[TypeWord] 音效缺失，已启用 Web Audio 回退：${source}`);
      });
      audio.load();
      elements.push(audio);
    }

    const pool: Pool = { elements, cursor: 0, missing: false };
    this.pools.set(source, pool);
    return pool;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setVolume(volume: number): void {
    this.volume = Math.min(Math.max(volume, 0), 1);
    for (const pool of this.pools.values()) {
      for (const audio of pool.elements) {
        audio.volume = this.volume;
      }
    }
  }

  unlock(): void {
    if (!this.enabled) return;
    try {
      this.ensureContext()?.resume().catch(() => undefined);
    } catch {
      // 音频不可用时不影响答题
    }
  }

  playKey(): void {
    void this.playSource(pickRandom(KEY_SOURCES) ?? KEY_SOURCES[0], 'key');
  }

  playBackspace(): void {
    void this.playSource(SOURCES.backspace, 'backspace');
  }

  playSubmit(): void {
    void this.playSource(SOURCES.submit, 'submit');
  }

  playCorrect(): void {
    this.feedbackCompletion = this.playSource(SOURCES.correct, 'correct');
  }

  playWrong(): void {
    this.feedbackCompletion = this.playSource(SOURCES.wrong, 'wrong');
  }

  waitForFeedback(): Promise<void> {
    return this.feedbackCompletion;
  }

  playPageTurn(back = false): void {
    void this.playSource(
      back ? SOURCES.pageTurnBack : SOURCES.pageTurn,
      back ? 'pageTurnBack' : 'pageTurn',
    );
  }

  private playSource(source: string, name: SoundName): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    try {
      const pool = this.pools.get(source) ?? this.createPool(source);
      if (pool.missing) {
        this.synthesize(name);
        return this.wait(FALLBACK_MS[name]);
      }
      const audio = pool.elements[pool.cursor % pool.elements.length];
      pool.cursor += 1;

      return new Promise<void>((resolve) => {
        let settled = false;
        let fallback = false;
        let guard = 0;
        const finish = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(guard);
          audio.removeEventListener('ended', finish);
          audio.removeEventListener('error', startFallback);
          resolve();
        };
        const startFallback = () => {
          if (settled || fallback) return;
          fallback = true;
          pool.missing = true;
          this.synthesize(name);
          window.clearTimeout(guard);
          guard = window.setTimeout(finish, FALLBACK_MS[name]);
        };

        audio.addEventListener('ended', finish);
        audio.addEventListener('error', startFallback);
        audio.volume = this.volume;
        audio.currentTime = 0;
        guard = window.setTimeout(finish, 1_600);

        const promise = audio.play();
        if (promise) promise.catch(startFallback);
      });
    } catch {
      this.synthesize(name);
      return this.wait(FALLBACK_MS[name]);
    }
  }

  private wait(duration: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, duration);
    });
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const ContextClass = window.AudioContext;
    if (!ContextClass) return null;
    if (!this.context) this.context = new ContextClass();
    return this.context;
  }

  private synthesize(name: SoundName): void {
    try {
      const context = this.ensureContext();
      if (!context) return;
      void context.resume();

      const now = context.currentTime;
      if (name === 'pageTurn' || name === 'pageTurnBack') {
        this.paperNoise(context, now, name === 'pageTurnBack');
        return;
      }

      const gain = context.createGain();
      gain.connect(context.destination);
      gain.gain.value = 0;

      if (name === 'correct') {
        this.tone(context, gain, 660, now, 0.09, 0.06);
        this.tone(context, gain, 880, now + 0.1, 0.14, 0.05);
        return;
      }
      if (name === 'wrong') {
        this.tone(context, gain, 170, now, 0.16, 0.07);
        this.tone(context, gain, 130, now + 0.06, 0.16, 0.04);
        return;
      }

      const frequency = name === 'backspace' ? 420 : name === 'submit' ? 180 : 1_600;
      this.tone(context, gain, frequency, now, name === 'submit' ? 0.06 : 0.025, 0.05);
    } catch {
      // 音频失败只记录在内部，不阻断主流程
    }
  }

  private paperNoise(context: AudioContext, start: number, back: boolean): void {
    const duration = back ? 0.46 : 0.4;
    const buffer = context.createBuffer(
      1,
      Math.max(1, Math.floor(context.sampleRate * duration)),
      context.sampleRate,
    );
    const data = buffer.getChannelData(0);
    let smoothed = 0;
    let body = 0;
    for (let index = 0; index < data.length; index += 1) {
      const white = Math.random() * 2 - 1;
      smoothed = smoothed * 0.72 + white * 0.28;
      body = body * 0.965 + white * 0.035;
      const progress = index / data.length;
      const lift = Math.pow(Math.sin(Math.PI * Math.min(1, progress / 0.72)), 1.2);
      const flap = Math.exp(-Math.pow((progress - 0.62) / 0.12, 2));
      const envelope = lift * (0.26 + 0.74 * flap);
      data[index] = (smoothed * 1.15 + body * 2.4 + white * 0.12) * envelope * 0.3;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    if (back) source.playbackRate.value = 0.92;

    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = back ? 1_400 : 1_800;
    lowpass.Q.value = 0.5;

    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 120;

    const gain = context.createGain();
    gain.gain.value = this.volume;
    source.connect(lowpass);
    lowpass.connect(highpass);
    highpass.connect(gain);
    gain.connect(context.destination);
    source.start(start);
  }

  private tone(
    context: AudioContext,
    gain: GainNode,
    frequency: number,
    start: number,
    duration: number,
    volume: number,
  ): void {
    const oscillator = context.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(60, frequency * 0.72),
      start + duration,
    );
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, volume * this.volume),
      start + 0.004,
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(gain);
    gain.gain.value = 1;
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }
}

export const audioService = new AudioService();
