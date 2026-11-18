import { useLayoutEffect, useRef, type CSSProperties } from 'react';

type Box = readonly [number, number, number, number];

/**
 * Coloca los valores sobre la plantilla de un formulario. Las coordenadas están en píxeles de la hoja original;
 * el texto se reduce hasta caber y marca la casilla cuando no cabe.
 */
export function TemplateDocument({ label, template, alt, sheet, cells, values, left, keepCase, variant }: {
  label: string; template: string; alt: string; sheet: { width: number; height: number };
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
      <img className="personnel-paper__template" src={template} alt={alt} />
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
