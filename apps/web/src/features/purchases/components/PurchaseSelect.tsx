import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { useExitPresence } from '../../../shared/lib/use-exit-presence.js';

// Reuse Cenit's Calendar/Popover surface and button, following shadcn's select composition.
export function PurchaseSelect({ label, value, options, onValueChange, disabled = false, placeholder }: {
  label: string; value: string; options: { value: string; label: string; disabled?: boolean }[];
  onValueChange: (value: string) => void; disabled?: boolean; placeholder?: string;
}) {
  const [open, setOpen] = useState(false), content = useRef<HTMLDivElement>(null);
  const { mounted, closing } = useExitPresence(open);
  const selected = options.find(option => option.value === value);
  const typed = useRef({ text: '', at: 0 });
  function focusSelected() {
    typed.current = { text: '', at: 0 };
    (content.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]:not(:disabled)') ?? content.current?.querySelector<HTMLButtonElement>('[role="option"]:not(:disabled)'))?.focus();
  }
  useLayoutEffect(() => { if (open) focusSelected(); }, [open]);
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)')];
    const current = buttons.findIndex(button => button === document.activeElement);
    let next: HTMLButtonElement | undefined;
    if (event.key === 'ArrowDown') next = buttons[(current + 1) % buttons.length];
    else if (event.key === 'ArrowUp') next = buttons[(current - 1 + buttons.length) % buttons.length];
    else if (event.key === 'Home') next = buttons[0];
    else if (event.key === 'End') next = buttons.at(-1);
    else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      typed.current = { text: (Date.now() - typed.current.at < 700 ? typed.current.text : '') + event.key.toLocaleLowerCase('es'), at: Date.now() };
      next = buttons.find(button => button.textContent?.toLocaleLowerCase('es').startsWith(typed.current.text));
    }
    if (next) { event.preventDefault(); next.focus(); next.scrollIntoView({ block: 'nearest' }); }
  }
  return <Popover.Root open={mounted} onOpenChange={setOpen}>
    <Popover.Trigger asChild><button type="button" className="admin-button purchase-select-trigger" aria-label={`${label}: ${selected?.label ?? value}`} aria-haspopup="listbox" disabled={disabled}
      onKeyDown={event => { if (!open && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true); } }}
      onClick={event => { if (closing) { event.preventDefault(); setOpen(true); } }}>
      <span>{!value && placeholder ? placeholder : selected?.label ?? value}</span><CaretDownIcon size={14} aria-hidden="true" />
    </button></Popover.Trigger>
    <Popover.Portal><Popover.Content ref={content} role="listbox" aria-label={label} inert={closing} className={`cenit-popover purchase-select-menu${closing ? ' cenit-closing' : ''}`}
      align="start" sideOffset={6} collisionPadding={16} onOpenAutoFocus={event => { event.preventDefault(); focusSelected(); }} onKeyDown={navigate}>
      {options.map(option => <button key={option.value} type="button" role="option" aria-selected={option.value === value} disabled={option.disabled}
        tabIndex={option.value === value ? 0 : -1} onClick={() => { onValueChange(option.value); setOpen(false); }}>
        <span>{option.label}</span>{option.value === value && <CheckIcon size={15} aria-hidden="true" />}
      </button>)}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
