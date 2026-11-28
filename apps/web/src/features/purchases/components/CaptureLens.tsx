import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowsOutIcon } from '@phosphor-icons/react/dist/csr/ArrowsOut';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import type { ExtractionRegion } from '@cenit/contracts/purchases';
import type { SelectedCapture } from '../model/capture-file.js';
import { purchaseProblemLabel } from '../model/fields.js';
import { usePurchaseDialog } from '../model/dialog.js';
import { CapturePreview } from './CapturePreview.js';

const HEIGHT = 88, LINE = 20;

/**
 * La lupa: sobre la fila muestra, a tamaño legible, el trozo de la captura del campo que se está revisando (o el título
 * de la solicitud). La captura completa, con zoom y recuadros, se abre en un panel lateral.
 */
export function CaptureLens({ capture, regions, activePath, title, onSelect }: {
  capture: SelectedCapture; regions: ExtractionRegion[]; activePath: string; title: string; onSelect: (path: string) => void;
}) {
  const view = useRef<HTMLDivElement>(null), [width, setWidth] = useState(0), [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const element = view.current!;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const region = regions.find(item => item.path === activePath) ?? regions.find(item => item.path === '/header/requestNumber') ?? regions[0];
  // La escala deja una línea de la captura en unos 20 px de alto, sea de pantalla Retina o común, sin salirse del ancho.
  const lines = regions.filter(item => item.path.startsWith('/header/')).map(item => item.height * capture.height).sort((a, b) => a - b);
  const line = lines[Math.floor(lines.length / 2)] ?? LINE;
  let crop = null;
  if (region && width) {
    const rx = region.x * capture.width, ry = region.y * capture.height, rw = region.width * capture.width, rh = region.height * capture.height;
    const scale = Math.max(.05, Math.min(LINE / line, (width - 32) / rw, (HEIGHT - 16) / rh, 1.5));
    const iw = capture.width * scale, ih = capture.height * scale;
    const clamp = (value: number, size: number, frame: number) => size <= frame ? (frame - size) / 2 : Math.min(0, Math.max(frame - size, value));
    const left = clamp(width / 2 - (rx + rw / 2) * scale, iw, width), top = clamp(HEIGHT / 2 - (ry + rh / 2) * scale, ih, HEIGHT);
    crop = { image: { left, top, width: iw }, mark: { left: left + rx * scale - 3, top: top + ry * scale - 3, width: rw * scale + 6, height: rh * scale + 6 } };
  }
  const label = region ? purchaseProblemLabel(region.path) : '';
  return <section className="capture-lens" aria-label="Así aparece en la captura">
    <div className="capture-lens__bar">
      <span>En la captura{label && <>: <strong>{label}</strong></>}</span>
      <button type="button" className="cenit-button capture-lens__open" onClick={() => setOpen(true)}><ArrowsOutIcon size={14} aria-hidden="true" />Ver captura completa</button>
    </div>
    <div ref={view} className="capture-lens__view" style={{ height: HEIGHT }}>
      {crop ? <>
        <img src={capture.url} alt={`Recorte de la captura: ${label}`} style={crop.image} />
        <span className="capture-lens__mark" aria-hidden="true" style={crop.mark} />
      </> : <p>{width ? 'Esta captura no tiene datos marcados. Ábrela completa para revisarla.' : ''}</p>}
    </div>
    {open && <CaptureSheet capture={capture} regions={regions} activePath={activePath} title={title} onClose={path => {
      setOpen(false);
      if (path) onSelect(path);
    }} />}
  </section>;
}

function CaptureSheet({ capture, regions, activePath, title, onClose }: {
  capture: SelectedCapture; regions: ExtractionRegion[]; activePath: string; title: string; onClose: (path: string | null) => void;
}) {
  const { dialog, closing, close } = usePurchaseDialog();
  const selected = useRef<string | null>(null);
  return <dialog ref={dialog} className={`purchase-sheet capture-sheet${closing ? ' purchase-sheet--closing' : ''}`} aria-labelledby="capture-sheet-title"
    onClose={() => onClose(selected.current)} onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="capture-sheet__surface" inert={closing}>
      <header className="capture-sheet__header">
        <h2 id="capture-sheet-title">Captura completa · {title}</h2>
        <button type="button" className="cenit-button cenit-button--icon cenit-button--quiet" aria-label="Cerrar" onClick={close}><XIcon size={16} aria-hidden="true" /></button>
      </header>
      <CapturePreview selected={capture} regions={regions} activePath={activePath} onSelect={path => { selected.current = path; close(); }} />
    </div>
  </dialog>;
}
