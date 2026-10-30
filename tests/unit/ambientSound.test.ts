import { describe, expect, it } from 'vitest';
import {
  AMBIENT_TRACKS,
  DEFAULT_AMBIENT_VOLUME,
  ambientSource,
  getAmbientTrack,
  parseAmbientSound,
} from '../../src/services/ambientSoundService';
import { defaultSettings, settingsFromRecord } from '../../src/stores/settingsStore';

describe('ambient sound settings', () => {
  it('默认关闭环境音并带默认音量', () => {
    const settings = settingsFromRecord({});
    expect(settings.ambientSound).toBe('off');
    expect(settings.ambientVolume).toBe(DEFAULT_AMBIENT_VOLUME);
    expect(defaultSettings.ambientSound).toBe('off');
  });

  it('识别六个内置音轨，未知值回退为关闭', () => {
    for (const track of AMBIENT_TRACKS) {
      expect(parseAmbientSound(track.id)).toBe(track.id);
    }
    expect(parseAmbientSound('rain')).toBe('rain');
    expect(parseAmbientSound('off')).toBe('off');
    expect(parseAmbientSound('thunderstorm')).toBe('off');
    expect(parseAmbientSound(undefined)).toBe('off');
  });

  it('从设置记录恢复音轨并限制音量范围', () => {
    const settings = settingsFromRecord({
      ambient_sound: 'summer-night',
      ambient_volume: '0.65',
    });
    expect(settings.ambientSound).toBe('summer-night');
    expect(settings.ambientVolume).toBe(0.65);

    expect(
      settingsFromRecord({ ambient_volume: '3' }).ambientVolume,
    ).toBe(1);
    expect(
      settingsFromRecord({ ambient_volume: '-1' }).ambientVolume,
    ).toBe(0);
    expect(
      settingsFromRecord({ ambient_volume: 'not-a-number' }).ambientVolume,
    ).toBe(DEFAULT_AMBIENT_VOLUME);
    expect(
      settingsFromRecord({ ambient_sound: 'unknown' }).ambientSound,
    ).toBe('off');
  });

  it('每条音轨都有独立文件、界面文案与署名', () => {
    const ids = new Set(AMBIENT_TRACKS.map((track) => track.id));
    expect(ids.size).toBe(6);

    for (const track of AMBIENT_TRACKS) {
      expect(ambientSource(track.id)).toBe(`/ambient/${track.file}`);
      expect(track.label.length).toBeGreaterThan(0);
      expect(track.en.length).toBeGreaterThan(0);
      expect(track.credit.length).toBeGreaterThan(0);
      expect(getAmbientTrack(track.id)?.label).toBe(track.label);
    }
    expect(getAmbientTrack('off')).toBeNull();
  });
});
