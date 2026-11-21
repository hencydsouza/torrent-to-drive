import type { ReactNode } from 'react';
import Icon, { type IconName } from './Icon';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  hint?: string;
  children?: ReactNode;
}

export default function EmptyState({ icon, title, hint, children }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <Icon name={icon} size={28} />
      <p className="empty-title">{title}</p>
      {hint ? <p className="empty-hint">{hint}</p> : null}
      {children}
    </div>
  );
}
