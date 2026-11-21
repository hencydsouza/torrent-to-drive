import type { ButtonHTMLAttributes } from 'react';
import Icon, { Spinner, type IconName } from './Icon';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  busy?: boolean;
  danger?: boolean;
}

// Square icon-only action. `label` is required: it is the accessible name and the tooltip.
export default function IconButton({ icon, label, busy = false, danger = false, className = '', ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`btn-icon${danger ? ' is-danger' : ''} ${className}`}
      title={label}
      aria-label={label}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy ? <Spinner /> : <Icon name={icon} />}
    </button>
  );
}
