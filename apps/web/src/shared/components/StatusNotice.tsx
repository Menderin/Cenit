import type { ReactNode } from 'react';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle';
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { InfoIcon } from '@phosphor-icons/react/dist/csr/Info';

export function StatusNotice({ kind = 'info', title, message, children }: {
  kind?: 'success' | 'warning' | 'error' | 'info'; title: string; message: string; children?: ReactNode;
}) {
  const Icon = kind === 'success' ? CheckCircleIcon : kind === 'warning' || kind === 'error' ? WarningCircleIcon : InfoIcon;
  return <div className={`cenit-notice cenit-notice--${kind}`}>
    <Icon size={20} aria-hidden="true" /><div><strong>{title}</strong><p role={kind === 'error' ? 'alert' : 'status'}>{message}</p>{children}</div>
  </div>;
}
