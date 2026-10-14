import { useRef, type ReactNode } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { useExitPresence } from '../lib/use-exit-presence.js';

export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = 'Seguir editando', onConfirm, onCancel, busy = false, children }: {
  open: boolean; title: string; description: string; confirmLabel?: string; cancelLabel?: string;
  onConfirm?: () => void; onCancel: () => void; busy?: boolean; children?: ReactNode;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  const { mounted, closing } = useExitPresence(open);
  const text = useRef({ title, description, confirmLabel, cancelLabel });
  if (open) text.current = { title, description, confirmLabel, cancelLabel };
  return <AlertDialog.Root open={mounted} onOpenChange={next => { if (!next && !busy) onCancel(); }}>
    <AlertDialog.Portal>
      <AlertDialog.Overlay className={`cenit-dialog-overlay${closing ? ' cenit-closing' : ''}`} />
      <AlertDialog.Content className={`cenit-dialog${closing ? ' cenit-closing' : ''}`} onOpenAutoFocus={() => { returnFocus.current = document.activeElement as HTMLElement | null; }}
        onCloseAutoFocus={event => { event.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true }); }}
        onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
        <div className="cenit-dialog-heading"><WarningCircleIcon size={22} aria-hidden="true" /><AlertDialog.Title>{text.current.title}</AlertDialog.Title></div>
        <AlertDialog.Description>{text.current.description}</AlertDialog.Description>
        {children}
        <div className="cenit-dialog-actions">
          <AlertDialog.Cancel className="cenit-ui-button" disabled={busy || closing}>{text.current.cancelLabel}</AlertDialog.Cancel>
          {text.current.confirmLabel && <button type="button" className="cenit-ui-button cenit-ui-button--primary" disabled={busy || closing} onClick={onConfirm}>{busy ? 'Confirmando…' : text.current.confirmLabel}</button>}
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>;
}
