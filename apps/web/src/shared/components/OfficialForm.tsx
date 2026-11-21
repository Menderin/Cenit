import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { cellStyle, formFrame, formMinSize, letterPage, type FormEntry, type FormFont, type FormLayout } from '@cenit/contracts';
import { LoadingLabel, Skeleton } from './Skeleton.js';
import './official-form.css';

const families: Record<FormFont, string> = {
  sans: 'Arial, Helvetica, sans-serif', 'sans-bold': 'Arial, Helvetica, sans-serif',
  serif: '"Times New Roman", Times, serif', 'serif-bold': '"Times New Roman", Times, serif',
};
const percent = (value: number, total: number) => `${value / total * 100}%`;

/** Imagen de la plantilla con su silueta mientras carga. Reserva el tamaño de la hoja para que nada salte. */
export function FormTemplate({ template, alt, sheet }: { template: string; alt: string; sheet: { width: number; height: number } }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  return <span className="cenit-form-template" data-state={state} style={{ aspectRatio: `${sheet.width} / ${sheet.height}` }}>
    <img src={template} alt={alt} onLoad={() => setState('ready')} onError={() => setState('error')} />
    {state === 'loading' && <>
      {alt && <LoadingLabel>Cargando la plantilla del documento…</LoadingLabel>}
      <span className="cenit-form-template__placeholder" aria-hidden="true">
        <Skeleton width="22%" height="26px" /><Skeleton width="58%" /><Skeleton width="39%" />
        <span className="cenit-form-template__fields"><Skeleton /><Skeleton /><Skeleton /><Skeleton /></span>
      </span>
    </>}
    {state === 'error' && <span className="cenit-form-template__placeholder" role={alt ? 'status' : undefined}>No se pudo cargar la plantilla.</span>}
  </span>;
}

/**
 * Copia exacta de un formulario oficial con sus casillas llenas, como en Word o Excel. Usa la misma definición
 * (hoja, casillas y letra) que el PDF del servidor: el texto se achica hasta caber y la casilla se marca si no cabe.
 */
export function OfficialForm<Cell extends string>({ label, template, alt, layout, entries, onOverflow }: {
  label: string; template: string; alt: string; layout: FormLayout<Cell>; entries: readonly FormEntry<Cell>[];
  /** Campos cuyo texto no cabe en su casilla (vacío cuando todo cabe). */
  onOverflow?: (fields: string[]) => void;
}) {
  const paper = useRef<HTMLElement>(null), report = useRef(onOverflow), last = useRef('');
  report.current = onOverflow;
  const frame = formFrame(layout), visible = entries.filter(([, , value]) => value);
  const key = JSON.stringify(visible);

  useLayoutEffect(() => {
    const element = paper.current;
    if (!element) return;
    function fit() {
      const minimum = element!.clientWidth * formMinSize / letterPage.width, overflowing = new Set<string>();
      element!.querySelectorAll<HTMLElement>('.cenit-form__value').forEach(field => {
        const text = field.firstElementChild as HTMLElement;
        text.style.fontSize = '';
        let size = parseFloat(getComputedStyle(text).fontSize);
        const overflows = () => text.scrollHeight > field.clientHeight + 0.5 || text.scrollWidth > field.clientWidth + 0.5;
        while (overflows() && size > minimum) { size = Math.max(minimum, size - 0.25); text.style.fontSize = `${size}px`; }
        const over = overflows();
        field.dataset.overflow = String(over);
        if (over) overflowing.add(field.dataset.field!);
      });
      const fields = [...overflowing], signature = fields.join('\n');
      if (signature !== last.current) { last.current = signature; report.current?.(fields); }
    }
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    void document.fonts.ready.then(fit);
    return () => observer.disconnect();
  }, [key]);

  // Coordenadas en puntos de la hoja carta; los tamaños se expresan en fracciones del ancho del papel.
  const unit = (points: number) => `calc(100cqw * ${points / letterPage.width})`;
  return <article ref={paper} className="cenit-form" aria-label={label} style={{ aspectRatio: `${letterPage.width} / ${letterPage.height}` }}>
    <div className="cenit-form__sheet" style={{
      left: percent(frame.x, letterPage.width), top: percent(frame.y, letterPage.height),
      width: percent(layout.sheet.width * frame.scale, letterPage.width), height: percent(layout.sheet.height * frame.scale, letterPage.height),
    }}>
      <FormTemplate template={template} alt={alt} sheet={layout.sheet} />
      {visible.map(([cell, field, value], index) => {
        const style = cellStyle(layout, cell), [x, y, width, height] = style.box;
        return <div key={`${cell}-${index}`} data-cell={cell} data-field={field} className="cenit-form__value" data-align={style.align} data-valign={style.valign}
          style={{
            left: percent(x, layout.sheet.width), top: percent(y, layout.sheet.height), width: percent(width, layout.sheet.width), height: percent(height, layout.sheet.height),
            '--form-inset': unit(2 * frame.scale), '--form-size': unit(style.size * frame.scale), fontFamily: families[style.font],
            fontWeight: style.font.endsWith('-bold') ? 700 : 400, textTransform: style.upper ? 'uppercase' : 'none',
          } as CSSProperties}><span>{value}</span></div>;
      })}
    </div>
    <small className="cenit-form__draft" style={{ bottom: percent(frame.mark, letterPage.height) }}>BORRADOR</small>
  </article>;
}
