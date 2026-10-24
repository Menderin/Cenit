import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Calendar } from './Calendar.js';
import { DateInput } from './DateInput.js';
import { CalendarBlankIcon } from '@phosphor-icons/react/dist/csr/CalendarBlank';
import { calendarDate, calendarValue } from '../lib/dates.js';
import { useExitPresence } from '../lib/use-exit-presence.js';

// Selected shadcn Calendar/Popover composition, adapted to Cenit's density and Phosphor icons.
export function DateField({ value, onValueChange, label, closeOnSelect = true, minYear, maxYear, onValidationError, ...props }: Omit<ComponentProps<'input'>, 'type' | 'value' | 'onChange'> & {
  value: string; onValueChange: (value: string) => void; label: string; closeOnSelect?: boolean; minYear?: number; maxYear?: number; onValidationError?: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const { mounted, closing } = useExitPresence(open);
  useLayoutEffect(() => { if (open) content.current?.querySelector<HTMLButtonElement>('.rdp-day_button[tabindex="0"]')?.focus(); }, [open]);
  const selected = calendarDate(value);
  const [month, setMonth] = useState<Date>(() => selected ?? new Date());
  useEffect(() => { if (selected) setMonth(selected); }, [selected?.getTime()]);

  const shownMonth = new Date(month);
  shownMonth.setDate(1);
  shownMonth.setFullYear(Math.min(Math.max(month.getFullYear(), minYear ?? 1), maxYear ?? 9999));
  return <Popover.Root open={mounted} onOpenChange={setOpen}>
    <Popover.Anchor asChild><div ref={input} className="cenit-date-field">
      <DateInput {...props} minYear={minYear} maxYear={maxYear} segmentLabel={label} onValidationError={onValidationError} value={value} onValueChange={onValueChange} onOpenCalendar={() => { setMonth(selected ?? new Date()); setOpen(true); }} />
      <Popover.Trigger asChild><button type="button" className="cenit-date-trigger" aria-label={`Abrir calendario: ${label}`} disabled={props.disabled}
        onClick={event => { if (closing) { event.preventDefault(); setOpen(true); } }}>
        <CalendarBlankIcon size={17} aria-hidden="true" />
      </button></Popover.Trigger>
    </div></Popover.Anchor>
    <Popover.Portal><Popover.Content ref={content} inert={closing} className={`cenit-popover cenit-calendar${closing ? ' cenit-closing' : ''}`} align="start" sideOffset={8} collisionPadding={16}
      aria-label={`Calendario: ${label}`} onInteractOutside={event => { if (input.current?.contains(event.target as Node) && !(event.target as Element).closest('button')) event.preventDefault(); }}
      onOpenAutoFocus={event => event.preventDefault()}
      onCloseAutoFocus={event => {
        event.preventDefault();
        if (document.activeElement === document.body || content.current?.contains(document.activeElement) || input.current?.contains(document.activeElement)) input.current?.querySelector('input')?.focus({ preventScroll: true });
      }}>
      <Calendar startMonth={minYear ? calendarDate(`${String(minYear).padStart(4, '0')}-01-01`) : undefined} endMonth={maxYear ? calendarDate(`${String(maxYear).padStart(4, '0')}-12-31`) : undefined}
        disabled={minYear && maxYear ? [{ before: calendarDate(`${String(minYear).padStart(4, '0')}-01-01`)! }, { after: calendarDate(`${String(maxYear).padStart(4, '0')}-12-31`)! }] : undefined} mode="single" selected={selected} month={shownMonth} onMonthChange={setMonth} autoFocus
        onSelect={date => { if (date) { setMonth(date); onValueChange(calendarValue(date)); onValidationError?.(''); if (closeOnSelect) { setOpen(false); input.current?.querySelector('input')?.focus({ preventScroll: true }); } } }} />
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
