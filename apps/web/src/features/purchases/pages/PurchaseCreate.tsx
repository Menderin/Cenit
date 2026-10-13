import { useEffect, useRef, useState } from 'react';
import { Link, useBeforeUnload, useBlocker, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { validateCreatePurchase, type ContractProblem, type ExtractionReviewDraft, type CreatePurchase } from '@cenit/contracts/purchases';
import { createPurchase } from '../api/purchases.js';
import { emptyDraft, emptyLine, purchaseLabels } from '../model/fields.js';
import { usePurchaseTransfer } from '../model/transfer.js';
import '../records.css';

const discardMessage = 'Hay datos sin guardar. Si sales, se descartarán. ¿Quieres salir?';
const required = new Set(['requestNumber', 'sentDate', 'description', 'totalAmount']);
export function PurchaseCreate() {
  const transfer = usePurchaseTransfer();
  const [incoming] = useState(() => transfer.peek());
  const [draft, setDraft] = useState<ExtractionReviewDraft>(() => incoming?.draft ?? emptyDraft());
  const [dirty, setDirty] = useState(!!incoming), [problems, setProblems] = useState<ContractProblem[]>([]);
  const operationId = useRef(incoming?.operationId ?? crypto.randomUUID()), saved = useRef(false);
  useEffect(() => { if (incoming) transfer.consume(incoming.operationId); }, [incoming, transfer]);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const navigate = useNavigate(), client = useQueryClient();
  const blocker = useBlocker(() => dirty && !saved.current);
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm(discardMessage)) blocker.proceed(); else blocker.reset();
    }
  }, [blocker]);
  useBeforeUnload(event => { if (dirty && !saved.current) { event.preventDefault(); event.returnValue = ''; } });
  useEffect(() => {
    const confirmLogout = (event: MouseEvent) => {
      const button = (event.target as Element).closest?.('button[data-session-exit]');
      if (dirty && button && !window.confirm(discardMessage)) { event.preventDefault(); event.stopPropagation(); }
    };
    document.addEventListener('click', confirmLogout, true);
    return () => document.removeEventListener('click', confirmLogout, true);
  }, [dirty]);
  const mutation = useMutation({ mutationFn: createPurchase, onSuccess: result => {
    if (!active.current) return;
    saved.current = true;
    void client.invalidateQueries({ queryKey: ['purchases'] });
    navigate(`/administracion/compras/${result.data.id}`, { replace: true });
  } });
  function edit(group: 'header' | 'administrative' | 'lines', key: string, value: string, index = 0) {
    const next = value === '' ? null : value;
    setDraft(previous => group === 'lines' ? { ...previous, lines: previous.lines.map((line, i) => i === index ? { ...line, [key]: next } : line) } : { ...previous, [group]: { ...previous[group], [key]: next } });
    setDirty(true); setProblems([]); mutation.reset();
  }
  function input(group: 'header' | 'administrative' | 'lines', key: string, value: string | null, index = 0) {
    const id = `manual-${group}-${index}-${key}`, path = group === 'lines' ? `/lines/${index}/${key}` : `/${group}/${key}`;
    const problem = problems.find(entry => entry.path === path), mandatory = group === 'header' && required.has(key);
    const props = { id, value: value ?? '', required: mandatory, disabled: mutation.isPending, 'aria-invalid': !!problem, 'aria-describedby': problem ? `${id}-error` : undefined,
      maxLength: key === 'description' ? 1000 : 255, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => edit(group, key, event.target.value, index) };
    return <div className="purchase-input" key={key}><label htmlFor={id}>{purchaseLabels[key]}{mandatory ? ' *' : ''}{group === 'lines' ? ` · ítem ${index + 1}` : ''}</label>
      {key === 'description' ? <textarea {...props} rows={3} /> : <input {...props} />}
      {problem && <p id={`${id}-error`} className="purchase-field-error">{problem.message}</p>}
    </div>;
  }
  return <section className="purchase-records"><Link to="/administracion/compras">Volver a solicitudes</Link><h1>{incoming ? 'Guardar ejemplo revisado' : 'Agregar solicitud manual'}</h1>
    {incoming && <p className="purchase-origin-notice">Origen: ejemplo ficticio sin extracción real ({incoming.origin.type === 'contract_example' ? incoming.origin.exampleId : ''}). Revisa y completa los campos antes de guardar.</p>}
    <p>Registra una copia en Cenit; no crea una compra en Oracle. Los campos con * son obligatorios.</p>
    <p>El borrador no se guarda automáticamente y se descarta al cerrar o expirar la sesión.</p>
    <form noValidate onSubmit={event => {
      event.preventDefault(); if (mutation.isPending) return;
      const input = { operationId: operationId.current, ...(incoming ? { origin: incoming.origin } : {}), ...draft }, errors = validateCreatePurchase(input);
      setProblems(errors); if (!errors.length) mutation.mutate(input as CreatePurchase);
    }}>
      <fieldset><legend>Cabecera de la solicitud</legend><div className="purchase-input-grid">{Object.entries(draft.header).map(([key, value]) => input('header', key, value))}</div></fieldset>
      <fieldset><legend>Ítems de la solicitud</legend><p>Todos pertenecen a esta solicitud. Puedes agregar hasta 100; no es obligatorio añadirlos. Desplaza la tabla para ver todos sus campos.</p>
        {!draft.lines.length ? <p>No hay ítems añadidos.</p> : <div className="purchase-table-scroll" tabIndex={0} role="region" aria-label="Editar ítems de la solicitud"><table><thead><tr><th scope="col">Ítem</th>{Object.keys(emptyLine()).map(key => <th scope="col" key={key}>{purchaseLabels[key]}</th>)}<th scope="col">Acciones</th></tr></thead><tbody>{draft.lines.map((line, index) => <tr key={index}><th scope="row">{index + 1}</th>{Object.entries(line).map(([key, value]) => <td key={key}>{input('lines', key, value, index)}</td>)}<td><button type="button" disabled={mutation.isPending} onClick={() => { setDraft(previous => ({ ...previous, lines: previous.lines.filter((_, i) => i !== index) })); setDirty(true); setProblems([]); }}>Eliminar ítem {index + 1}</button></td></tr>)}</tbody></table></div>}
        <button type="button" disabled={draft.lines.length >= 100 || mutation.isPending} onClick={() => { setDraft(previous => ({ ...previous, lines: [...previous.lines, emptyLine()] })); setDirty(true); }}>Agregar ítem</button>
      </fieldset>
      <fieldset><legend>Seguimiento administrativo</legend><p>Los campos de significado pendiente se conservan como texto; no se deducen estados de pago o aprobación.</p><div className="purchase-input-grid">{Object.entries(draft.administrative).map(([key, value]) => input('administrative', key, value))}</div></fieldset>
      {problems.length > 0 && <div role="alert"><p>Revisa los campos antes de guardar.</p><ul>{problems.map((problem, index) => <li key={index}>{problem.path}: {problem.message}</li>)}</ul></div>}
      {mutation.isError && <p role="alert">{mutation.error.message} El formulario conserva tus datos.</p>}
      <button className="purchase-save" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Guardando…' : 'Guardar solicitud'}</button>
    </form>
  </section>;
}
