import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MagnifyingGlassPlusIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlassPlus';
import { MagnifyingGlassMinusIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlassMinus';
import type { ExtractionRegion } from '@cenit/contracts/purchases';
import type { SelectedCapture } from '../model/capture-file.js';
import { purchaseProblemLabel } from '../model/fields.js';

export function CapturePreview({ selected, regions, activePath, onSelect }: {
  selected: SelectedCapture; regions: ExtractionRegion[]; activePath: string; onSelect: (path: string) => void;
}) {
  const [zoom, setZoom] = useState(1), [showRegions, setShowRegions] = useState(true), [expanded, setExpanded] = useState(false);
  const viewer = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const viewport = viewer.current!;
    const observer = new ResizeObserver(() => setSize({ width: viewport.clientWidth, height: viewport.clientHeight }));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);
  const width = Math.min(size.width, size.height * selected.width / selected.height) * zoom;
  const height = width * selected.height / selected.width;
  useEffect(() => { setZoom(1); }, [selected.url]);
  useEffect(() => {
    const viewport = viewer.current, region = viewport?.querySelector<HTMLElement>('[data-active="true"]');
    if (!viewport || !region || zoom === 1) return;
    const box = region.getBoundingClientRect(), frame = viewport.getBoundingClientRect();
    // Pan only the image viewport; scrollIntoView also moves the form and page.
    viewport.scrollBy({ left: box.left < frame.left ? box.left - frame.left : Math.max(0, box.right - frame.right),
      top: box.top < frame.top ? box.top - frame.top : Math.max(0, box.bottom - frame.bottom), behavior: 'instant' });
  }, [activePath, zoom, width]);
  return <figure className={`capture-preview${expanded ? ' capture-preview--expanded' : ''}`}>
    <figcaption><strong>{selected.file.name}</strong><span>{selected.width} × {selected.height} px · {(selected.file.size / 1024).toFixed(0)} KiB</span></figcaption>
    <div className="capture-preview__toolbar" role="group" aria-label="Vista de la captura">
      <button type="button" aria-label="Alejar imagen" disabled={zoom === 1} onClick={() => setZoom(value => Math.max(1, value - .5))}><MagnifyingGlassMinusIcon size={18} aria-hidden="true" /></button>
      <button type="button" onClick={() => setZoom(1)}>Ajustar</button>
      <button type="button" aria-label="Acercar imagen" disabled={zoom === 4} onClick={() => setZoom(value => Math.min(4, value + .5))}><MagnifyingGlassPlusIcon size={18} aria-hidden="true" /></button>
      <button type="button" aria-pressed={showRegions} onClick={() => setShowRegions(value => !value)}>{showRegions ? 'Ocultar recuadros' : 'Mostrar recuadros'}</button>
      <button type="button" className="capture-preview__expand" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Reducir vista' : 'Ampliar vista'}</button>
    </div>
    <div ref={viewer} className="capture-preview__viewport" tabIndex={0} role="region" aria-label="Imagen y datos extraídos">
      <div className="capture-preview__stage" style={{ width: Math.max(size.width, width), height: Math.max(size.height, height) }}>
      <div className="capture-preview__image" data-zoom={zoom} style={{ width: width || '100%' }}>
        <img src={selected.url} alt="Vista previa de la captura seleccionada" />
        {showRegions && regions.map((region, index) => <button key={`${region.path}-${index}`} type="button" className="capture-region" data-active={activePath === region.path}
          aria-label={`Ver campo: ${purchaseProblemLabel(region.path)}`} title={purchaseProblemLabel(region.path)}
          style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }} onClick={() => onSelect(region.path)} />)}
      </div>
      </div>
    </div>
    <p>{activePath ? purchaseProblemLabel(activePath) : 'Selecciona un campo o un recuadro para comparar el dato.'}</p>
  </figure>;
}
