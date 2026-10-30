import { Icon } from '../../components/Icons';
import { selectionState } from '../../domain/cardDeck';

interface StudyScopeChipProps {
  label: string;
  selected: number;
  total: number;
  onToggle: () => void;
  disabled?: boolean;
}

export function StudyScopeChip({
  label,
  selected,
  total,
  onToggle,
  disabled,
}: StudyScopeChipProps) {
  const state = selectionState(selected, total);
  return (
    <button
      type="button"
      className={`scope-chip is-${state}`}
      aria-pressed={state === 'all'}
      aria-label={`${label} 学习范围，已选 ${selected} / ${total}`}
      onClick={onToggle}
      disabled={disabled || total === 0}
    >
      <span className="scope-chip__mark" aria-hidden="true">
        {state === 'all' ? <Icon name="check" size={10} /> : null}
      </span>
      <span className="scope-chip__label">{label}</span>
      <span className="scope-chip__count">
        {selected}/{total}
      </span>
    </button>
  );
}
