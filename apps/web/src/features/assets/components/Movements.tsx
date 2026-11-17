import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowUUpLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowUUpLeft';
import type { AssetDetail } from '@cenit/contracts/assets';
import { relocateAsset, returnLoan } from '../api/assets.js';
import { today } from '../model/labels.js';
import { ContextualConfirm } from '../../../shared/components/ContextualConfirm.js';
import { DateField } from '../../../shared/components/DateField.js';
import { HttpError } from '../../../shared/lib/http.js';
import { nullable } from './AssetsUi.js';

const message = (cause: unknown) => cause instanceof HttpError ? cause.message : 'No pudimos registrar el movimiento.';

/** Registra la devolución de un préstamo; la confirmación se abre junto al botón. */
export function ReturnLoanButton({ loanId, number, loanedOn, small = false, primary = false }: { loanId: string; number: string; loanedOn: string; small?: boolean; primary?: boolean }) {
  const button = useRef<HTMLButtonElement>(null), client = useQueryClient();
  const [open, setOpen] = useState(false), [date, setDate] = useState(today()), [note, setNote] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function confirm() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError('Indica la fecha de devolución.'); return; }
    if (date < loanedOn) { setError('La devolución no puede ser anterior al préstamo.'); return; }
    setBusy(true); setError('');
    try {
      await returnLoan(loanId, { returnedOn: date, note: nullable(note) });
      await client.invalidateQueries({ queryKey: ['assets'] });
      setOpen(false); toast.success('Devolución registrada', { description: `El préstamo ${number} quedó cerrado.` });
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }
  return <>
    <button ref={button} type="button" className={`cenit-button${primary ? ' cenit-button--primary' : ''}`} style={small ? { minHeight: 34, padding: '6px 10px', fontSize: 13 } : undefined}
      onClick={() => { setDate(today()); setNote(''); setError(''); setOpen(true); }}><ArrowUUpLeftIcon size={15} aria-hidden="true" />Registrar devolución</button>
    <ContextualConfirm open={open} origin={button.current} wide title={`Registrar devolución del préstamo ${number}`} description="El bien queda disponible otra vez con su responsable y ubicación."
      confirmLabel="Registrar" cancelLabel="Cancelar" busy={busy} busyLabel="Registrando…" onCancel={() => setOpen(false)} onConfirm={() => { void confirm(); }}>
      <div className="assets-field" style={{ marginTop: 14 }}><label htmlFor={`return-${loanId}`}>Fecha de devolución</label>
        <DateField id={`return-${loanId}`} label="Fecha de devolución" value={date} onValueChange={setDate} /></div>
      <div className="assets-field" style={{ marginTop: 10 }}><label htmlFor={`return-note-${loanId}`}>Observación <small>(opcional)</small></label>
        <input id={`return-note-${loanId}`} className="cenit-input" value={note} maxLength={500} placeholder="Estado del bien al volver" onChange={event => setNote(event.target.value)} /></div>
      {error && <p className="cenit-dialog-error" role="alert">{error}</p>}
    </ContextualConfirm>
  </>;
}

/** Cambia la ubicación del bien y deja el movimiento en su trazabilidad. */
export function RelocateButton({ asset, locations }: { asset: AssetDetail; locations: string[] }) {
  const button = useRef<HTMLButtonElement>(null), client = useQueryClient();
  const [open, setOpen] = useState(false), [location, setLocation] = useState(''), [date, setDate] = useState(today()), [note, setNote] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function confirm() {
    if (!location.trim()) { setError('Escribe la nueva ubicación.'); return; }
    if (location.trim() === asset.location) { setError('El bien ya está en esa ubicación.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError('Indica la fecha del cambio.'); return; }
    setBusy(true); setError('');
    try {
      await relocateAsset(asset.id, { expectedVersion: asset.version, location: location.trim(), occurredOn: date, note: nullable(note) });
      await client.invalidateQueries({ queryKey: ['assets'] });
      setOpen(false); toast.success('Ubicación actualizada', { description: `${asset.code} está ahora en ${location.trim()}.` });
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }
  return <>
    <button ref={button} type="button" className="cenit-button cenit-button--quiet" style={{ minHeight: 32, padding: '6px 10px', fontSize: 13 }}
      onClick={() => { setLocation(''); setDate(today()); setNote(''); setError(''); setOpen(true); }}>Cambiar ubicación</button>
    <ContextualConfirm open={open} origin={button.current} wide title="Cambiar ubicación" description={`Hoy está en ${asset.location}. El cambio queda anotado en el historial del bien.`}
      confirmLabel="Guardar ubicación" cancelLabel="Cancelar" busy={busy} busyLabel="Guardando…" onCancel={() => setOpen(false)} onConfirm={() => { void confirm(); }}>
      <div className="assets-field" style={{ marginTop: 14 }}><label htmlFor="relocate-place">Nueva ubicación</label>
        <input id="relocate-place" className="cenit-input" list="relocate-places" value={location} maxLength={255} autoComplete="off" placeholder="Recinto, pabellón o unidad" onChange={event => setLocation(event.target.value)} />
        <datalist id="relocate-places">{locations.filter(place => place !== asset.location).map(place => <option key={place} value={place} />)}</datalist></div>
      <div className="assets-field" style={{ marginTop: 10 }}><label htmlFor="relocate-date">Fecha del cambio</label><DateField id="relocate-date" label="Fecha del cambio" value={date} onValueChange={setDate} /></div>
      <div className="assets-field" style={{ marginTop: 10 }}><label htmlFor="relocate-note">Motivo <small>(opcional)</small></label>
        <input id="relocate-note" className="cenit-input" value={note} maxLength={500} onChange={event => setNote(event.target.value)} /></div>
      {error && <p className="cenit-dialog-error" role="alert">{error}</p>}
    </ContextualConfirm>
  </>;
}
