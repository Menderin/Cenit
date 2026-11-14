import { useEffect, useRef, type ChangeEvent, type ClipboardEvent, type ComponentProps, type FocusEvent, type KeyboardEvent } from 'react';
import { dateValue, displayDate } from '../lib/dates.js';

type DateInputProps = Omit<ComponentProps<'input'>, 'type' | 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  onOpenCalendar?: () => void;
  onValidationError?: (message: string) => void;
  minYear?: number;
  maxYear?: number;
  segmentLabel?: string;
};

function formatDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length < 2) return digits;
  if (digits.length === 2) return `${digits}/`;
  if (digits.length < 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function caretAfterDigits(value: string, count: number) {
  if (!count) return 0;
  let seen = 0;
  for (let index = 0; index < value.length; index++) {
    if (/\d/.test(value[index]!)) seen++;
    if (seen === count) return value[index + 1] === '/' ? index + 2 : index + 1;
  }
  return value.length;
}

function parseSegments(value: string) {
  const shown = displayDate(value);
  const pieces = shown.includes('/') ? shown.split('/') : [];
  return [2, 2, 4].map((length, index) => (pieces[index] ?? '').replace(/\D/g, '').slice(0, length));
}

function daysInMonth(year: number, month: number) {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function serializeSegments(parts: string[]) {
  if (!parts.some(Boolean)) return '';
  const partial = parts.join('/');
  return parts[0]?.length === 2 && parts[1]?.length === 2 && parts[2]?.length === 4 ? dateValue(partial) : partial;
}

function SegmentedDateInput({ value, onValueChange, onOpenCalendar, onValidationError, minYear, maxYear, segmentLabel, ...props }: DateInputProps) {
  const root = useRef<HTMLDivElement>(null);
  const fields = useRef<Array<HTMLInputElement | null>>([]);
  const invalidSegment = useRef<number | null>(null);
  const parts = parseSegments(value);
  const baseLabel = segmentLabel ?? props['aria-label'] ?? 'Fecha';
  useEffect(() => { if (/^\d{4}-\d{2}-\d{2}$/.test(value)) invalidSegment.current = null; }, [value]);

  function commit(nextParts: string[], edited: number, previousLength: number) {
    const normalized = nextParts.map((part, index) => part.replace(/\D/g, '').slice(0, index === 2 ? 4 : 2));
    let invalidIndex = -1;
    let message = '';
    const day = Number(normalized[0]);
    const month = Number(normalized[1]);
    const year = Number(normalized[2]);

    if (normalized[1]?.length === 2 && (month < 1 || month > 12)) {
      invalidIndex = 1;
      message = 'El mes debe estar entre 01 y 12.';
    } else if (normalized[2]?.length === 4 && (year < (minYear ?? 1) || year > (maxYear ?? 9999))) {
      invalidIndex = 2;
      message = `El año debe estar entre ${minYear ?? 1} y ${maxYear ?? 9999}.`;
    } else if (normalized[0]?.length === 2 && (day < 1 || day > 31)) {
      invalidIndex = 0;
      message = 'El día debe estar entre 01 y 31.';
    } else if (normalized[0]?.length === 2 && normalized[1]?.length === 2 && month >= 1 && month <= 12) {
      const maximum = daysInMonth(normalized[2]?.length === 4 ? year : 2000, month);
      if (day > maximum) {
        invalidIndex = 0;
        message = `El día debe estar entre 01 y ${maximum}.`;
      }
    }

    if (invalidIndex >= 0) {
      normalized[invalidIndex] = '';
      invalidSegment.current = invalidIndex;
      onValidationError?.(message);
    } else if (invalidSegment.current === null || invalidSegment.current === edited || normalized.every((part, index) => part.length === (index === 2 ? 4 : 2))) {
      invalidSegment.current = null;
      onValidationError?.('');
    }
    onValueChange(serializeSegments(normalized));

    if (invalidIndex >= 0) {
      fields.current[invalidIndex]?.focus();
    } else if (edited < 2 && normalized[edited]?.length === 2 && normalized[edited]!.length > previousLength) {
      fields.current[edited + 1]?.focus();
    }
  }

  function splitPastedDate(text: string, edited: number) {
    const normalized = text.trim();
    const dateText = /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? displayDate(normalized) : normalized;
    if (dateText.includes('/') || dateText.includes('-')) {
      const chunks = dateText.split(/[/-]/);
      if (chunks.length === 3) return chunks.map((chunk, index) => chunk.replace(/\D/g, '').slice(0, index === 2 ? 4 : 2));
    }
    const digits = normalized.replace(/\D/g, '');
    if (digits.length > (edited === 2 ? 4 : 2)) return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)];
    return undefined;
  }

  function changeSegment(event: ChangeEvent<HTMLInputElement>, index: number) {
    const raw = event.currentTarget.value;
    const pasted = splitPastedDate(raw, index);
    const next = pasted ?? [...parts];
    const oldLength = parts[index]?.length ?? 0;
    if (!pasted) next[index] = raw.replace(/\D/g, '').slice(0, index === 2 ? 4 : 2);
    commit(next, pasted ? 2 : index, pasted ? 0 : oldLength);
  }

  function pasteSegment(event: ClipboardEvent<HTMLInputElement>, index: number) {
    const pasted = splitPastedDate(event.clipboardData.getData('text'), index);
    if (!pasted) return;
    event.preventDefault();
    commit(pasted, 2, 0);
  }

  function onSegmentKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    props.onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      onValidationError?.('');
      onValueChange('');
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      onOpenCalendar?.();
      return;
    }
    const input = event.currentTarget;
    const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
    const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
    if (event.key === 'ArrowLeft' && atStart && index > 0) {
      event.preventDefault();
      fields.current[index - 1]?.focus();
      fields.current[index - 1]?.setSelectionRange(fields.current[index - 1]?.value.length ?? 0, fields.current[index - 1]?.value.length ?? 0);
    } else if (event.key === 'ArrowRight' && atEnd && index < 2) {
      event.preventDefault();
      fields.current[index + 1]?.focus();
      fields.current[index + 1]?.setSelectionRange(0, 0);
    } else if (event.key === 'Backspace' && atStart && !input.value && index > 0) {
      event.preventDefault();
      const next = [...parts];
      next[index - 1] = (next[index - 1] ?? '').slice(0, -1);
      commit(next, index - 1, parts[index - 1]?.length ?? 0);
      requestAnimationFrame(() => {
        const previous = fields.current[index - 1];
        previous?.focus();
        previous?.setSelectionRange(previous.value.length, previous.value.length);
      });
    }
  }

  function onSegmentBlur(event: FocusEvent<HTMLInputElement>) {
    if (!root.current?.contains(event.relatedTarget as Node | null)) props.onBlur?.(event);
  }

  const { id, 'aria-label': ariaLabel, 'aria-describedby': describedBy, 'aria-invalid': invalid, ...inputProps } = props;
  const segmentProps = {
    ...inputProps,
    type: 'text' as const,
    inputMode: 'numeric' as const,
    autoComplete: 'off',
    'aria-describedby': describedBy,
    'aria-invalid': invalid,
    onBlur: onSegmentBlur,
    className: `cenit-date-segment ${inputProps.className ?? ''}`.trim(),
  };

  return <div ref={root} className="cenit-date-input cenit-date-input--segmented" onClick={event => {
    if (event.target instanceof HTMLInputElement) return;
    fields.current[0]?.focus({ preventScroll: true });
  }}>
    <input {...segmentProps} ref={element => { fields.current[0] = element; }} id={id} aria-label={ariaLabel} className={`${segmentProps.className} cenit-date-segment--day`}
      maxLength={2} placeholder="dd" value={parts[0] ?? ''} onChange={event => changeSegment(event, 0)} onPaste={event => pasteSegment(event, 0)} onKeyDown={event => onSegmentKeyDown(event, 0)} />
    <span className="cenit-date-separator" aria-hidden="true">/</span>
    <input {...segmentProps} ref={element => { fields.current[1] = element; }} id={id ? `${id}-month` : undefined} aria-label={`${baseLabel}, mes`} className={`${segmentProps.className} cenit-date-segment--month`}
      maxLength={2} placeholder="mm" value={parts[1] ?? ''} onChange={event => changeSegment(event, 1)} onPaste={event => pasteSegment(event, 1)} onKeyDown={event => onSegmentKeyDown(event, 1)} />
    <span className="cenit-date-separator" aria-hidden="true">/</span>
    <input {...segmentProps} ref={element => { fields.current[2] = element; }} id={id ? `${id}-year` : undefined} aria-label={`${baseLabel}, año`} className={`${segmentProps.className} cenit-date-segment--year`}
      maxLength={4} placeholder="aaaa" value={parts[2] ?? ''} onChange={event => changeSegment(event, 2)} onPaste={event => pasteSegment(event, 2)} onKeyDown={event => onSegmentKeyDown(event, 2)} />
  </div>;
}

function PlainDateInput({ value, onValueChange, onOpenCalendar, ...props }: DateInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const nativeProps = Object.fromEntries(Object.entries(props).filter(([key]) => !['onValidationError', 'minYear', 'maxYear', 'segmentLabel'].includes(key))) as ComponentProps<'input'>;
  function changeInput(event: ChangeEvent<HTMLInputElement>) {
    let text = event.currentTarget.value;
    let cursor = event.currentTarget.selectionStart ?? text.length;
    // Al borrar, un separador eliminado arrastra el dígito anterior y no se vuelve a agregar «/» al final:
    // así la fecha se borra de corrido con la tecla de retroceso.
    const deleting = (event.nativeEvent as InputEvent).inputType?.startsWith('delete') ?? false;
    if (deleting && text.replace(/\D/g, '').length === displayDate(value).replace(/\D/g, '').length) {
      const before = text.slice(0, cursor), last = before.search(/\d(?=\D*$)/);
      if (last >= 0) { text = text.slice(0, last) + text.slice(last + 1); cursor = last; }
    }
    const digitCount = text.slice(0, cursor).replace(/\D/g, '').length;
    const formatted = deleting ? formatDateInput(text).replace(/\/$/, '') : formatDateInput(text);
    onValueChange(dateValue(formatted));
    const nextCursor = caretAfterDigits(formatted, digitCount);
    requestAnimationFrame(() => input.current?.setSelectionRange(nextCursor, nextCursor));
  }
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    nativeProps.onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== 'ArrowDown') return;
    event.preventDefault();
    onOpenCalendar?.();
  }
  const text = displayDate(value);
  return <div className="cenit-date-input">
    <input {...nativeProps} className={`cenit-input ${nativeProps.className ?? ''}`.trim()} ref={input} type="text" inputMode="numeric" maxLength={10} placeholder="dd/mm/aaaa" autoComplete="off"
      value={text} onChange={changeInput} onKeyDown={handleKeyDown} />
    {text && text.length < 10 && <span className="cenit-date-mask" aria-hidden="true"><span>{text}</span>{'dd/mm/aaaa'.slice(text.length)}</span>}
  </div>;
}

// Filter inputs use real placeholders in three independent fields; forms keep their existing free-form draft behavior.
export function DateInput(props: DateInputProps) {
  return props.onValidationError ? <SegmentedDateInput {...props} /> : <PlainDateInput {...props} />;
}
