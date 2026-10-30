import { describe, expect, it } from 'vitest';
import { pickEnglishVoice, type VoiceOption } from '../../src/services/speechService';

function voice(name: string, lang: string, localService = true): VoiceOption {
  return { name, lang, localService };
}

describe('pickEnglishVoice', () => {
  it('优先选择本地英文语音，并偏好 en-US', () => {
    const picked = pickEnglishVoice([
      voice('Chinese', 'zh-CN'),
      voice('English UK', 'en-GB'),
      voice('English US Online', 'en-US', false),
      voice('English US Local', 'en-US'),
    ]);

    expect(picked?.name).toBe('English US Local');
  });

  it('没有本地语音时使用在线英文语音', () => {
    const picked = pickEnglishVoice([
      voice('English US Online', 'en-US', false),
      voice('English UK Online', 'en-GB', false),
    ]);

    expect(picked?.name).toBe('English US Online');
  });

  it('没有英文语音时返回 null', () => {
    expect(
      pickEnglishVoice([voice('Chinese', 'zh-CN'), voice('Japanese', 'ja-JP')]),
    ).toBeNull();
  });

  it('按口音偏好选择美音或英音', () => {
    const voices = [
      voice('English US Local', 'en-US'),
      voice('English UK Local', 'en-GB'),
    ];

    expect(pickEnglishVoice(voices, 'us')?.name).toBe('English US Local');
    expect(pickEnglishVoice(voices, 'gb')?.name).toBe('English UK Local');
  });

  it('偏好口音不可用时回退到其他英文语音', () => {
    const picked = pickEnglishVoice(
      [voice('Chinese', 'zh-CN'), voice('English UK Local', 'en-GB')],
      'us',
    );

    expect(picked?.name).toBe('English UK Local');
  });
});
