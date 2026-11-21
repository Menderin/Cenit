import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { FolderSimpleIcon } from '@phosphor-icons/react/dist/csr/FolderSimple';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import type { PurchaseProjectOption } from '@cenit/contracts/purchases';
import { useExitPresence } from '../../../shared/lib/use-exit-presence.js';
import { compactAmount } from './charts.js';

const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es');
const purchases = (count: number) => `${count} ${count === 1 ? 'compra' : 'compras'}`;

/** Selector con búsqueda: primero los proyectos con gasto en el año y luego el resto del catálogo oficial. */
export function ProjectPicker({ value, year, projects, loading, error, onChange }: {
  value: string; year: string; projects?: PurchaseProjectOption[]; loading: boolean; error: boolean; onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false), [text, setText] = useState('');
  const { mounted, closing } = useExitPresence(open);
  const search = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null);
  const selected = projects?.find(project => project.code === value);
  const filtered = useMemo(() => {
    const words = normalize(text).split(/\s+/).filter(Boolean);
    return (projects ?? []).filter(project => words.every(word => normalize(`${project.code} ${project.name ?? ''}`).includes(word)));
  }, [projects, text]);
  const groups = [{ label: `Con gasto en ${year}`, items: filtered.filter(project => project.count > 0) }, { label: `Sin compras en ${year}`, items: filtered.filter(project => project.count === 0) }];
  function close() { setOpen(false); setText(''); }
  function choose(code: string) { onChange(code); close(); }
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const options = [...(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
    const index = options.findIndex(option => option === document.activeElement);
    let next: HTMLElement | undefined;
    if (event.key === 'ArrowDown') next = options[index + 1] ?? options[0];
    else if (event.key === 'ArrowUp') next = index <= 0 ? search.current ?? undefined : options[index - 1];
    else if (event.key === 'Home' && index >= 0) next = options[0];
    else if (event.key === 'End' && index >= 0) next = options.at(-1);
    if (next) { event.preventDefault(); next.focus(); next.scrollIntoView({ block: 'nearest' }); }
  }
  const option = (project: PurchaseProjectOption) => <button key={project.code} type="button" role="option" aria-selected={project.code === value} tabIndex={-1} onClick={() => choose(project.code)}>
    <span className="home-project-option__name"><small>{project.code}</small><span>{project.name ?? 'Sin nombre en el catálogo'}</span></span>
    {project.count > 0 ? <span className="home-project-option__value"><b>{compactAmount(project.amount)}</b><small>{purchases(project.count)}</small></span>
      : project.code === value && <CheckIcon size={15} aria-hidden="true" />}
  </button>;
  return <div className="home-project-filter">
    <Popover.Root open={mounted} onOpenChange={next => { if (next) setOpen(true); else close(); }}>
      <Popover.Trigger asChild><button type="button" className="cenit-button home-project-trigger" aria-haspopup="listbox"
        aria-label={`Proyecto: ${value ? `${value} ${selected?.name ?? ''}`.trim() : 'todos los proyectos'}`} onClick={event => { if (closing) { event.preventDefault(); setOpen(true); } }}>
        <FolderSimpleIcon size={17} aria-hidden="true" />
        <span>{value ? <><small>{value}</small>{selected?.name ?? 'Proyecto'}</> : 'Todos los proyectos'}</span>
        <CaretDownIcon size={14} aria-hidden="true" />
      </button></Popover.Trigger>
      <Popover.Portal><Popover.Content className={`cenit-popover home-project-menu${closing ? ' cenit-closing' : ''}`} inert={closing} align="end" sideOffset={6} collisionPadding={16}
        onOpenAutoFocus={event => { event.preventDefault(); search.current?.focus(); }} onKeyDown={navigate}>
        <label className="home-project-search"><MagnifyingGlassIcon size={16} aria-hidden="true" /><span className="purchase-sr-only">Buscar proyecto</span>
          <input ref={search} className="cenit-input" type="search" value={text} placeholder="Código o nombre" autoComplete="off" onChange={event => setText(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') { const first = groups.flatMap(group => group.items)[0]; if (first) { event.preventDefault(); choose(first.code); } } }} />
        </label>
        <div ref={list} role="listbox" aria-label="Proyectos" className="home-project-options">
          {!text && <button type="button" role="option" aria-selected={!value} tabIndex={-1} onClick={() => choose('')}>
            <span className="home-project-option__name"><span>Todos los proyectos</span></span>{!value && <CheckIcon size={15} aria-hidden="true" />}
          </button>}
          {loading ? <p className="home-project-note">Cargando proyectos…</p> : error ? <p className="home-project-note">No se pudieron cargar los proyectos.</p>
            : !filtered.length ? <p className="home-project-note">Ningún proyecto coincide con «{text}».</p>
            : groups.filter(group => group.items.length).map(group => <div role="group" aria-label={group.label} key={group.label}>
              <p className="home-project-group" aria-hidden="true">{group.label}</p>{group.items.map(option)}
            </div>)}
        </div>
      </Popover.Content></Popover.Portal>
    </Popover.Root>
    {value && <button type="button" className="cenit-button cenit-button--icon home-project-clear" aria-label="Quitar el filtro de proyecto" title="Ver todos los proyectos" onClick={() => onChange('')}><XIcon size={16} aria-hidden="true" /></button>}
  </div>;
}
