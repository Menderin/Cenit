import { useLayoutEffect, useRef, useState, type ComponentProps } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { DayPicker } from 'react-day-picker';
import { es } from 'react-day-picker/locale/es';
import { CalendarBlankIcon } from '@phosphor-icons/react/dist/csr/CalendarBlank';
import { CaretLeftIcon } from '@phosphor-icons/react/dist/csr/CaretLeft';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { calendarDate, calendarValue, dateValue, displayDate } from '../lib/dates.js';
import 'react-day-picker/style.css';
import { useExitPresence } from '../lib/use-exit-presence.js';

// Selected shadcn Calendar/Popover composition, adapted to Cenit's density and Phosphor icons.
export function DateField({ value, onValueChange, label, ...props }: Omit<ComponentProps<'input'>, 'type' | 'value' | 'onChange'> & {
  value: string; onValueChange: (value: string) => void; label: string;
}) {
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const { mounted, closing } = useExitPresence(open);
  useLayoutEffect(() => { if (open) content.current?.querySelector<HTMLButtonElement>('.rdp-day_button[tabindex="0"]')?.focus(); }, [open]);
  const selected = calendarDate(value);
  return <Popover.Root open={mounted} onOpenChange={next => { setOpen(next); if (!next) input.current?.focus({ preventScroll: true }); }}>
    <Popover.Anchor asChild><div className="cenit-date-field">
      <input {...props} ref={input} type="text" inputMode="numeric" maxLength={10} placeholder="dd/mm/aaaa" autoComplete="off"
        value={displayDate(value)} onChange={event => onValueChange(dateValue(event.target.value))} />
      <Popover.Trigger asChild><button type="button" className="cenit-date-trigger" aria-label={`Abrir calendario: ${label}`} disabled={props.disabled}
        onClick={event => { if (closing) { event.preventDefault(); setOpen(true); } }}>
        <CalendarBlankIcon size={17} aria-hidden="true" />
      </button></Popover.Trigger>
    </div></Popover.Anchor>
    <Popover.Portal><Popover.Content ref={content} inert={closing} className={`cenit-popover cenit-calendar${closing ? ' cenit-closing' : ''}`} align="start" sideOffset={8} collisionPadding={16}
      aria-label={`Calendario: ${label}`} onOpenAutoFocus={event => event.preventDefault()}
      onCloseAutoFocus={event => { event.preventDefault(); input.current?.focus({ preventScroll: true }); }}>
      <DayPicker mode="single" selected={selected} defaultMonth={selected} locale={es} weekStartsOn={1} autoFocus navLayout="around"
        onSelect={date => { if (date) { onValueChange(calendarValue(date)); setOpen(false); input.current?.focus({ preventScroll: true }); } }}
        components={{ Chevron: ({ orientation }) => orientation === 'left' ? <CaretLeftIcon size={16} aria-hidden="true" /> : <CaretRightIcon size={16} aria-hidden="true" /> }} />
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
