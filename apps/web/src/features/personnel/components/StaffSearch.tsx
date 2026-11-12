import { useId, useRef, useState } from 'react';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { searchStaff, type Staff } from '../model/staff.js';

// Nombre del funcionario con sugerencias de la dotación; también acepta texto libre.
export function StaffSearch({ id, value, error, onChange, onPick }: {
  id: string; value: string; error?: string; onChange: (value: string) => void; onPick: (person: Staff) => void;
}) {
  const listId = useId(), errorId = useId();
  const [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const picked = useRef('');
  const results = open && value !== picked.current ? searchStaff(value) : [];
  const shown = results.length > 0;
  function pick(person: Staff) { picked.current = person.name; onPick(person); setOpen(false); }
  return <div className="personnel-field">
    <label htmlFor={id}>Nombre completo</label>
    <div className="personnel-search">
      <MagnifyingGlassIcon size={16} aria-hidden="true" />
      <input id={id} className="cenit-input" value={value} autoComplete="off" placeholder="Busca por nombre, RUT o cargo"
        role="combobox" aria-expanded={shown} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={shown ? `${listId}-${active}` : undefined}
        aria-invalid={!!error} aria-describedby={error ? errorId : undefined}
        onChange={event => { onChange(event.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={event => {
          if (!shown) { if (event.key === 'ArrowDown') setOpen(true); return; }
          if (event.key === 'ArrowDown') { event.preventDefault(); setActive((active + 1) % results.length); }
          else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((active - 1 + results.length) % results.length); }
          else if (event.key === 'Enter') { event.preventDefault(); pick(results[active]!); }
          else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
        }} />
      {shown && <ul id={listId} role="listbox" aria-label="Funcionarios" className="personnel-search__list">
        {results.map((person, index) => <li key={person.id} id={`${listId}-${index}`} role="option" aria-selected={index === active}
          onMouseDown={event => { event.preventDefault(); pick(person); }} onMouseEnter={() => setActive(index)}>
          <span>{person.name}</span><small>{person.rut} · {person.position} · {person.unit}</small>
        </li>)}
      </ul>}
    </div>
    {error && <p className="personnel-error" id={errorId}>{error}</p>}
  </div>;
}
