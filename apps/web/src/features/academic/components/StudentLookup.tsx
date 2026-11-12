import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { UserIcon } from '@phosphor-icons/react/dist/csr/User';
import { Value } from '@sinclair/typebox/value';
import { StudentSearchSchema, compactRut, formatRutInput, isValidRutSearch, type StudentSearch, type StudentsResponse } from '@cenit/contracts/academic';
import { getStudents, retryAcademicRead } from '../api/academic.js';

export type Student = StudentsResponse['data'][number];
export function StudentLookup({ accountId, selected, onSelect }: { accountId: string; selected: Student | null; onSelect: (student: Student | null) => void }) {
  const [name, setName] = useState('');
  const [rut, setRut] = useState('');
  const [expanded, setExpanded] = useState(true);
  const switchButton = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const wasExpanded = useRef(true);
  const rutInput = useRef<HTMLInputElement>(null);
  const rutCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (rutCaret.current !== null) rutInput.current?.setSelectionRange(rutCaret.current, rutCaret.current);
    rutCaret.current = null;
  }, [rut]);
  useEffect(() => { if (selected && !expanded) switchButton.current?.focus(); }, [selected?.id, expanded]);
  useEffect(() => {
    if (expanded && !wasExpanded.current) nameInput.current?.focus();
    wasExpanded.current = expanded;
  }, [expanded]);
  const [search, setSearch] = useState<StudentSearch>({ page: 1, pageSize: 6 });
  const input: StudentSearch = { page: 1, pageSize: 6, ...(name.trim() ? { name: name.trim() } : {}), ...(rut.trim() ? { rut: rut.trim() } : {}) };
  const rutFormat = Boolean(rut && !isValidRutSearch(rut));
  const validation = rutFormat ? 'Revisa el formato del RUT y su dígito verificador (módulo 11).' : !Value.Check(StudentSearchSchema, input) ? 'Revisa el nombre y el formato del RUT.' : '';
  const rutInvalid = Boolean(rut && validation), nameInvalid = Boolean(name.trim() && validation && !rutFormat);
  const waiting = search.name !== input.name || search.rut !== input.rut;
  useEffect(() => {
    if (!expanded || validation) return;
    const timer = setTimeout(() => setSearch(current => current.name === input.name && current.rut === input.rut ? current : input), 250);
    return () => clearTimeout(timer);
  }, [expanded, input.name, input.rut, validation]);
  const query = useQuery({ queryKey: ['academic', accountId, 'students', search], queryFn: ({ signal }) => getStudents(search, signal), enabled: expanded && !validation && !waiting, retry: retryAcademicRead });
  const dropStudent = () => { setExpanded(true); onSelect(null); nameInput.current?.focus(); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!validation) setSearch(input);
  };
  const changeRut = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    const position = compactRut(value.slice(0, event.target.selectionStart ?? value.length)).length;
    const formatted = formatRutInput(value);
    let count = 0;
    rutCaret.current = position === 0 ? 0 : formatted.length;
    for (const [index, character] of [...formatted].entries()) {
      if (/[0-9K]/.test(character) && ++count === position) { rutCaret.current = index + 1; break; }
    }
    setRut(formatted); onSelect(null);
  };
  return <section className={`academic-students${expanded ? '' : ' academic-students--collapsed'}`} aria-label="Estudiantes de Nutrición">
    {selected && <div className="academic-students__heading">
      <p className="academic-student-identity"><strong>{selected.name}</strong><span>RUT {selected.rut}</span></p>
      <button ref={switchButton} type="button" className="cenit-button" aria-expanded={expanded} aria-controls="academic-students-search" onClick={() => setExpanded(!expanded)}><MagnifyingGlassIcon size={16} aria-hidden="true" />Cambiar estudiante</button>
      <button type="button" className="cenit-button cenit-button--quiet" onClick={dropStudent}>Ver sólo catálogo</button>
    </div>}
    <div id="academic-students-search" hidden={!expanded}>
    <form className="academic-students__search" onSubmit={submit}>
      <label>Nombre<input className="cenit-input" ref={nameInput} value={name} onChange={e => { setName(e.target.value); onSelect(null); }} maxLength={200} aria-invalid={nameInvalid} aria-describedby={nameInvalid ? 'academic-students-error' : undefined} placeholder="Buscar por nombre" /></label>
      <label>RUT<input className="cenit-input" ref={rutInput} value={rut} onChange={changeRut} maxLength={30} aria-invalid={rutInvalid} aria-describedby={rutInvalid ? 'academic-students-error' : undefined} placeholder="20.123.456-5" autoCapitalize="characters" spellCheck={false} /></label>
      <button type="button" className="cenit-button" onClick={() => { setName(''); setRut(''); onSelect(null); setSearch({ page: 1, pageSize: 6 }); }}>Limpiar</button>
      {selected && <button type="button" className="cenit-button" onClick={() => setExpanded(false)}>Cancelar</button>}
    </form>
    {validation && <p id="academic-students-error" className="academic-students__error" role="alert">{validation}</p>}
    {!validation && (waiting || query.isFetching) && <p role="status">Buscando estudiantes…</p>}
    {!validation && !waiting && query.error && <div className="academic-inline-error"><p role="alert">{query.error.message}</p><button className="cenit-button" onClick={() => { void query.refetch(); }}>Reintentar búsqueda</button></div>}
    {!validation && !waiting && !query.isFetching && !query.error && query.data && <>
      <p className="academic-students__count" role="status">{query.data.totalItems === 0 ? 'No hay estudiantes que coincidan con la búsqueda.' : `${query.data.totalItems} ${query.data.totalItems === 1 ? 'estudiante encontrado' : 'estudiantes encontrados'}${query.data.totalItems > search.pageSize ? ` · Mostrando ${(search.page - 1) * search.pageSize + 1}–${Math.min(search.page * search.pageSize, query.data.totalItems)}` : ''}`}</p>
      <ul className="academic-students__results">{query.data.data.map(student => <li key={student.id}><button type="button" aria-pressed={selected?.id === student.id} onClick={() => { setExpanded(false); onSelect(student); }}><UserIcon size={17} weight={selected?.id === student.id ? 'fill' : 'regular'} aria-hidden="true" /><span><strong>{student.name}</strong><small>{student.rut}</small></span></button></li>)}</ul>
      {query.data.totalItems > search.pageSize && <div className="academic-students__pagination"><button className="cenit-button" disabled={search.page === 1} onClick={() => setSearch({ ...search, page: search.page - 1 })}>Anterior</button><span>Página {search.page} de {Math.ceil(query.data.totalItems / search.pageSize)}</span><button className="cenit-button" disabled={search.page * search.pageSize >= query.data.totalItems} onClick={() => setSearch({ ...search, page: search.page + 1 })}>Siguiente</button></div>}
    </>}
    </div>
  </section>;
}
