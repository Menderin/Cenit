import { useState, type ReactNode } from 'react';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { MagnifyingGlassMinusIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlassMinus';
import { MagnifyingGlassPlusIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlassPlus';
import { PencilSimpleIcon } from '@phosphor-icons/react/dist/csr/PencilSimple';

// Piezas de pantalla compartidas por los documentos de Personal.
export function StepNav<T extends string>({ steps, current, errors, complete, onGo }: {
  steps: { key: T; label: string }[]; current: T; errors: (step: T) => number; complete: (step: T) => boolean; onGo: (step: T) => void;
}) {
  return <nav aria-label="Secciones"><ol className="personnel-steps">
    {steps.map((item, position) => {
      const count = errors(item.key), done = !count && complete(item.key);
      return <li key={item.key}><button type="button" aria-current={item.key === current ? 'step' : undefined} onClick={() => onGo(item.key)}>
        <span className={`personnel-steps__number${count ? ' personnel-steps__number--error' : done ? ' personnel-steps__number--done' : ''}`}>{done ? <CheckIcon size={13} weight="bold" aria-label="Completa" /> : position + 1}</span>
        <span>{item.label}{count > 0 && <small>{count === 1 ? '1 campo por corregir' : `${count} campos por corregir`}</small>}</span>
      </button></li>;
    })}
  </ol></nav>;
}

export function ReviewSection({ title, errors, rows, onEdit }: {
  title: string; errors: number; rows: [string, string | undefined][]; onEdit: () => void;
}) {
  return <section className="personnel-review">
    <div className="personnel-review__head"><h3>{title}</h3><button type="button" className="cenit-button cenit-button--quiet" aria-label={`Editar ${title}`} onClick={onEdit}><PencilSimpleIcon size={15} aria-hidden="true" />Editar</button></div>
    {errors > 0 && <p className="personnel-error">{errors === 1 ? 'Hay 1 campo por corregir.' : `Hay ${errors} campos por corregir.`}</p>}
    <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={value ? undefined : 'personnel-unknown'}>{value ?? 'Sin información'}</dd></div>)}</dl>
  </section>;
}

export function DocumentPreview({ onClose, actions, pending, onFix, children }: {
  onClose: () => void; actions: ReactNode; pending: number; onFix: () => void; children: ReactNode;
}) {
  const [zoom, setZoom] = useState(100);
  return <div className="personnel-preview">
    <div className="personnel-preview__bar">
      <button type="button" className="cenit-button" onClick={onClose}><ArrowLeftIcon size={16} aria-hidden="true" />Volver al formulario</button>
      <div className="personnel-zoom" role="group" aria-label="Zoom">
        <button type="button" className="cenit-button cenit-button--icon" aria-label="Reducir" onClick={() => setZoom(Math.max(50, zoom - 10))}><MagnifyingGlassMinusIcon size={17} aria-hidden="true" /></button>
        <output aria-live="polite">{zoom} %</output>
        <button type="button" className="cenit-button cenit-button--icon" aria-label="Ampliar" onClick={() => setZoom(Math.min(160, zoom + 10))}><MagnifyingGlassPlusIcon size={17} aria-hidden="true" /></button>
      </div>
      {actions}
    </div>
    <p className="personnel-preview__notice">Vista previa aproximada; el documento final se genera al descargar o imprimir.</p>
    {pending > 0 && <div className="personnel-preview__pending" role="status">
      <p>{pending === 1 ? 'Falta 1 campo por completar o corregir.' : `Faltan ${pending} campos por completar o corregir.`} El documento no se descarga ni se imprime hasta resolverlos.</p>
      <button type="button" className="cenit-button" onClick={onFix}>Corregir</button>
    </div>}
    <div className="personnel-preview__sheet" role="region" aria-label="Vista previa del documento" tabIndex={0}><div style={{ zoom: zoom / 100 }}>{children}</div></div>
  </div>;
}
