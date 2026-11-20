import { useEffect, useId, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { UserPlusIcon } from '@phosphor-icons/react/dist/csr/UserPlus';
import type { AssetListItem, Person } from '@cenit/contracts/assets';
import { createPerson, listAssets, listPeople } from '../api/assets.js';
import { brandLine, statuses } from '../model/labels.js';
import { Avatar, TextField, nullable } from './AssetsUi.js';
import { HttpError } from '../../../shared/lib/http.js';

function useDebounced(value: string, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(value), delay); return () => window.clearTimeout(timer); }, [value, delay]);
  return debounced;
}

// Combobox accesible con resultados del servidor: flechas, Enter y Escape; la última opción puede ser una acción.
function Combo<T>({ id, label, placeholder, text, setText, results, loading, render, disabled, onPick, extra, error }: {
  id: string; label: string; placeholder: string; text: string; setText: (value: string) => void; results: T[]; loading: boolean;
  render: (item: T) => { key: string; content: ReactNode; disabled?: boolean }; disabled?: boolean; onPick: (item: T) => void;
  extra?: { label: ReactNode; run: () => void }; error?: string;
}) {
  const listId = useId(), [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const options = results.map(render), count = options.length + (extra ? 1 : 0);
  const shown = open && text.trim().length >= 2;
  function choose(index: number) {
    if (index === options.length && extra) { extra.run(); setOpen(false); return; }
    const item = results[index];
    if (item !== undefined && !options[index]!.disabled) { onPick(item); setOpen(false); }
  }
  return <div className="assets-field">
    <label htmlFor={id}>{label}</label>
    <div className="assets-combo">
      <MagnifyingGlassIcon size={16} aria-hidden="true" />
      <input id={id} className="cenit-input" type="search" name={`cenit-${id}`} value={text} placeholder={placeholder} autoComplete="off" spellCheck={false} data-1p-ignore data-lpignore="true" disabled={disabled}
        role="combobox" aria-expanded={shown} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={shown && count ? `${listId}-${active}` : undefined}
        aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-error` : undefined}
        onChange={event => { setText(event.target.value); setOpen(true); setActive(0); }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onKeyDown={event => {
          if (!shown || !count) { if (event.key === 'ArrowDown') setOpen(true); return; }
          if (event.key === 'ArrowDown') { event.preventDefault(); setActive((active + 1) % count); }
          else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((active - 1 + count) % count); }
          else if (event.key === 'Enter') { event.preventDefault(); choose(active); }
          else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
        }} />
      {shown && <ul id={listId} role="listbox" aria-label={label} className="assets-options">
        {loading && !options.length && <li className="assets-options__note" role="presentation">Buscando…</li>}
        {!loading && !options.length && <li className="assets-options__note" role="presentation">Sin coincidencias.</li>}
        {options.map((option, index) => <li key={option.key} id={`${listId}-${index}`} role="option" aria-selected={index === active} aria-disabled={option.disabled || undefined}
          onMouseDown={event => { event.preventDefault(); choose(index); }} onMouseEnter={() => setActive(index)}>{option.content}</li>)}
        {extra && <li id={`${listId}-${options.length}`} role="option" aria-selected={active === options.length} className="assets-options__add"
          onMouseDown={event => { event.preventDefault(); choose(options.length); }} onMouseEnter={() => setActive(options.length)}><UserPlusIcon size={16} aria-hidden="true" /><div><span>{extra.label}</span></div></li>}
      </ul>}
    </div>
    {error && <p className="assets-error" id={`${id}-error`}>{error}</p>}
  </div>;
}

const personDetail = (person: Person) => [person.rut, person.position, person.unit].filter(Boolean).join(' · ');
export function PersonCard({ person, action }: { person: Person; action?: ReactNode }) {
  return <div className="assets-picked">
    <Avatar name={person.name} inactive={!person.active} />
    <div><strong>{person.name}</strong><span className="assets-sub">{personDetail(person) || 'Sin RUT, cargo ni unidad registrados'}</span>
      {!person.active && <span className="assets-sub" style={{ color: 'var(--color-warning)' }}>Ya no pertenece a la institución</span>}</div>
    {action}
  </div>;
}

/** Elige a una persona de la lista de responsables o la agrega en el momento. Quien ya no pertenece no se puede elegir. */
export function PersonPicker({ id, label, value, onChange, error }: { id: string; label: string; value: Person | null; onChange: (person: Person | null) => void; error?: string }) {
  const [text, setText] = useState(''), q = useDebounced(text.trim());
  const [draft, setDraft] = useState<{ name: string; rut: string; unit: string; position: string } | null>(null);
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState('');
  const client = useQueryClient();
  const results = useQuery({ queryKey: ['assets', 'people', 'search', q], queryFn: ({ signal }) => listPeople({ q }, signal), enabled: q.length >= 2 && !value });
  if (value) return <div className="assets-field"><span style={{ color: 'var(--color-ink-label)', fontSize: 13, fontWeight: 500 }}>{label}</span>
    <PersonCard person={value} action={<button type="button" className="cenit-button cenit-button--quiet" onClick={() => onChange(null)}>Cambiar</button>} /></div>;
  async function save() {
    if (!draft?.name.trim()) { setSaveError('Escribe el nombre completo.'); return; }
    setSaving(true); setSaveError('');
    try {
      const person = await createPerson({ name: draft.name.trim(), rut: nullable(draft.rut), unit: nullable(draft.unit), position: nullable(draft.position) });
      void client.invalidateQueries({ queryKey: ['assets'] });
      setDraft(null); setText(''); onChange(person);
    } catch (cause) { setSaveError(cause instanceof HttpError ? cause.message : 'No pudimos agregar a la persona.'); } finally { setSaving(false); }
  }
  return <div>
    <Combo id={id} label={label} placeholder="Busca por nombre, RUT, cargo o unidad" text={text} setText={setText} error={error}
      results={q === text.trim() ? results.data ?? [] : []} loading={results.isFetching || q !== text.trim()}
      render={person => ({ key: person.id, disabled: !person.active, content: <><Avatar name={person.name} inactive={!person.active} /><div><span>{person.name}</span><small>{person.active ? personDetail(person) || 'Sin datos adicionales' : 'Ya no pertenece a la institución'}</small></div></> })}
      onPick={person => { setText(''); onChange(person); }}
      extra={{ label: `Agregar «${text.trim()}» como persona nueva`, run: () => setDraft({ name: text.trim(), rut: '', unit: '', position: '' }) }} />
    {draft && <div className="assets-newperson" role="group" aria-label="Persona nueva">
      <p>Persona nueva</p>
      <div className="assets-grid">
        <TextField id={`${id}-name`} label="Nombre completo" value={draft.name} onChange={name => setDraft({ ...draft, name })} />
        <TextField id={`${id}-rut`} label="RUT" optional value={draft.rut} onChange={rut => setDraft({ ...draft, rut })} placeholder="12.345.678-9" />
        <TextField id={`${id}-unit`} label="Unidad" optional value={draft.unit} onChange={unit => setDraft({ ...draft, unit })} />
        <TextField id={`${id}-position`} label="Cargo" optional value={draft.position} onChange={position => setDraft({ ...draft, position })} />
      </div>
      {saveError && <p className="assets-error" role="alert">{saveError}</p>}
      <div><button type="button" className="cenit-button" disabled={saving} onClick={() => { void save(); }}>{saving ? 'Agregando…' : 'Agregar persona'}</button><button type="button" className="cenit-button cenit-button--quiet" onClick={() => setDraft(null)}>Cancelar</button></div>
    </div>}
  </div>;
}

/** Busca en el inventario por código, serie o descripción. `forLoan` excluye los bienes ya prestados. */
export function AssetPicker({ id, label, exclude, onPick, forLoan = false, disabled, error }: {
  id: string; label: string; exclude: string[]; onPick: (asset: AssetListItem) => void; forLoan?: boolean; disabled?: boolean; error?: string;
}) {
  const [text, setText] = useState(''), q = useDebounced(text.trim());
  const results = useQuery({ queryKey: ['assets', 'pick', q, forLoan], queryFn: ({ signal }) => listAssets({ q, page: 1, pageSize: 8, available: forLoan ? 'loan' : undefined }, signal), enabled: q.length >= 2 });
  const items = (results.data?.data ?? []).filter(asset => !exclude.includes(asset.id));
  return <Combo id={id} label={label} placeholder="Busca en el inventario por código, serie, descripción o marca" text={text} setText={setText} disabled={disabled} error={error}
    results={q === text.trim() ? items : []} loading={results.isFetching || q !== text.trim()}
    render={asset => ({ key: asset.id, disabled: !forLoan && !!asset.loan, content: <div>
      <span><b className="assets-num" style={{ fontWeight: 500 }}>{asset.code}</b> · {asset.description}</span>
      <small>{[brandLine(asset), asset.serialNumber && `Serie ${asset.serialNumber}`].filter(Boolean).join(' · ')}</small>
      <small>{asset.loan ? `En préstamo a ${asset.loan.borrowerName}; registra la devolución antes de entregarlo` : asset.custodian ? `Hoy con ${asset.custodian.name}` : statuses[asset.status].label}</small>
    </div> })}
    onPick={asset => { setText(''); onPick(asset); }} />;
}
