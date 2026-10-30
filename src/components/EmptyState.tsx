import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icons';

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  description?: string;
  children?: ReactNode;
}

export function EmptyState({ icon = 'book', title, description, children }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state__seal">
        <Icon name={icon} size={28} />
      </div>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {children ? <div className="empty-state__actions">{children}</div> : null}
    </div>
  );
}
