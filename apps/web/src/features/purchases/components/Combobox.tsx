import { useId, useMemo, useRef, useState, type ComponentProps } from 'react';
import * as Popover from '@radix-ui/react-popover';

export type ComboOption = { value: string; label?: string; group?: string };
const plain = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es');

/**
 * Campo de texto con sugerencias: se puede escribir cualquier valor (los catálogos nombran códigos, no los restringen)
 * o elegir uno de la lista con el teclado. El foco se queda en el campo, como pide el patrón combobox.
 */
export function Combobox({ value, onValueChange, options, emptyText = 'Sin coincidencias. Puedes dejar lo escrito.', limit = 60, ...input }:
  Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'role'> & { value: string; onValueChange: (value: string) => void; options: ComboOption[]; emptyText?: string; limit?: number }) {
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1), [typed, setTyped] = useState(false);
  const list = useId(), field = useRef<HTMLInputElement>(null);
  // Al abrir con un valor ya elegido se muestra la lista completa; al escribir, sólo lo que coincide.
  const shown = useMemo(() => {
    const text = typed ? plain(value.trim()) : '';
    return (text ? options.filter(option => plain(`${option.value} ${option.label ?? ''}`).includes(text)) : options).slice(0, limit);
  }, [options, value, typed, limit]);
  const choose = (option: ComboOption) => { onValueChange(option.value); setOpen(false); setTyped(false); setActive(-1); field.current?.focus(); };
  const optionId = (index: number) => `${list}-${index}`;
  return <Popover.Root open={open && !input.disabled} onOpenChange={next => { if (!next) setOpen(false); }}>
    <Popover.Anchor asChild>
      <input {...input} ref={field} value={value} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? list : undefined}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined} autoComplete="off"
        onChange={event => { onValueChange(event.target.value); setTyped(true); setOpen(true); setActive(-1); }}
        onFocus={event => { input.onFocus?.(event); }}
        onClick={() => setOpen(true)}
        onBlur={event => { input.onBlur?.(event); }}
        onKeyDown={event => {
          input.onKeyDown?.(event);
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            if (shown.length) setActive(current => event.key === 'ArrowDown' ? (current + 1) % shown.length : (current - 1 + shown.length) % shown.length);
          } else if (event.key === 'Enter' && open && active >= 0 && shown[active]) { event.preventDefault(); choose(shown[active]); }
          else if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          else if (event.key === 'Tab') setOpen(false);
        }} />
    </Popover.Anchor>
    <Popover.Portal><Popover.Content id={list} role="listbox" aria-label={typeof input['aria-label'] === 'string' ? `Opciones: ${input['aria-label']}` : 'Sugerencias'} className="cenit-popover cenit-select-menu purchase-combobox"
      align="start" sideOffset={6} collisionPadding={16} onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}
      onInteractOutside={event => { if (event.target === field.current) event.preventDefault(); }}>
      {shown.length ? shown.map((option, index) => <div key={`${option.group ?? ''}${option.value}`}>
        {option.group && option.group !== shown[index - 1]?.group && <p className="purchase-combobox__group">{option.group}</p>}
        <div id={optionId(index)} role="option" aria-selected={option.value === value} data-active={index === active}
          onMouseDown={event => event.preventDefault()} onClick={() => choose(option)} onMouseMove={() => setActive(index)}>
          <span className="purchase-combobox__value">{option.value}</span>{option.label && <span className="purchase-combobox__label">{option.label}</span>}
        </div>
      </div>) : <p className="purchase-combobox__empty">{emptyText}</p>}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
