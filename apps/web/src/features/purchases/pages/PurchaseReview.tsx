import { useState } from 'react';
import { useNavigate } from 'react-router';
import { usePurchaseTransfer } from '../model/transfer.js';
import { createReviewDraft, validateReviewDraft, validateExtractionResponse, type ExtractionReviewDraft, type ExtractionCandidate, type ContractProblem } from '@cenit/contracts/purchases';
import { extractionExamples, extractionErrorExamples } from '@cenit/contracts/purchases/examples';
import { CandidateField } from '../components/CandidateField.js';
import '../review.css';

const labels: Record<string, string> = {
  requestNumber: 'Nº Documento / solicitud', oracleId: 'ID de Oracle', sender: 'Remitente', recipient: 'Destinatario',
  sentDate: 'Fecha de envío (YYYY-MM-DD)', sentTime: 'Hora de envío (HH:mm:ss)', description: 'Descripción',
  totalAmount: 'Monto total (CLP)', taxAmount: 'Impuesto (CLP)', attachmentReference: 'Referencia textual de anexos',
  provider: 'Proveedor', costCenter: 'Centro de costos', lineUnit: 'Unidad de línea (significado pendiente)', quantity: 'Cantidad',
  price: 'Precio (CLP)', amount: 'Importe (CLP)', chargeAccount: 'Cuenta del cargo completa', universityCode: 'Código universidad',
  campusCode: 'Código sede', unitCode: 'Código unidad', projectCode: 'Código proyecto', accountingCode: 'Código contable',
  document: 'Documento', documentType: 'Tipo documento', bi: 'bi (significado pendiente)', rut: 'RUT (titular pendiente)',
  unitName: 'Nombre de unidad', item: 'ITEM (significado pendiente)', paymentSituation: 'Situación de pago (significado pendiente)',
};
const first = extractionExamples[0];
export function PurchaseReview() {
  const transfer = usePurchaseTransfer(), navigate = useNavigate();
  const [exampleId, setExampleId] = useState<string>(first.id);
  const example = extractionExamples.find(entry => entry.id === exampleId);
  const original = example?.response;
  const [draft, setDraft] = useState<ExtractionReviewDraft>(() => createReviewDraft(first.response));
  const [problems, setProblems] = useState<ContractProblem[]>([]);
  const [checked, setChecked] = useState(false);
  const invalidFixture = original ? validateExtractionResponse(original).length > 0 : false;
  function select(id: string) {
    const next = extractionExamples.find(entry => entry.id === id);
    setExampleId(id); setProblems([]); setChecked(false);
    if (next) setDraft(createReviewDraft(next.response));
    else setDraft({ header: Object.fromEntries(Object.keys(draft.header).map(key => [key, null])), lines: [], administrative: Object.fromEntries(Object.keys(draft.administrative).map(key => [key, null])) } as unknown as ExtractionReviewDraft);
  }
  function edit(group: 'header' | 'administrative' | 'lines', key: string, value: string | null, lineIndex = 0) {
    setDraft(previous => group === 'lines' ? { ...previous, lines: previous.lines.map((line, i) => i === lineIndex ? { ...line, [key]: value } : line) } : { ...previous, [group]: { ...previous[group], [key]: value } });
    setProblems([]); setChecked(false);
  }
  function fields(group: 'header' | 'administrative' | 'lines', candidates: Record<string, ExtractionCandidate>, values: Record<string, string | null>, lineIndex = 0) {
    return <div className="purchase-review__grid">{Object.entries(candidates).map(([key, candidate]) => {
      const path = group === 'lines' ? `/lines/${lineIndex}/${key}` : `/${group}/${key}`;
      return <CandidateField key={key} id={`review-${group}-${lineIndex}-${key}`} label={labels[key] ?? key} candidate={candidate} value={values[key] ?? null} long={key === 'description'} error={problems.find(problem => problem.path === path)?.message} onChange={value => edit(group, key, value, lineIndex)} />;
    })}</div>;
  }
  return <section className="purchase-review">
    <h1>Sistema de compra</h1>
    <h2>Revisión de candidatos de compra</h2>
    <p className="purchase-review__notice">Ejemplos de contrato: no se ha realizado una extracción</p>
    <p>Sin OCR ni carga de imágenes. Puedes transferir explícitamente el borrador al formulario; continuar no guarda datos. Se descarta al salir, expirar la sesión o recargar.</p>
    <label htmlFor="review-example">Ejemplo de contrato</label>
    <select id="review-example" value={exampleId} onChange={event => select(event.target.value)}>
      {extractionExamples.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
      <option value="failure">Fallo de procesamiento</option>
    </select>
    {!original ? <div role="alert"><p>Ejemplo de error: {extractionErrorExamples.find(entry => entry.body.error.code === 'EXTRACTION_NO_DATA')!.body.error.message}</p><p>No se ha procesado ninguna imagen. Selecciona otro ejemplo para continuar.</p></div> : invalidFixture ? <p role="alert">El ejemplo no cumple el contrato. No puede revisarse.</p> : <>
      <p className="purchase-review__metadata">Fuente ficticia: {original.data.input.name}. Todo candidato requiere revisión humana. Fecha sin zona horaria institucional confirmada.</p>
      {original.data.issues.length > 0 && <aside aria-label="Incidencias del ejemplo"><h3>Incidencias de la fuente</h3><ul>{original.data.issues.map((issue, i) => <li key={i}>{issue.path}: {issue.message}</li>)}</ul></aside>}
      <form noValidate onSubmit={event => { event.preventDefault(); setProblems(validateReviewDraft(draft)); setChecked(true); }}>
        <p className="purchase-review__explanation">Cada ítem es un producto o servicio de la misma solicitud. Este ejemplo ficticio tiene dos ítems; no son dos solicitudes distintas.</p>
        <fieldset><legend>Cabecera de la solicitud</legend>{fields('header', original.data.header, draft.header)}</fieldset>
        {original.data.lines.length === 0 && <p>No hay líneas recuperadas en este ejemplo.</p>}
        {original.data.lines.map((line, i) => <fieldset key={i}><legend>Ítem de la solicitud {i + 1}</legend>{fields('lines', line, draft.lines[i]!, i)}</fieldset>)}
        <fieldset><legend>Seguimiento administrativo</legend><p>Campos sin correspondencia confirmada: no se completan automáticamente.</p>{fields('administrative', original.data.administrative, draft.administrative)}</fieldset>
        <div className="purchase-review__actions"><button type="submit">Validar borrador</button><button type="button" onClick={() => select(exampleId)}>Restablecer ejemplo</button></div>
        <button type="button" onClick={() => {
          const errors = validateReviewDraft(draft); setProblems(errors); setChecked(true);
          if (!errors.length && example && !invalidFixture) {
            transfer.put(draft, { type: 'contract_example', exampleId: example.id });
            navigate('/administracion/compras/nueva');
          }
        }}>Continuar al formulario de guardado</button>
        {checked && (problems.length ? <div role="alert"><p>El borrador contiene formatos inválidos.</p><ul>{problems.map((problem, i) => <li key={i}>{problem.path}: {problem.message}</li>)}</ul></div> : <p role="status">Estructura y formatos válidos. Puede haber campos ausentes; esto no acredita extracción suficiente ni habilita un guardado.</p>)}
      </form>
    </>}
  </section>;
}
