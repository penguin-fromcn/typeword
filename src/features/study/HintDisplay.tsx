interface HintDisplayProps {
  displayChars: Array<string | null>;
  ariaLabel: string;
  disabled?: boolean;
}

export function HintDisplay({ displayChars, ariaLabel, disabled }: HintDisplayProps) {
  return (
    <div
      className={`hint-display ${disabled ? 'hint-display--disabled' : ''}`}
      aria-label={`字母提示：${ariaLabel}`}
      data-testid="hint-display"
    >
      {displayChars.length === 0 ? (
        <span className="hint-empty">提示已关闭</span>
      ) : (
        displayChars.map((char, index) => {
          const key = `${index}-${char ?? '_'}`;
          if (char === null) {
            return (
              <span key={key} className="hint-char hint-char--hidden">
                _
              </span>
            );
          }
          if (char === ' ') {
            return <span key={key} className="hint-gap" />;
          }
          const isLetter = /[A-Za-z0-9]/.test(char);
          return (
            <span
              key={key}
              className={`hint-char ${isLetter ? 'hint-char--shown' : 'hint-char--punct'}`}
            >
              {char}
            </span>
          );
        })
      )}
    </div>
  );
}
