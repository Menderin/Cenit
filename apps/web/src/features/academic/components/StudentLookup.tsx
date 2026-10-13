import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MagnifyingGlass, User } from '@phosphor-icons/react';
import { Value } from '@sinclair/typebox/value';
import { StudentSearchSchema, type StudentSearch, type StudentsResponse } from '@cenit/contracts/academic';
import { getStudents, retryAcademicRead } from '../api/academic.js';

export type Student = StudentsResponse['data'][number];
export function StudentLookup({ accountId, selected, onSelect }: { accountId: string; selected: Student | null; onSelect: (student: Student | null) => void }) {
  const [name, setName] = useState('');
  const [rut, setRut] = useState('');
  const [validation, setValidation] = useState('');
  const [expanded, setExpanded] = useState(false);
  const switchButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (selected && !expanded) switchButton.current?.focus(); }, [selected?.id, expanded]);
  const [search, setSearch] = useState<StudentSearch>({ page: 1, pageSize: 20 });
  const query = useQuery({ queryKey: ['academic', accountId, 'students', search], queryFn: ({ signal }) => getStudents(search, signal), enabled: expanded, retry: retryAcademicRead });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const input = { page: 1, pageSize: 20, ...(name.trim() ? { name: name.trim() } : {}), ...(rut.trim() ? { rut: rut.trim() } : {}) };
    if (!Value.Check(StudentSearchSchema, input)) { setValidation('Revisa el nombre y el formato del RUT.'); return; }
    setValidation(''); onSelect(null); setSearch(input);
  };
  return <section className={`academic-students${expanded ? '' : ' academic-students--collapsed'}`} aria-label="Estudiantes de Nutrición">
    <div className="academic-students__heading">
      {selected && <p className="academic-student-identity"><strong>{selected.name}</strong><span>RUT {selected.rut}</span></p>}
      <button ref={switchButton} type="button" className="academic-button" aria-expanded={expanded} aria-controls="academic-students-search" onClick={() => setExpanded(!expanded)}><MagnifyingGlass size={14} aria-hidden="true" />{expanded ? 'Ocultar búsqueda' : selected ? 'Cambiar estudiante' : 'Buscar estudiante'}</button>
      {selected && <button type="button" className="academic-link-button" onClick={() => { onSelect(null); switchButton.current?.focus(); }}>Ver sólo catálogo</button>}
    </div>
    <div id="academic-students-search" hidden={!expanded}>
    <form className="academic-students__search" onSubmit={submit}>
      <label>Nombre<input value={name} onChange={e => setName(e.target.value)} maxLength={200} placeholder="Buscar por nombre" /></label>
      <label>RUT<input value={rut} onChange={e => setRut(e.target.value)} maxLength={30} pattern="[0-9.Kk\-]+" placeholder="00.000.001-k" /></label>
      <button type="submit" className="academic-button"><MagnifyingGlass size={15} aria-hidden="true" />Buscar</button>
      <button type="button" className="academic-button" onClick={() => { setName(''); setRut(''); setValidation(''); onSelect(null); setSearch({ page: 1, pageSize: 20 }); }}>Limpiar</button>
    </form>
    {validation && <p role="alert">{validation}</p>}
    {query.isPending && <p role="status">Buscando estudiantes…</p>}
    {query.error && <div className="academic-inline-error"><p role="alert">{query.error.message}</p><button className="academic-button" onClick={() => { void query.refetch(); }}>Reintentar búsqueda</button></div>}
    {!query.error && query.data && <>
      <p className="academic-students__count" role="status">{query.data.totalItems === 0 ? 'No hay estudiantes que coincidan con la búsqueda.' : `${query.data.totalItems} estudiantes encontrados`}</p>
      <ul className="academic-students__results">{query.data.data.map(student => <li key={student.id}><button type="button" aria-pressed={selected?.id === student.id} onClick={() => { setExpanded(false); onSelect(student); }}><User size={17} weight={selected?.id === student.id ? 'fill' : 'regular'} aria-hidden="true" /><span><strong>{student.name}</strong><small>{student.rut}</small></span></button></li>)}</ul>
      {query.data.totalItems > search.pageSize && <div className="academic-students__pagination"><button className="academic-button" disabled={search.page === 1} onClick={() => { onSelect(null); setSearch({ ...search, page: search.page - 1 }); }}>Anterior</button><span>Página {search.page}</span><button className="academic-button" disabled={search.page * search.pageSize >= query.data.totalItems} onClick={() => { onSelect(null); setSearch({ ...search, page: search.page + 1 }); }}>Siguiente</button></div>}
    </>}
    </div>
  </section>;
}
