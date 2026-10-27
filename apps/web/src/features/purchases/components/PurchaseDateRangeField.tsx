import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { type DateRange } from 'react-day-picker';
import { CalendarBlankIcon } from '@phosphor-icons/react/dist/csr/CalendarBlank';
import { Calendar } from '../../../shared/components/Calendar.js';
import { DateInput } from '../../../shared/components/DateInput.js';
import { calendarDate, calendarValue } from '../../../shared/lib/dates.js';
import { useExitPresence } from '../../../shared/lib/use-exit-presence.js';

function selectedRange(from: string, to: string): DateRange | undefined {
  const start = calendarDate(from), end = calendarDate(to);
  if (start && end && start <= end) return { from: start, to: end };
  if (start) return { from: start };
  return undefined;
}

export function PurchaseDateRangeField({ id, from, to, onValueChange, onBlur, invalid = false, describedBy, minYear, maxYear, disabled, onValidationError }: {
  minYear?: number; maxYear?: number; disabled?: boolean; onValidationError: (message: string) => void;
  id: string;
  from: string;
  to: string;
  onValueChange: (from: string, to: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => { const media = window.matchMedia('(max-width: 760px)'); const change = () => setCompact(media.matches); media.addEventListener('change', change); return () => media.removeEventListener('change', change); }, []);
  const appliedRange = selectedRange(from, to);
  const [month, setMonth] = useState<Date>(() => appliedRange?.from ?? new Date());
  const anchor = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null), content = useRef<HTMLDivElement>(null);
  const { mounted, closing } = useExitPresence(open);

  useLayoutEffect(() => {
    if (open) content.current?.querySelector<HTMLButtonElement>('.rdp-day_button[tabindex="0"]')?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) setMonth(appliedRange?.from ?? new Date());
  }, [from, to, open]);

  function openCalendar() {
    const currentRange = selectedRange(from, to);
    setMonth(currentRange?.from ?? new Date());
    setOpen(true);
  }

  const inputProps = { minYear, maxYear, disabled, onValidationError, 'aria-invalid': invalid || undefined, 'aria-describedby': describedBy, onBlur, onOpenCalendar: openCalendar };
  const shownMonth = new Date(month);
  shownMonth.setDate(1);
  shownMonth.setFullYear(Math.min(Math.max(month.getFullYear(), minYear ?? 1), maxYear ?? 9999));
  return <Popover.Root open={mounted} onOpenChange={next => {
    if (next) openCalendar();
    else setOpen(false);
  }}>
    <Popover.Anchor asChild><div ref={anchor} className="purchase-range-control" role="group" aria-label="Rango de fechas">
      <DateInput {...inputProps} id={id} segmentLabel="Rango de fechas: desde" aria-label="Rango de fechas: desde" value={from} onValueChange={value => onValueChange(value, to)} />
      <span aria-hidden="true">–</span>
      <DateInput {...inputProps} id={`${id}-to`} segmentLabel="Rango de fechas: hasta" aria-label="Rango de fechas: hasta" value={to} onValueChange={value => onValueChange(from, value)} />
      <Popover.Trigger asChild><button ref={trigger} disabled={disabled} type="button" className="cenit-date-trigger" aria-label="Abrir calendario: rango de fechas"
        onClick={event => { if (closing) { event.preventDefault(); openCalendar(); } }}>
        <CalendarBlankIcon size={17} aria-hidden="true" />
      </button></Popover.Trigger>
    </div></Popover.Anchor>
    <Popover.Portal><Popover.Content ref={content} inert={closing} className={`cenit-popover cenit-calendar purchase-date-popover${closing ? ' cenit-closing' : ''}`}
      align="start" sideOffset={8} collisionPadding={16} aria-label="Calendario de rango de fechas"
      onInteractOutside={event => { if (anchor.current?.contains(event.target as Node) && !(event.target as Element).closest('button')) event.preventDefault(); }}
      onOpenAutoFocus={event => event.preventDefault()}
      onCloseAutoFocus={event => {
        event.preventDefault();
        if (document.activeElement === document.body || content.current?.contains(document.activeElement)) trigger.current?.focus({ preventScroll: true });
      }}>
      <Calendar startMonth={minYear ? calendarDate(`${String(minYear).padStart(4, '0')}-01-01`) : undefined} endMonth={maxYear ? calendarDate(`${String(maxYear).padStart(4, '0')}-12-31`) : undefined}
        disabled={minYear && maxYear ? [{ before: calendarDate(`${String(minYear).padStart(4, '0')}-01-01`)! }, { after: calendarDate(`${String(maxYear).padStart(4, '0')}-12-31`)! }] : undefined}
        mode="range" selected={appliedRange} month={shownMonth} onMonthChange={setMonth} autoFocus numberOfMonths={compact ? 1 : 2} resetOnSelect
        onSelect={range => {
          onValidationError('');
          onValueChange(range?.from ? calendarValue(range.from) : '', range?.to ? calendarValue(range.to) : '');
        }} />
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
