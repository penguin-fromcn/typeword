interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

export function Toggle({ checked, onChange, label, description, disabled, ariaLabel }: ToggleProps) {
  return (
    <label className={`toggle ${disabled ? 'toggle--disabled' : ''}`}>
      <span className="toggle__copy">
        <span className="toggle__label">{label}</span>
        {description ? <span className="toggle__desc">{description}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={ariaLabel}
      />
      <span className="toggle__track" aria-hidden="true">
        <span className="toggle__thumb" />
      </span>
    </label>
  );
}
