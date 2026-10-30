import { Icon } from './Icons';
import { useSpeechAvailability } from '../hooks/useSpeechAvailability';
import { speechService } from '../services/speechService';
import { useSettingsStore } from '../stores/settingsStore';

interface SpeakButtonProps {
  text: string;
  variant?: 'chip' | 'row';
  showLabel?: boolean;
  label?: string;
  ariaLabel?: string;
}

export function SpeakButton({
  text,
  variant = 'chip',
  showLabel = false,
  label,
  ariaLabel,
}: SpeakButtonProps) {
  const enabled = useSettingsStore((state) => state.settings.pronunciationEnabled);
  const available = useSpeechAvailability();
  if (!enabled || !available || !text.trim()) return null;

  const accessible = ariaLabel ?? `朗读 ${text}`;

  return (
    <button
      type="button"
      className={`speak-btn speak-btn--${variant}${showLabel ? '' : ' speak-btn--icon'}`}
      onClick={() => {
        void speechService.speak(text);
      }}
      aria-label={accessible}
      title={accessible}
    >
      <Icon name="sound" size={14} />
      {showLabel ? <span>{label ?? '朗读'}</span> : null}
    </button>
  );
}
