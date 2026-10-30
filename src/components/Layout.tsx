import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSettingsStore } from '../stores/settingsStore';
import { useUiStore } from '../stores/uiStore';
import { audioService } from '../services/audioService';
import { speechService } from '../services/speechService';
import { AmbientSoundButton } from './AmbientSoundControl';
import { Icon, type IconName } from './Icons';
import { ToastContainer } from './Toast';

const NAV_ITEMS: Array<{ to: string; label: string; en: string; icon: IconName; end?: boolean }> = [
  { to: '/', label: '今日', en: 'DESK', icon: 'home', end: true },
  { to: '/study', label: '练习', en: 'TYPE', icon: 'target' },
  { to: '/learn', label: '学习', en: 'READ', icon: 'cards' },
  { to: '/words', label: '词库', en: 'WORDS', icon: 'book' },
  { to: '/stats', label: '统计', en: 'LEDGER', icon: 'chart' },
  { to: '/settings', label: '设置', en: 'TUNE', icon: 'gear' },
];

function SoundToggle() {
  const enabled = useSettingsStore((state) => state.settings.soundEnabled);
  const update = useSettingsStore((state) => state.update);
  const pushToast = useUiStore((state) => state.pushToast);

  return (
    <button
      className={`sound-toggle ${enabled ? 'sound-toggle--on' : ''}`}
      onClick={async () => {
        try {
          await update({ soundEnabled: !enabled });
          audioService.setEnabled(!enabled);
        } catch {
          pushToast('音效设置保存失败', 'error');
        }
      }}
      aria-pressed={enabled}
      title={enabled ? '关闭音效' : '开启音效'}
    >
      <Icon name={enabled ? 'sound' : 'mute'} size={16} />
      <span>{enabled ? '音效开启' : '音效关闭'}</span>
    </button>
  );
}

export function Layout() {
  const bootWarning = useUiStore((state) => state.bootWarning);
  const setBootWarning = useUiStore((state) => state.setBootWarning);
  const location = useLocation();

  useEffect(() => {
    speechService.stop();
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand" end>
          <span className="brand__mark">T</span>
          <span className="brand__copy">
            <strong>TYPEWORD</strong>
            <small>字里行间</small>
          </span>
        </NavLink>

        <nav className="side-nav" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `side-nav__item ${isActive ? 'is-active' : ''}`}
            >
              <Icon name={item.icon} size={17} />
              <span className="side-nav__label">{item.label}</span>
              <span className="side-nav__en">{item.en}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__foot">
          <SoundToggle />
          <AmbientSoundButton />
          <div className="offline-stamp">
            <span className="offline-stamp__dot" />
            OFFLINE · LOCAL DB
          </div>
          <p className="sidebar__note">无需登录 · 无需联网 · 数据留在本机</p>
        </div>
      </aside>

      <div className="main-column">
        {bootWarning ? (
          <div className="boot-banner" role="alert">
            <span className="boot-banner__tag">SEED</span>
            <p>{bootWarning}</p>
            <button
              className="boot-banner__close"
              onClick={() => setBootWarning(null)}
              aria-label="关闭提示"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ) : null}

        <main className="page">
          <Outlet />
        </main>
      </div>

      <ToastContainer />
    </div>
  );
}
