import { DayPicker, type DayPickerProps } from 'react-day-picker';
import { es } from 'react-day-picker/locale/es';
import { CaretLeftIcon } from '@phosphor-icons/react/dist/csr/CaretLeft';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { calendarDate } from '../lib/dates.js';
import 'react-day-picker/style.css';

// The shadcn Calendar/Popover composition, using Cenit's existing listbox and tokens.
export function Calendar(props: DayPickerProps) {
  const currentYear = new Date().getFullYear(), shownYear = (props.month ?? props.defaultMonth ?? new Date()).getFullYear();
  // Keep the displayed year inside the navigation window, including typed dates.
  const startMonth = calendarDate(`${String(Math.max(1, Math.min(currentYear - 100, shownYear))).padStart(4, '0')}-01-01`);
  const endMonth = calendarDate(`${String(Math.min(9999, Math.max(currentYear, shownYear) + 1)).padStart(4, '0')}-12-31`);
  return <DayPicker startMonth={startMonth} endMonth={endMonth} locale={es} weekStartsOn={1} captionLayout="label" navLayout="after" reverseYears {...props}
    components={{ Chevron: ({ orientation }) => orientation === 'left'
      ? <CaretLeftIcon size={16} aria-hidden="true" /> : <CaretRightIcon size={16} aria-hidden="true" />, ...props.components }} />;
}
