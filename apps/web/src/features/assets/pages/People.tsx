import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { UsersIcon } from '@phosphor-icons/react/dist/csr/Users';
import { UserPlusIcon } from '@phosphor-icons/react/dist/csr/UserPlus';
import type { PeopleQuery, Person } from '@cenit/contracts/assets';
import { createPerson, listPeople, setPersonStatus } from '../api/assets.js';
import { Avatar, LoadState, TextField, nullable } from '../components/AssetsUi.js';
import { useListParams } from './Deliveries.js';
import { ContextualConfirm } from '../../../shared/components/ContextualConfirm.js';
import { HttpError } from '../../../shared/lib/http.js';
import { displayDate } from '../../../shared/lib/dates.js';
import '../assets.css';

type View = NonNullable<PeopleQuery['status']>;
const views: { value: View; label: string }[] = [{ value: 'all', label: 'Todas' }, { value: 'review', label: 'Por revisar' }, { value: 'active', label: 'Vigentes' }, { value: 'inactive', label: 'Ya no pertenecen' }];

/** Cambia la vigencia de una persona. Quien ya no pertenece conserva sus bienes hasta entregarlos a otra persona. */
function StatusButton({ person }: { person: Person }) {
  const button = useRef<HTMLButtonElement>(null), client = useQueryClient();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function confirm() {
    setBusy(true); setError('');
    try {
      await setPersonStatus(person.id, !person.active);
      await client.invalidateQueries({ queryKey: ['assets'] });
      setOpen(false);
      toast.success(person.active ? 'Marcada como «ya no pertenece»' : 'Marcada como vigente', { description: person.active && person.assetCount ? 'Sus bienes quedaron por revisar. Entrégalos a otra persona.' : undefined });
    } catch (cause) { setError(cause instanceof HttpError ? cause.message : 'No pudimos guardar el cambio.'); } finally { setBusy(false); }
  }
  return <>
    <button ref={button} type="button" className="cenit-button cenit-button--quiet" onClick={() => { setError(''); setOpen(true); }}>{person.active ? 'Ya no pertenece' : <><span className="assets-long">Volver a vigente</span><span className="assets-short">Reactivar</span></>}</button>
    <ContextualConfirm open={open} origin={button.current} caution={person.active} title={person.active ? `¿${person.name} ya no pertenece a la institución?` : `¿${person.name} vuelve a estar vigente?`}
      description={person.active ? (person.assetCount ? `Sus ${person.assetCount} bienes quedarán «por revisar» hasta que los entregues a otra persona.` : 'No podrá recibir nuevas entregas ni préstamos.') : 'Podrá volver a recibir entregas y préstamos.'}
      confirmLabel={person.active ? 'Sí, ya no pertenece' : 'Sí, está vigente'} cancelLabel="Cancelar" busy={busy} busyLabel="Guardando…" onCancel={() => setOpen(false)} onConfirm={() => { void confirm(); }}>
      {error && <p className="cenit-dialog-error" role="alert">{error}</p>}
    </ContextualConfirm>
  </>;
}

export function AddPerson() {
  const button = useRef<HTMLButtonElement>(null), client = useQueryClient();
  const [open, setOpen] = useState(false), [draft, setDraft] = useState({ name: '', rut: '', unit: '', position: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function confirm() {
    if (!draft.name.trim()) { setError('Escribe el nombre completo.'); return; }
    setBusy(true); setError('');
    try {
      await createPerson({ name: draft.name.trim(), rut: nullable(draft.rut), unit: nullable(draft.unit), position: nullable(draft.position) });
      await client.invalidateQueries({ queryKey: ['assets'] });
      setOpen(false); toast.success('Persona agregada', { description: draft.name.trim() });
    } catch (cause) { setError(cause instanceof HttpError ? cause.message : 'No pudimos agregar a la persona.'); } finally { setBusy(false); }
  }
  return <>
    <button ref={button} type="button" className="cenit-button cenit-button--primary" onClick={() => { setDraft({ name: '', rut: '', unit: '', position: '' }); setError(''); setOpen(true); }}><UserPlusIcon size={16} aria-hidden="true" />Agregar persona</button>
    <ContextualConfirm open={open} origin={button.current} wide title="Agregar persona" description="Podrá recibir bienes en entregas y préstamos." confirmLabel="Agregar" cancelLabel="Cancelar" busy={busy} busyLabel="Agregando…" onCancel={() => setOpen(false)} onConfirm={() => { void confirm(); }}>
      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        <TextField id="person-name" label="Nombre completo" value={draft.name} onChange={name => setDraft({ ...draft, name })} />
        <TextField id="person-rut" label="RUT" optional value={draft.rut} onChange={rut => setDraft({ ...draft, rut })} placeholder="12.345.678-9" />
        <TextField id="person-unit" label="Unidad" optional value={draft.unit} onChange={unit => setDraft({ ...draft, unit })} />
        <TextField id="person-position" label="Cargo" optional value={draft.position} onChange={position => setDraft({ ...draft, position })} />
      </div>
      {error && <p className="cenit-dialog-error" role="alert">{error}</p>}
    </ContextualConfirm>
  </>;
}

export function People() {
  const list = useListParams();
  const view = views.some(item => item.value === list.params.get('estado')) ? list.params.get('estado') as View : 'all';
  const query = useQuery({ queryKey: ['assets', 'people', 'list', list.q, view], queryFn: ({ signal }) => listPeople({ q: list.q || undefined, status: view }, signal) });
  const people = query.data;
  return <>
    <div className="assets-toolbar">
      <div className="assets-segmented" role="group" aria-label="Mostrar personas">{views.map(item => <button key={item.value} type="button" aria-pressed={view === item.value} onClick={() => list.update({ estado: item.value === 'all' ? undefined : item.value })}>{item.label}</button>)}</div>
      <label className="assets-search" role="search"><span className="assets-sr">Buscar personas</span><MagnifyingGlassIcon size={16} aria-hidden="true" />
        <input className="cenit-input" type="search" value={list.text} onChange={event => list.setText(event.target.value)} placeholder="Nombre, RUT, unidad o cargo" autoComplete="off" /></label>
    </div>
    {view === 'review' && <p className="assets-sub" style={{ margin: '-4px 0 12px', fontSize: 13 }}>Personas que ya no pertenecen a la institución pero todavía tienen bienes a cargo. Usa «Entregar sus bienes» para pasarlos a otra persona de una vez.</p>}
    <LoadState query={query} label="las personas" />
    {people && !query.isError && (!people.length ? <div className="cenit-empty cenit-empty--bordered"><span className="cenit-empty__icon"><UsersIcon size={26} aria-hidden="true" /></span>
      <h3>{view === 'review' ? 'No hay responsables por revisar' : 'No encontramos personas'}</h3><p>{view === 'review' ? 'Todos los bienes tienen un responsable vigente.' : 'Agrega a una persona o prueba con otra búsqueda.'}</p></div>
      : <div className="assets-table-wrap"><table className="assets-table assets-people"><caption className="assets-sr">Responsables</caption>
        <colgroup><col className="assets-col-person" /><col /><col className="assets-col-count" /><col className="assets-col-status" /><col className="assets-col-actions" /></colgroup>
        <thead><tr><th scope="col">Persona</th><th scope="col">Unidad y cargo</th><th scope="col">Bienes a cargo</th><th scope="col">Situación</th><th scope="col"><span className="assets-sr">Acciones</span></th></tr></thead>
        <tbody>{people.map(person => <tr key={person.id}>
          <th scope="row" title={person.name}><span className="assets-person"><Avatar name={person.name} inactive={!person.active} /><span style={{ minWidth: 0 }}><strong className="assets-clip">{person.name}</strong><span className="assets-sub assets-num">{person.rut ?? 'Sin RUT'}</span></span></span></th>
          <td title={[person.unit, person.position].filter(Boolean).join(' · ')}><span className="assets-clip">{person.unit ?? <span className="assets-muted">Sin unidad</span>}</span><span className="assets-sub assets-clip">{person.position ?? 'Sin cargo'}</span></td>
          <td>{person.assetCount ? <Link to={`/administracion/bienes?responsable=${person.id}`}>{person.assetCount} {person.assetCount === 1 ? 'bien' : 'bienes'}</Link> : <span className="assets-muted">Ninguno</span>}</td>
          <td>{person.active ? <span className="assets-chip assets-chip--ok">Vigente</span> : <span className={`assets-chip ${person.assetCount ? 'assets-chip--review' : 'assets-chip--none'}`}>Ya no pertenece</span>}
            <span className="assets-sub">{person.inactiveSince ? `Desde el ${displayDate(person.inactiveSince)}` : '\u00a0'}</span></td>
          <td className="assets-actions-cell"><div className="assets-row-actions">
            {!person.active && person.assetCount > 0 && <Link className="cenit-button" to={`/administracion/bienes/entregas/nueva?desde=${person.id}`}><span className="assets-long">Entregar sus bienes</span><span className="assets-short">Entregar</span></Link>}
            <StatusButton person={person} />
          </div></td>
        </tr>)}</tbody></table></div>)}
  </>;
}
