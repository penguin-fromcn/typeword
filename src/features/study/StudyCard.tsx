import type { ReactNode } from 'react';

interface StudyCardProps {
  children: ReactNode;
  status?: 'neutral' | 'correct' | 'wrong';
}

export function StudyCard({ children, status = 'neutral' }: StudyCardProps) {
  return (
    <section className={`study-card study-card--${status}`}>
      <span className="study-card__tape" aria-hidden="true" />
      {children}
    </section>
  );
}
