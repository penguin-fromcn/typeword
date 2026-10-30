import type { RefObject } from 'react';
import { audioService } from '../../services/audioService';

interface AnswerInputProps {
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  inputRef: RefObject<HTMLInputElement>;
  disabled: boolean;
  status: 'idle' | 'correct' | 'wrong';
  hintUsed: boolean;
}

export function AnswerInput({
  value,
  onChange,
  onEnter,
  inputRef,
  disabled,
  status,
  hintUsed,
}: AnswerInputProps) {
  return (
    <div className={`answer-field answer-field--${status}`}>
      <div className="answer-field__head">
        <label htmlFor="answer-input">键入英文单词</label>
        <span className="answer-field__meta">
          {hintUsed ? <span className="hint-used">已用提示</span> : null}
          <span>不区分大小写</span>
        </span>
      </div>
      <div className="answer-field__line">
        <span className="answer-field__prefix" aria-hidden="true">
          &gt;
        </span>
        <input
          ref={inputRef}
          id="answer-input"
          name="answer"
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Enter') {
              event.preventDefault();
              audioService.playSubmit();
              onEnter();
              return;
            }
            if (event.key === 'Backspace') {
              audioService.playBackspace();
              return;
            }
            if (event.key.length === 1 || event.key === ' ') {
              audioService.playKey();
            }
          }}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="type your answer…"
          aria-label="英文答案输入框"
        />
        <span className={`caret ${disabled ? 'caret--hidden' : ''}`} aria-hidden="true" />
      </div>
      <p className="answer-field__tip">
        按 <kbd>Enter</kbd> 提交；短语中的空格与连字符需要保留。
      </p>
    </div>
  );
}
