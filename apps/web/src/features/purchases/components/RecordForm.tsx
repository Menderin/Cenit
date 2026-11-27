import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { InfoIcon } from '@phosphor-icons/react/dist/csr/Info';
import { isValidRut } from '@cenit/contracts';
import {
  AREAS, DOCUMENT_TYPES, FAMED_ACCOUNTS, PAYMENT_SITUATIONS, areaFrom, biFromText, documentTypeFrom, formatRut, itemFromAccount, lineFieldLabels, normalizeRut,
  rutFromDescription, splitChargeAccount, type CaptureDateSource, type ContractProblem, type ExtractionResponse, type PurchaseDraft, type RecordSources,
} from '@cenit/contracts/purchases';
import { DateField } from '../../../shared/components/DateField.js';
import { findProviders, listPurchases } from '../api/purchases.js';
import { useCatalogOptions } from '../model/catalog.js';
import { amountLabel, captureSourcePath, dateLabel, groupThousands, hasRegion, normalizeAmountInput, oracleLabels, purchaseProblemLabel, recordLabels } from '../model/fields.js';
import { Combobox, type ComboOption } from './Combobox.js';

type Key = keyof PurchaseDraft['record'];
type Span = 1 | 1.5 | 2 | 3 | 4;
const required = new Set<Key>(['recordDate', 'requestNumber', 'description', 'totalAmount', 'document']);
const plain = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es').trim();
const items = [...new Set(FAMED_ACCOUNTS.map(account => account.item))].map(value => ({ value }));
const dateHints = { filename: 'Del nombre del archivo', modified: 'De la última modificación del archivo', today: 'Fecha de hoy' };

/**
 * La fila del Registro de gastos muestra de dónde salen los datos sugeridos o leídos.
 */
export function RecordForm({ draft, sources = {}, dateSource, onChange, problems, disabled = false, extraction = null, activePath, onLocate, heading, note, purchaseId }: {
  draft: PurchaseDraft; sources?: RecordSources; onChange: (draft: PurchaseDraft, sources: RecordSources) => void; problems: ContractProblem[];
  dateSource?: CaptureDateSource;
  disabled?: boolean; extraction?: ExtractionResponse | null; activePath?: string; onLocate?: (path: string) => void; heading: ReactNode; note?: ReactNode;
  /** Al editar, la compra misma no cuenta como repetida. */
  purchaseId?: string;
}) {
  const form = useRef<HTMLDivElement>(null), errorSummary = useRef<HTMLHeadingElement>(null);
  const record = draft.record;
  const errors = [...new Map(problems.map(problem => [problem.path, problem])).values()].map(problem => {
    const [, section, key] = problem.path.split('/');
    const editable = (section === 'record' && key && key in record && key !== 'paymentSituation') || (section === 'oracle' && key && key in draft.oracle);
    return { ...problem, id: editable ? `purchase-${section}-${key}` : null };
  });
  const showErrorSummary = errors.length > 1 || (errors.length === 1 && !errors[0]?.id);
  const { unitOptions, projectOptions, accountOptions, unitName, projectName, accountName } = useCatalogOptions(record.unitCode);
  // Proveedores ya registrados: su RUT y los códigos de su última compra se ofrecen para no volver a escribirlos.
  const [providerQuery, setProviderQuery] = useState(record.provider ?? '');
  useEffect(() => { const timer = window.setTimeout(() => setProviderQuery(record.provider ?? ''), 300); return () => window.clearTimeout(timer); }, [record.provider]);
  const providers = useQuery({ queryKey: ['purchases', 'providers', plain(providerQuery)], queryFn: ({ signal }) => findProviders(providerQuery.trim(), signal),
    enabled: providerQuery.trim().length >= 2, staleTime: 60_000 });
  const known = providers.data?.data.find(item => plain(item.provider) === plain(record.provider ?? ''));
  // Al subir varias capturas es fácil repetir una: se avisa si el Nº Documento ya está en el registro, sin impedir guardar.
  const [numberQuery, setNumberQuery] = useState(record.requestNumber?.trim() ?? '');
  useEffect(() => { const timer = window.setTimeout(() => setNumberQuery(record.requestNumber?.trim() ?? ''), 300); return () => window.clearTimeout(timer); }, [record.requestNumber]);
  const sameNumber = useQuery({ queryKey: ['purchases', 'same-number', numberQuery], queryFn: ({ signal }) => listPurchases(1, signal, { q: numberQuery }, { pageSize: 20 }),
    enabled: numberQuery.length >= 4, staleTime: 30_000 });
  const repeated = numberQuery === record.requestNumber?.trim() ? sameNumber.data?.data.find(item => item.requestNumber === numberQuery && item.id !== purchaseId) : undefined;

  function update(changes: Partial<PurchaseDraft['record']>, suggested: Partial<PurchaseDraft['record']> = {}, rutFromPurchase?: string) {
    const nextSources: RecordSources = { ...sources };
    for (const key of Object.keys(changes) as Key[]) delete nextSources[key];
    if ('rut' in changes) delete nextSources.rutFromPurchase;
    const next = { ...record, ...changes };
    // Lo que Cenit propone sólo llena campos vacíos o que seguían siendo una sugerencia; nunca pisa lo escrito.
    for (const [key, value] of Object.entries(suggested) as [Key, string | null][]) {
      if (value && (!next[key] || nextSources[key] === 'suggested')) {
        next[key] = value;
        nextSources[key] = 'suggested';
        if (key === 'rut') nextSources.rutFromPurchase = rutFromPurchase;
      }
    }
    onChange({ ...draft, record: next }, nextSources);
  }
  function describe(description: string | null) {
    const type = documentTypeFrom(description, draft.oracle.attachmentReference);
    return { rut: rutFromDescription(description), documentType: type, bi: biFromText(description, draft.oracle.attachmentReference) ?? (type === 'COTIZACIÓN' ? 'S/N' : null), area: areaFrom(description) };
  }
  // Sólo al reconocer un proveedor: si la fila no trae RUT, se propone el último que se usó con él.
  useEffect(() => {
    if (known?.rut && !record.rut) update({}, { rut: known.rut }, known.requestNumber);
  }, [known?.provider, known?.rut]);
  useEffect(() => {
    if (!problems.length) return;
    const fields = form.current?.querySelectorAll<HTMLElement>('[aria-invalid="true"]');
    fields?.forEach(field => { const section = field.closest('details'); if (section) section.open = true; });
    (errorSummary.current ?? fields?.[0])?.focus();
  }, [problems]);

  const problem = (key: string) => problems.find(item => item.path === `/record/${key}`)?.message;
  // Debajo de cada campo: de dónde sacó Cenit lo que sugiere (en azul), qué falta (en ámbar) o el nombre de un código del catálogo.
  const hint = (key: Key): { text: string; tone?: 'suggested' } | null => {
    const suggested = (text: string) => ({ text, tone: 'suggested' as const });
    if (sources[key] === 'suggested') {
      if (key === 'recordDate' && dateSource) return suggested(dateHints[dateSource]);
      if (key === 'rut') return suggested(sources.rutFromPurchase ? `De la compra ${sources.rutFromPurchase}` : 'Del texto de la solicitud');
      if (key === 'bi') return suggested(record.bi === 'S/N' ? 'Sin boleta detectada' : 'Del DETALLE o el anexo');
      if (key === 'documentType') return suggested('Del DETALLE o el anexo');
      if (key === 'area') return suggested('Sugerido por Cenit');
      if (key === 'item') return suggested('Del Código Contable');
    }
    if (key === 'rut' && !record.rut && extraction) return { text: 'No viene en la captura. Es opcional.' };
    const name = key === 'unitCode' ? unitName(record.unitCode) : key === 'projectCode' ? projectName(record.projectCode) : key === 'accountingCode' ? accountName(record.accountingCode) : null;
    if (sources[key] === 'read') return { text: name ? `De la captura · ${name}` : 'De la captura' };
    return name ? { text: name } : null;
  };
  // `span` en sextos del ancho (la grilla tiene doce columnas): 1.5 deja lugar al segmentado y a «SISTEMA DE COMPRAS».
  function cell(key: Key, control: (props: Record<string, unknown>) => ReactNode, span: Span = 1, extra?: ReactNode) {
    const id = `purchase-record-${key}`, error = problem(key), text = hint(key);
    const missing = !record[key] && required.has(key);
    const sourcePath = captureSourcePath[key];
    const located = !!onLocate && hasRegion(extraction, sourcePath);
    const props = { id, disabled, 'aria-required': required.has(key) || undefined, 'aria-invalid': !!error, 'aria-describedby': [text ? `${id}-hint` : '', error ? `${id}-error` : '', extra ? `${id}-note` : ''].filter(Boolean).join(' ') || undefined,
      onFocus: () => onLocate?.(located ? sourcePath! : ''), className: 'cenit-input' };
    return <div className={`purchase-cell purchase-cell--span${span === 1.5 ? '1h' : span}${located && activePath === sourcePath ? ' purchase-cell--active' : ''}`} data-field={key} data-mark={missing ? 'missing' : undefined}>
      <label htmlFor={id} className="purchase-cell__label">{recordLabels[key]}{required.has(key) ? ' *' : ''}
      </label>
      {control(props)}
      {text && <span id={`${id}-hint`} className={`purchase-cell__hint${text.tone ? ` purchase-cell__hint--${text.tone}` : ''}`} title={text.tone === 'suggested' ? `Sugerido por Cenit: ${text.text.toLocaleLowerCase('es')}` : text.text}>{text.text}</span>}
      {error && <span id={`${id}-error`} className="purchase-cell__error">{error}</span>}
      {extra && <span id={`${id}-note`} className="purchase-cell__note">{extra}</span>}
    </div>;
  }
  const text = (key: Key, span: Span = 1) => cell(key, props => <input {...props} type="text" maxLength={255} value={record[key] ?? ''} onChange={event => update({ [key]: event.target.value || null })} />, span);
  const combo = (key: Key, options: ComboOption[], span: Span = 1, after?: (value: string | null) => Partial<PurchaseDraft['record']>) => cell(key, props =>
    <Combobox {...props} aria-label={recordLabels[key]} value={record[key] ?? ''} options={options} maxLength={255}
      onValueChange={value => update({ [key]: value || null }, after?.(value || null))} />, span);
  // Pegar (o escribir) la cuenta completa «01.02.270101.00000000.410103» en cualquiera de los tres códigos la separa.
  const code = (key: 'unitCode' | 'projectCode' | 'accountingCode', options: ComboOption[], span: Span) => cell(key, props =>
    <Combobox {...props} aria-label={recordLabels[key]} value={record[key] ?? ''} options={options} maxLength={255}
      onValueChange={value => {
        const parts = splitChargeAccount(value);
        if (parts) update({ unitCode: parts.unitCode, projectCode: parts.projectCode, accountingCode: parts.accountingCode }, { item: itemFromAccount(parts.accountingCode) });
        else update({ [key]: value || null }, key === 'accountingCode' ? { item: itemFromAccount(value || null) } : {});
      }} />, span);
  const readAccount = extraction ? draft.lines[0]?.chargeAccount ?? null : null;
  const rutWarning = record.rut && /^[1-9]\d{0,8}-[0-9K]$/.test(record.rut) && !isValidRut(record.rut);

  return <div ref={form} className="purchase-record-form">
    {showErrorSummary && <section className="purchase-form-errors" aria-labelledby="purchase-form-errors-title">
      <h2 id="purchase-form-errors-title" ref={errorSummary} tabIndex={-1}>Revisa los datos de la compra</h2>
      <ul>{errors.map(({ path, id, message }) => <li key={path}>{id ? <a href={`#${id}`} onClick={event => {
        event.preventDefault();
        document.getElementById(id)?.focus();
      }}>{purchaseProblemLabel(path)}. {message}</a> : <>{purchaseProblemLabel(path)}. {message}</>}</li>)}</ul>
    </section>}
    <section className="purchase-row-card" aria-labelledby="purchase-row-title">
      <div className="purchase-row-card__heading">
        <h2 id="purchase-row-title">{heading}</h2>
      </div>
      <div className="purchase-row-grid purchase-row-grid--register">
        {cell('recordDate', props => <DateField {...props} label={recordLabels.recordDate!} value={record.recordDate ?? ''} onValueChange={value => update({ recordDate: value || null })} />)}
        {cell('requestNumber', props => <input {...props} type="text" maxLength={255} value={record.requestNumber ?? ''} onChange={event => update({ requestNumber: event.target.value || null })} />, 1,
          repeated ? <span className="purchase-cell__warning">Ya registrada el {dateLabel(repeated.recordDate)}. ¿Es la misma?</span> : undefined)}
        {cell('provider', props => <input {...props} type="text" maxLength={255} value={record.provider ?? ''} list="purchase-provider-options"
          onChange={event => update({ provider: event.target.value || null })} />, 2)}
        <datalist id="purchase-provider-options">{providers.data?.data.map(item => <option key={item.provider} value={item.provider} />)}</datalist>
        {cell('rut', props => <input {...props} type="text" maxLength={12} inputMode="text" placeholder="12.345.678-9" value={record.rut ? formatRut(record.rut) : ''}
          onChange={event => update({ rut: event.target.value || null })} onBlur={event => { const next = normalizeRut(event.target.value); if (next !== (record.rut ?? '')) update({ rut: next || null }); }} />, 1,
          rutWarning ? <span className="purchase-cell__warning">El dígito verificador no cuadra; revísalo.</span> : undefined)}
        {cell('totalAmount', props => <input {...props} type="text" inputMode="numeric" className="cenit-input purchase-cell__amount" maxLength={341}
          value={record.totalAmount && /^\d+$/.test(record.totalAmount) ? groupThousands(record.totalAmount) : record.totalAmount ?? ''}
          onChange={event => { const typed = /^[\d.]+$/.test(event.target.value) ? event.target.value.replace(/\./g, '') : event.target.value; update({ totalAmount: typed || null }); }}
          onBlur={event => { const next = normalizeAmountInput(event.target.value); if (next !== event.target.value && next !== record.totalAmount) update({ totalAmount: next || null }); }} />)}

        {cell('description', props => <textarea {...props} rows={2} maxLength={1000} value={record.description ?? ''}
          onChange={event => update({ description: event.target.value || null }, describe(event.target.value || null))} />, 4)}
        {combo('documentType', DOCUMENT_TYPES.map(value => ({ value })))}
        {text('bi')}

        {known && (known.unitCode || known.projectCode || known.accountingCode) && (known.unitCode !== record.unitCode || known.projectCode !== record.projectCode || known.accountingCode !== record.accountingCode) &&
          <div className="purchase-row-callout" role="status">
            <InfoIcon size={18} aria-hidden="true" />
            <span>La última compra a este proveedor ({known.requestNumber}, {dateLabel(known.recordDate)}) se cargó a <strong>{[known.unitCode, known.projectCode, known.accountingCode].map(code => code ?? '—').join(' · ')}</strong>.</span>
            <button type="button" className="cenit-button" disabled={disabled} onClick={() => update({ unitCode: known.unitCode, projectCode: known.projectCode, accountingCode: known.accountingCode }, { item: itemFromAccount(known.accountingCode) })}>Usar los mismos códigos</button>
          </div>}
        <fieldset className="purchase-account">
          <legend>Cuenta de cargo{readAccount ? <span className="purchase-account__read" title="Leída de la captura">{readAccount}</span>
            : <span className="purchase-account__tip">Puedes pegar la cuenta completa en cualquiera de los tres</span>}</legend>
          <div className="purchase-row-grid">
            {code('unitCode', unitOptions, 1.5)}
            {code('projectCode', projectOptions, 3)}
            {code('accountingCode', accountOptions, 1.5)}
          </div>
        </fieldset>

        {combo('area', AREAS.map(value => ({ value })), 2)}
        {combo('item', items)}
        {cell('paymentSituation', () => <div className="purchase-segmented" role="group" aria-label={recordLabels.paymentSituation}>
          {PAYMENT_SITUATIONS.map(value => <button key={value} type="button" disabled={disabled} aria-pressed={record.paymentSituation === value} data-tone={value === 'PAGADO' ? 'paid' : 'pending'}
            onClick={() => update({ paymentSituation: value })}>{value === 'PAGADO' ? 'Pagado' : 'Pendiente'}</button>)}
        </div>, 1.5)}
        {text('document', 1.5)}
      </div>
      {note && <p className="purchase-row-card__note">{note}</p>}
    </section>

    <details className="purchase-oracle">
      <summary><CaretRightIcon className="purchase-chevron" size={14} aria-hidden="true" />Datos de Oracle<span>Fecha de envío, ID, Desde, A, impuesto, anexos{draft.lines.length ? ` y ${draft.lines.length} ${draft.lines.length === 1 ? 'línea' : 'líneas'}` : ''}</span></summary>
      <div className="purchase-oracle__body">
        <div className="purchase-row-grid">
          {(Object.keys(draft.oracle) as (keyof PurchaseDraft['oracle'])[]).map(key => {
            const id = `purchase-oracle-${key}`, error = problems.find(item => item.path === `/oracle/${key}`)?.message, value = draft.oracle[key];
            const set = (next: string | null) => onChange({ ...draft, oracle: { ...draft.oracle, [key]: next } }, sources);
            return <div key={key} className={`purchase-cell purchase-cell--span${key === 'attachmentReference' ? 2 : 1}`}>
              <label htmlFor={id} className="purchase-cell__label">{oracleLabels[key]}</label>
              {key === 'sentDate' ? <DateField id={id} label={oracleLabels[key]!} disabled={disabled} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} value={value ?? ''} onValueChange={next => set(next || null)} />
                : <input id={id} className="cenit-input" type={key === 'sentTime' ? 'time' : 'text'} step={key === 'sentTime' ? 1 : undefined} disabled={disabled} maxLength={255} aria-invalid={!!error}
                  aria-describedby={error ? `${id}-error` : undefined} inputMode={key === 'taxAmount' ? 'numeric' : undefined} value={value ?? ''} onChange={event => set(event.target.value || null)} />}
              {error && <span id={`${id}-error`} className="purchase-cell__error">{error}</span>}
            </div>;
          })}
        </div>
        {draft.lines.length > 0 && <div className="purchase-oracle__lines" role="region" aria-label="Líneas de la solicitud en Oracle" tabIndex={0}>
          <table><thead><tr><th scope="col">#</th>{(['description', 'provider', 'chargeAccount', 'amount'] as const).map(key => <th key={key} scope="col">{lineFieldLabels[key]}</th>)}</tr></thead>
            <tbody>{draft.lines.map((line, index) => <tr key={index}><td>{index + 1}</td><td>{line.description ?? '—'}</td><td>{line.provider ?? '—'}</td><td>{line.chargeAccount ?? '—'}</td><td className="purchase-money">{amountLabel(line.amount)}</td></tr>)}</tbody>
          </table></div>}
      </div>
    </details>
  </div>;
}
