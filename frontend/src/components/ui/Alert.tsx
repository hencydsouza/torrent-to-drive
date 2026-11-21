import IconButton from './IconButton';

import type { ReactNode } from 'react';

export default function Alert({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <div className="alert" role="alert">
      <span>{children}</span>
      {onDismiss ? <IconButton icon="close" label="Dismiss" onClick={onDismiss} /> : null}
    </div>
  );
}
