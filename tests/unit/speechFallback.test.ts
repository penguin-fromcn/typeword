import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

interface FakeVoice {
  name: string;
  lang: string;
  localService: boolean;
}

class FakeUtterance {
  text: string;
  lang = '';
  rate = 1;
  pitch = 1;
  volume = 1;
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

function installWindow(voices: FakeVoice[], native: boolean): { spoken: string[] } {
  const spoken: string[] = [];
  const speechSynthesis = {
    getVoices: () => voices,
    speak: (utterance: FakeUtterance) => {
      spoken.push(utterance.text);
      queueMicrotask(() => utterance.onend?.());
    },
    cancel: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  const fakeWindow = {
    speechSynthesis,
    SpeechSynthesisUtterance: FakeUtterance,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    ...(native ? { __TAURI_INTERNALS__: {} } : {}),
  };

  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  return { spoken };
}

function nativeVoice(id: string, name: string, lang: string) {
  return { id, name, lang };
}

describe('speechService 双后端', () => {
  beforeEach(() => {
    vi.resetModules();
    invokeMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('WebView2 没有英文语音时改用 SAPI', async () => {
    installWindow([{ name: 'Microsoft Huihui', lang: 'zh-CN', localService: true }], true);
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'tts_list_voices') {
        return [nativeVoice('zira', 'Microsoft Zira Desktop', 'en-US')];
      }
      return undefined;
    });

    const { speechService } = await import('../../src/services/speechService');
    await speechService.initialize();

    expect(speechService.isAvailable()).toBe(true);
    expect(speechService.getBackendSnapshot()).toBe('sapi');
    expect(invokeMock).toHaveBeenCalledWith('tts_list_voices');

    await speechService.speak('reflection');
    expect(invokeMock).toHaveBeenCalledWith(
      'tts_speak',
      expect.objectContaining({
        text: 'reflection',
        voiceId: 'zira',
        rate: 0.9,
        volume: 1,
      }),
    );
  });

  it('WebView2 只有在线英文语音时优先使用本地 SAPI', async () => {
    installWindow(
      [{ name: 'Online English', lang: 'en-US', localService: false }],
      true,
    );
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'tts_list_voices') {
        return [nativeVoice('zira', 'Microsoft Zira Desktop', 'en-US')];
      }
      return undefined;
    });

    const { speechService } = await import('../../src/services/speechService');
    await speechService.initialize();

    expect(speechService.getBackendSnapshot()).toBe('sapi');
  });

  it('WebView2 有本地英文语音时不启用 SAPI', async () => {
    const { spoken } = installWindow(
      [{ name: 'Test English', lang: 'en-US', localService: true }],
      true,
    );

    const { speechService } = await import('../../src/services/speechService');
    await speechService.initialize();

    expect(speechService.getBackendSnapshot()).toBe('web');
    expect(invokeMock).not.toHaveBeenCalledWith('tts_list_voices');

    await speechService.speak('paper');
    expect(spoken).toEqual(['paper']);
  });

  it('口音、语速与音量会传给 SAPI', async () => {
    installWindow([{ name: 'Microsoft Huihui', lang: 'zh-CN', localService: true }], true);
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'tts_list_voices') {
        return [
          nativeVoice('zira', 'Microsoft Zira Desktop', 'en-US'),
          nativeVoice('hazel', 'Microsoft Hazel Desktop', 'en-GB'),
        ];
      }
      return undefined;
    });

    const { speechService } = await import('../../src/services/speechService');
    await speechService.initialize();
    speechService.configure({ accent: 'gb', rate: 1.25, volume: 0.4 });

    await speechService.speak('colour');
    expect(invokeMock).toHaveBeenCalledWith(
      'tts_speak',
      expect.objectContaining({
        text: 'colour',
        voiceId: 'hazel',
        rate: 1.25,
        volume: 0.4,
      }),
    );
  });

  it('两个后端都没有英文语音时保持不可用', async () => {
    installWindow([{ name: 'Microsoft Huihui', lang: 'zh-CN', localService: true }], true);
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'tts_list_voices') return [];
      return undefined;
    });

    const { speechService } = await import('../../src/services/speechService');
    await speechService.initialize();

    expect(speechService.isAvailable()).toBe(false);
    expect(speechService.getBackendSnapshot()).toBeNull();
    expect(speechService.isSupported()).toBe(true);
  });

  it('停止会立即结束 SAPI 朗读', async () => {
    installWindow([{ name: 'Microsoft Huihui', lang: 'zh-CN', localService: true }], true);
    invokeMock.mockImplementation((command: string) => {
      if (command === 'tts_list_voices') {
        return Promise.resolve([nativeVoice('zira', 'Microsoft Zira Desktop', 'en-US')]);
      }
      if (command === 'tts_speak') return new Promise<void>(() => undefined);
      return Promise.resolve(undefined);
    });

    const { speechService } = await import('../../src/services/speechService');
    await speechService.initialize();

    const speaking = speechService.speak('stop me');
    speechService.stop();

    await expect(speaking).resolves.toBeUndefined();
    expect(invokeMock).toHaveBeenCalledWith('tts_stop');
  });
});
