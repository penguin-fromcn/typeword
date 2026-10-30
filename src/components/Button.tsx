import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'sm' | 'lg';
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn btn--${variant} btn--${size} ${className}`.trim()}
      {...rest}
    >
      {icon ? <span className="btn__icon">{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}
