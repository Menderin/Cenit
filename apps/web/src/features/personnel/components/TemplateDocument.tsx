import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { LoadingLabel, Skeleton } from '../../../shared/components/Skeleton.js';

type Box = readonly [number, number, number, number];
type Sheet = { width: number; height: number };

export function TemplateImage({ template, alt, sheet }: { template: string; alt: string; sheet: Sheet }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  return <span className="personnel-template" data-state={state}>
    <img src={template} alt={alt} width={sheet.width} height={sheet.height} onLoad={() => setState('ready')} onError={() => setState('error')} />
    {state === 'loading' && <>
      {alt && <LoadingLabel>Cargando la plantilla del documento…</LoadingLabel>}
      <span className="personnel-template__placeholder" aria-hidden="true">
        <Skeleton width="22%" height="26px" /><Skeleton width="58%" /><Skeleton width="39%" />
        <span className="personnel-template__fields"><Skeleton /><Skeleton /><Skeleton /><Skeleton /></span>
      </span>
    </>}
    {state === 'error' && <span className="personnel-template__placeholder" role={alt ? 'status' : undefined}>No se pudo cargar la plantilla.</span>}
  </span>;
}

/**
 * Coloca los valores sobre la plantilla de un formulario. Las coordenadas están en píxeles de la hoja original;
 * el texto se reduce hasta caber y marca la casilla cuando no cabe.
 */
export function TemplateDocument({ label, template, alt, sheet, cells, values, left, keepCase, variant }: {
  label: string; template: string; alt: string; sheet: Sheet;
  cells: Record<string, Box>; values: Record<string, string>; left: ReadonlySet<string>; keepCase?: ReadonlySet<string>;
  variant: 'commission' | 'leave';
}) {
  const paper = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    function fit() {
      paper.current?.querySelectorAll<HTMLElement>('.personnel-paper__value').forEach(field => {
        const text = field.firstElementChild as HTMLElement;
        text.style.fontSize = '';
        let size = parseFloat(getComputedStyle(text).fontSize);
        const overflows = () => text.scrollHeight > field.clientHeight || text.scrollWidth > field.clientWidth;
        while (overflows() && size > 6) { size = Math.max(6, size - 0.5); text.style.fontSize = `${size}px`; }
        field.dataset.overflow = String(overflows());
      });
    }
    fit();
    void document.fonts.ready.then(fit);
  }, [values]);

  return <article ref={paper} className={`personnel-paper personnel-paper--${variant}`} aria-label={label}
    style={{ '--paper-sheet-width': sheet.width, '--paper-ratio': `${sheet.width} / ${sheet.height}` } as CSSProperties}>
    <div className="personnel-paper__canvas">
      <TemplateImage template={template} alt={alt} sheet={sheet} />
      {Object.entries(values).map(([cell, value]) => {
        const [x, y, width, height] = cells[cell]!;
        const classes = ['personnel-paper__value', left.has(cell) && 'personnel-paper__value--left', keepCase?.has(cell) && 'personnel-paper__value--keep-case'].filter(Boolean).join(' ');
        return <div key={cell} data-cell={cell} className={classes}
          style={{ left: `${x / sheet.width * 100}%`, top: `${y / sheet.height * 100}%`, width: `${width / sheet.width * 100}%`, height: `${height / sheet.height * 100}%` }}><span>{value}</span></div>;
      })}
    </div>
    <small className="personnel-paper__draft">BORRADOR</small>
  </article>;
}
