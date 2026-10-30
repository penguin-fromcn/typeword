import { useEffect, useState } from 'react';
import {
  AMBIENT_TRACKS,
  ambientSoundService,
  getAmbientTrack,
  type AmbientSoundId,
  type AmbientTrackId,
} from '../services/ambientSoundService';
import { useSettingsStore } from '../stores/settingsStore';
import { useUiStore } from '../stores/uiStore';
import { Icon, type IconName } from './Icons';
import { Modal } from './Modal';

const TRACK_ICONS: Record<AmbientTrackId, IconName> = {
  rain: 'rain',
  'coffee-shop': 'coffee',
  fireplace: 'flame',
  birds: 'bird',
  'summer-night': 'moon',
  wind: 'wind',
};

export function AmbientSoundPicker() {
  const settings = useSettingsStore((state) => state.settings);
  const update = useSettingsStore((state) => state.update);
  const pushToast = useUiStore((state) => state.pushToast);
  const [volume, setVolume] = useState(settings.ambientVolume);

  useEffect(() => {
    setVolume(settings.ambientVolume);
  }, [settings.ambientVolume]);

  const apply = async (patch: Parameters<typeof update>[0]) => {
    try {
      await update(patch);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '环境音设置保存失败', 'error');
    }
  };

  const choose = (id: AmbientSoundId) => {
    ambientSoundService.sync(id, volume);
    void apply({ ambientSound: id });
  };

  const commitVolume = async () => {
    if (Math.abs(volume - settings.ambientVolume) < 0.001) return;
    await apply({ ambientVolume: volume });
  };

  const active = getAmbientTrack(settings.ambientSound);

  return (
    <div className="ambient-picker">
      <div className="ambient-options" role="group" aria-label="环境音选择">
        <button
          type="button"
          className={`ambient-option ${settings.ambientSound === 'off' ? 'is-active' : ''}`}
          aria-label="关闭环境音"
          aria-pressed={settings.ambientSound === 'off'}
          onClick={() => choose('off')}
        >
          <span className="ambient-option__icon">
            <Icon name="mute" size={17} />
          </span>
          <span className="ambient-option__label">关闭</span>
          <span className="ambient-option__en">QUIET</span>
        </button>
        {AMBIENT_TRACKS.map((track) => (
          <button
            key={track.id}
            type="button"
            className={`ambient-option ${settings.ambientSound === track.id ? 'is-active' : ''}`}
            aria-label={`环境音：${track.label}`}
            aria-pressed={settings.ambientSound === track.id}
            onClick={() => choose(track.id)}
          >
            <span className="ambient-option__icon">
              <Icon name={TRACK_ICONS[track.id]} size={17} />
            </span>
            <span className="ambient-option__label">{track.label}</span>
            <span className="ambient-option__en">{track.en}</span>
          </button>
        ))}
      </div>

      <div className="setting-row setting-row--stack ambient-volume">
        <div className="setting-row__head">
          <div>
            <span className="toggle__label">环境音音量</span>
            <span className="toggle__desc">
              与打字机音效、朗读音量相互独立；切换或关闭时自动淡出。
            </span>
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
            ambientSoundService.setVolume(next);
          }}
          onPointerUp={() => void commitVolume()}
          onKeyUp={() => void commitVolume()}
          onBlur={() => void commitVolume()}
          aria-label="环境音音量"
        />
      </div>

      <p className="ambient-state" role="status">
        {active ? `正在播放：${active.label} · ${active.en}` : '环境音已关闭'}
      </p>
      <p className="ambient-hint">
        首次选择后若没有声音，点按页面任意位置即可解锁播放；重启后会尝试恢复上次的环境音。
      </p>

      <details className="ambient-credits">
        <summary>声音来源与许可</summary>
        <ul>
          {AMBIENT_TRACKS.map((track) => (
            <li key={track.id}>
              <strong>{track.label}</strong>
              {track.credit}
            </li>
          ))}
        </ul>
        <p>
          循环音整理自 Blanket（程序 GPL-3.0，音频单独授权）。雨声为 CC BY 3.0，使用时保留署名与编辑说明；其余为 CC0 或
          Public Domain。完整来源链接与许可文本见安装目录《使用指南》。
        </p>
      </details>
    </div>
  );
}

export function AmbientSoundButton() {
  const ambientSound = useSettingsStore((state) => state.settings.ambientSound);
  const [open, setOpen] = useState(false);
  const active = getAmbientTrack(ambientSound);

  return (
    <>
      <button
        type="button"
        className={`sound-toggle ${active ? 'sound-toggle--on' : ''}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={active ? `环境音：${active.label}` : '选择环境音'}
      >
        <Icon name="music" size={16} />
        <span>{active ? `环境音 · ${active.label}` : '环境音'}</span>
      </button>
      <Modal
        open={open}
        title="环境音"
        subtitle="独立于打字机音效，切换页面不会中断。首次播放若无声音，点按页面任意位置即可解锁。"
        onClose={() => setOpen(false)}
      >
        <AmbientSoundPicker />
      </Modal>
    </>
  );
}
