import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { useLocation } from 'react-router';
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { useExitPresence } from '../lib/use-exit-presence.js';

export function ContextualConfirm({ open, origin, title, description, confirmLabel, cancelLabel = 'Seguir editando', busy = false,
  busyLabel = 'Confirmando…', caution = false, destructive = false, onConfirm, onCancel, fallbackFocus, children }: {
  open: boolean; origin: HTMLElement | null; title: string; description: string; confirmLabel?: string; cancelLabel?: string;
  busy?: boolean; busyLabel?: string; caution?: boolean; destructive?: boolean; onConfirm?: () => void; onCancel: () => void;
  fallbackFocus?: RefObject<HTMLElement | null>; children?: ReactNode;
}) {
  const { mounted, closing } = useExitPresence(open);
  const location = useLocation(), path = location.pathname + location.search;
  const titleId = useId(), descriptionId = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const anchor = useRef(origin);
  const route = useRef('');
  const text = useRef({ title, description, confirmLabel, cancelLabel, caution, destructive });
  if (open) { anchor.current = origin; route.current = path; text.current = { title, description, confirmLabel, cancelLabel, caution, destructive }; }
  useEffect(() => { if (open) cancel.current?.focus({ preventScroll: true }); }, [open]);
  useEffect(() => {
    if (!mounted) return;
    const workspace = document.querySelector<HTMLElement>('.admin-workspace');
    if (!workspace) return;
    const previous = workspace.inert;
    workspace.inert = true;
    return () => { workspace.inert = previous; };
  }, [mounted]);
  return <Popover.Root modal open={mounted} onOpenChange={next => { if (!next && open && !busy) onCancel(); }}>
    <Popover.Anchor virtualRef={anchor} />
    <Popover.Portal>
      <div aria-hidden="true" className={`cenit-confirm-overlay${closing ? ' cenit-closing' : ''}`} onClick={event => {
        event.preventDefault(); event.stopPropagation(); if (open && !busy) onCancel();
      }} />
    </Popover.Portal>
    <Popover.Portal>
      <Popover.Content role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}
        side="top" sideOffset={10} collisionPadding={16} sticky="always" className={`cenit-confirm${closing ? ' cenit-closing' : ''}`}
        onOpenAutoFocus={event => { event.preventDefault(); cancel.current?.focus({ preventScroll: true }); }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          const usableOrigin = anchor.current?.isConnected && !anchor.current.matches(':disabled');
          const target = path !== route.current ? document.querySelector<HTMLElement>('#admin-content')
            : usableOrigin ? anchor.current : fallbackFocus?.current;
          if (target?.isConnected) {
            if (!usableOrigin) target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            target.focus({ preventScroll: true });
          }
        }}
        onEscapeKeyDown={event => { if (busy || closing) event.preventDefault(); }}
        onInteractOutside={event => { if (busy || closing) event.preventDefault(); }}
        onClickCapture={event => { if (closing) { event.preventDefault(); event.stopPropagation(); } }}>
        <div className={`cenit-confirm-heading${text.current.destructive ? ' cenit-confirm-heading--destructive' : ''}`}>{text.current.caution && <WarningCircleIcon size={18} aria-hidden="true" />}<h2 id={titleId}>{text.current.title}</h2></div>
        <p id={descriptionId}>{text.current.description}</p>
        {children}
        <div className="cenit-confirm-actions">
          <button type="button" ref={cancel} className="cenit-ui-button" disabled={busy || closing} onClick={onCancel}>{text.current.cancelLabel}</button>
          {text.current.confirmLabel && <button type="button" className={`cenit-ui-button ${text.current.destructive ? 'cenit-ui-button--destructive' : 'cenit-ui-button--primary'}`} disabled={busy || closing} onClick={onConfirm}>{busy ? busyLabel : text.current.confirmLabel}</button>}
        </div>
        <Popover.Arrow className="cenit-confirm-arrow" width={12} height={6} />
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
