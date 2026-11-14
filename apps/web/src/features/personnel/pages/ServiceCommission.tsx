import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { EyeIcon } from '@phosphor-icons/react/dist/csr/Eye';
import { TrashIcon } from '@phosphor-icons/react/dist/csr/Trash';
import { MapPinIcon } from '@phosphor-icons/react/dist/csr/MapPin';
import { GlobeHemisphereWestIcon } from '@phosphor-icons/react/dist/csr/GlobeHemisphereWest';
import { DateField } from '../../../shared/components/DateField.js';
import { ContextualConfirm } from '../../../shared/components/ContextualConfirm.js';
import { displayDate } from '../../../shared/lib/dates.js';
import { useGuardChanges } from '../../purchases/model/guard.js';
import { StaffSearch } from '../components/StaffSearch.js';
import { CommissionDocument } from '../components/CommissionDocument.js';
import { personnelForm } from '../components/FormControls.js';
import { PdfActions, usePersonnelPdf } from '../components/PdfOutput.js';
import { DocumentPreview, ReviewSection, StepNav } from '../components/PersonnelLayout.js';
import { units } from '../model/staff.js';
import { requestCommissionPdf } from '../api/commission.js';
import { categoryLabels, emptyCommission, fileName, plantLabels, stepFields, steps, validateStep, type CommissionDraft, type Errors, type Step } from '../model/commission.js';
import '../personnel.css';

const { fieldId, Field, Choice } = personnelForm('commission');
const formSteps = ['funcionario', 'comision', 'financiamiento', 'actividad'] as const;

export function ServiceCommission() {
  const [draft, setDraft] = useState(emptyCommission);
  const [step, setStep] = useState<Step>('funcionario');
  const [errors, setErrors] = useState<Errors>({});
  const serverErrors = useRef<Errors>({});
  const [tried, setTried] = useState<Partial<Record<Step, boolean>>>({});
  const [focusKey, setFocusKey] = useState<{ key: string } | null>(null);
  const [preview, setPreview] = useState(false);
  const [discardOrigin, setDiscardOrigin] = useState<HTMLElement | null>(null);
  const pdf = usePersonnelPdf({
    request: signal => requestCommissionPdf(draft, signal), fileName: () => fileName(draft), printTitle: 'Imprimir comisión de servicios',
    onFieldErrors: fields => {
      const target = formSteps.find(item => stepFields[item].some(key => fields[key]));
      if (!target) return false;
      serverErrors.current = { ...fields };
      setErrors(fields); setTried(current => ({ ...current, [target]: true }));
      go(target); setFocusKey({ key: stepFields[target].find(key => fields[key])! });
      return true;
    },
  });
  const dirty = JSON.stringify(draft) !== JSON.stringify(emptyCommission());
  const { abort: abortPdf, setMessage: setPdfMessage } = pdf;
  const reset = useCallback(() => { abortPdf(); serverErrors.current = {}; setDraft(emptyCommission()); setStep('funcionario'); setErrors({}); setTried({}); setPreview(false); setPdfMessage(''); }, [abortPdf, setPdfMessage]);
  useGuardChanges(dirty, false, reset);

  useEffect(() => { if (focusKey) document.getElementById(fieldId(focusKey.key))?.focus(); }, [focusKey]);

  function update(patch: Partial<CommissionDraft>) {
    if (pdf.busy.current) {
      pdf.abort();
      pdf.setMessage('Se canceló la preparación porque cambiaste el formulario.');
    } else pdf.setMessage('');
    const next = { ...draft, ...patch };
    for (const key of Object.keys(patch)) {
      if (key === 'funding') {
        next.funding.forEach((row, index) => {
          for (const field of Object.keys(row) as (keyof typeof row)[]) {
            if (row[field] !== draft.funding[index]![field]) delete serverErrors.current[`funding.${index}.${field}`];
          }
        });
      } else if (draft[key as keyof CommissionDraft] !== next[key as keyof CommissionDraft]) delete serverErrors.current[key];
    }
    if (!next.allowance.trim()) delete serverErrors.current.currency;
    if (!Object.values(next.funding[1]).some(value => value.trim())) {
      for (const key of Object.keys(serverErrors.current)) if (key.startsWith('funding.1.')) delete serverErrors.current[key];
    }
    if (patch.from !== undefined && patch.from !== draft.from) delete serverErrors.current.to;
    if (next.category !== 'otro') delete serverErrors.current.categoryOther;
    if (next.activity === 'evento') delete serverErrors.current.description;
    else for (const key of ['eventName', 'eventOrganizer', 'eventProject', 'eventWork', 'eventNotes']) delete serverErrors.current[key];
    setDraft(next);
    if (step !== 'revision') setErrors(current => {
      const kept = Object.fromEntries(Object.entries(current).filter(([key]) => !stepFields[step].includes(key)));
      const remaining = Object.fromEntries(Object.entries(serverErrors.current).filter(([key]) => stepFields[step].includes(key)));
      return { ...kept, ...remaining, ...(tried[step] ? validateStep(next, step) : {}) };
    });
  }
  const setFunding = (row: number, key: keyof CommissionDraft['funding'][number], value: string) =>
    update({ funding: draft.funding.map((item, index) => index === row ? { ...item, [key]: value } : item) as CommissionDraft['funding'] });

  function go(next: Step) { setStep(next); setPreview(false); document.getElementById('admin-content')?.scrollTo({ top: 0 }); }
  function check(target: Exclude<Step, 'revision'>) {
    const remaining = Object.fromEntries(Object.entries(serverErrors.current).filter(([key]) => stepFields[target].includes(key)));
    const found = { ...remaining, ...validateStep(draft, target) };
    setErrors(current => ({ ...Object.fromEntries(Object.entries(current).filter(([key]) => !stepFields[target].includes(key))), ...found }));
    setTried(current => ({ ...current, [target]: true }));
    return stepFields[target].find(key => found[key]);
  }
  function next() {
    if (step === 'revision') return;
    const invalid = check(step);
    if (invalid) { setFocusKey({ key: invalid }); return; }
    go(steps[steps.findIndex(item => item.key === step) + 1]!.key);
  }
  async function preparePdf(action: 'download' | 'print') {
    if (pdf.busy.current) return;
    for (const target of formSteps) {
      const invalid = check(target);
      if (invalid) { go(target); setFocusKey({ key: invalid }); return; }
    }
    await pdf.run(action);
  }

  const index = steps.findIndex(item => item.key === step), current = steps[index]!;
  const stepErrors = (target: Step) => target === 'revision' ? 0 : stepFields[target].filter(key => errors[key]).length;
  const complete = (target: Step) => target !== 'revision' && !Object.keys(validateStep(draft, target)).length;
  const known = (value: string) => value.trim() ? value : undefined;
  const funding = (row: CommissionDraft['funding'][number]) => Object.values(row).some(value => value.trim())
    ? `${[row.institution, row.organization, row.unit, row.project].map(value => value || '—').join(' · ')} · ${row.percent || '—'} %` : undefined;
  const event = draft.activity === 'evento';
  const review: { step: Step; title: string; rows: [string, string | undefined][] }[] = [
    { step: 'funcionario', title: 'Funcionario', rows: [['Nombre completo', known(draft.name)], ['Cargo', known(draft.position)], ['Unidad o dependencia', known(draft.unit)], ['Grupo', draft.group || undefined],
      ['Estamento', draft.category === 'otro' ? `Otro: ${draft.categoryOther}` : draft.category ? categoryLabels[draft.category] : undefined], ['Planta', draft.plant ? plantLabels[draft.plant] : undefined]] },
    { step: 'comision', title: 'Comisión', rows: [['Lugar', draft.territory ? `${draft.territory === 'nacional' ? 'Territorio nacional' : 'Extranjero'}${draft.place ? ` · ${draft.place}` : ''}` : undefined],
      ['Fechas', draft.from && draft.to ? `${displayDate(draft.from)} al ${displayDate(draft.to)}` : undefined], ['Días con pernoctación', known(draft.daysWithStay)], ['Días sin pernoctación', known(draft.daysWithoutStay)],
      ['Total de días', known(draft.totalDays)], ['Viático', draft.allowance.trim() ? `${draft.allowance} ${draft.currency}` : undefined]] },
    { step: 'financiamiento', title: 'Financiamiento', rows: [['Fuente 1', funding(draft.funding[0])], ['Fuente 2', funding(draft.funding[1])]] },
    { step: 'actividad', title: 'Actividad', rows: event ? [['Evento', known(draft.eventName)], ['Institución organizadora', known(draft.eventOrganizer)], ['Trabajo o ponencia', known(draft.eventWork)], ['Proyecto asociado', known(draft.eventProject)], ['Otros antecedentes', known(draft.eventNotes)]]
      : [['Descripción', known(draft.description)]] },
  ];

  const pdfActions = <PdfActions pdf={{ ...pdf, run: preparePdf }} />;

  return <section className="personnel-page">
    <div className="personnel-heading">
      <div><h1>Nueva comisión de servicios</h1><p>Propuesta pendiente de validación. Usa sólo datos ficticios; la búsqueda muestra funcionarios de ejemplo.</p></div>
      <div className="personnel-heading__actions">
        {!preview && step !== 'revision' && <button type="button" className="cenit-button" onClick={() => setPreview(true)}><EyeIcon size={16} aria-hidden="true" />Vista previa</button>}
        <button type="button" className="cenit-button cenit-button--quiet" disabled={!dirty} onClick={event => setDiscardOrigin(event.currentTarget)}><TrashIcon size={16} aria-hidden="true" />Descartar</button>
      </div>
    </div>
    <ContextualConfirm open={!!discardOrigin} origin={discardOrigin} title="¿Descartar esta comisión?" description="Se borrarán todos los datos ingresados."
      confirmLabel="Descartar" destructive onCancel={() => setDiscardOrigin(null)} onConfirm={() => { setDiscardOrigin(null); reset(); }} />

    {pdf.message && <p role="alert" className="personnel-print-error">{pdf.message}</p>}
    {preview ? <DocumentPreview onClose={() => setPreview(false)} actions={pdfActions}><CommissionDocument draft={draft} /></DocumentPreview>
    : <div className="personnel-layout">
      <StepNav steps={steps} current={step} errors={stepErrors} complete={complete} onGo={go} />

      <div className="personnel-card">
        <div className="personnel-card__head"><h2>{current.label}</h2><p>{current.intro}</p></div>

        {step === 'funcionario' && <div className="personnel-group">
          <StaffSearch id={fieldId('name')} value={draft.name} error={errors.name} onChange={name => update({ name })}
            onPick={person => update({ name: person.name, position: person.position, unit: person.unit, plant: person.plant, category: person.category, categoryOther: '' })} />
          <div className="personnel-group">
            <Field name="position" label="Cargo" value={draft.position} error={errors.position} onChange={position => update({ position })} />
            <Field name="unit" label="Unidad o dependencia" value={draft.unit} error={errors.unit} list="commission-units" onChange={unit => update({ unit })} />
            <datalist id="commission-units">{units.map(unit => <option key={unit} value={unit} />)}</datalist>
          </div>
          <Choice name="group" legend="Grupo" value={draft.group} error={errors.group} onChange={group => update({ group })}
            options={(['I', 'II', 'III'] as const).map(value => ({ value, label: value }))} />
          <Choice name="category" legend="Estamento" value={draft.category} error={errors.category} onChange={category => update({ category })}
            options={(Object.keys(categoryLabels) as (keyof typeof categoryLabels)[]).map(value => ({ value, label: categoryLabels[value] }))} />
          {draft.category === 'otro' && <Field name="categoryOther" label="Especifica el estamento" value={draft.categoryOther} error={errors.categoryOther} onChange={categoryOther => update({ categoryOther })} />}
          <Choice name="plant" legend="Planta" value={draft.plant} error={errors.plant} onChange={plant => update({ plant })}
            options={[{ value: 'oficial', label: 'Oficial' }, { value: 'especial', label: 'Especial' }, { value: 'temporal', label: 'Temporal' }]} />
        </div>}

        {step === 'comision' && <div className="personnel-group">
          <Choice name="territory" legend="Lugar de realización" value={draft.territory} error={errors.territory} onChange={territory => update({ territory })}
            options={[{ value: 'nacional', label: <><MapPinIcon size={15} aria-hidden="true" />Territorio nacional</> }, { value: 'extranjero', label: <><GlobeHemisphereWestIcon size={15} aria-hidden="true" />Extranjero</> }]} />
          <Field name="place" label={draft.territory === 'extranjero' ? 'Ciudad y país' : 'Lugar'} value={draft.place} error={errors.place}
            placeholder={draft.territory === 'extranjero' ? 'Ej.: Lima, Perú' : 'Ej.: Santiago'} onChange={place => update({ place })} />
          <div className="personnel-grid">
            {(['from', 'to'] as const).map(key => <div className="personnel-field" key={key}>
              <label htmlFor={fieldId(key)}>{key === 'from' ? 'Desde' : 'Hasta'}</label>
              <DateField id={fieldId(key)} label={key === 'from' ? 'Desde' : 'Hasta'} value={draft[key]} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${fieldId(key)}-error` : undefined} onValueChange={value => update({ [key]: value })} />
              {errors[key] && <p className="personnel-error" id={`${fieldId(key)}-error`}>{errors[key]}</p>}
            </div>)}
          </div>
          <div className="personnel-grid personnel-grid--three">
            <Field name="daysWithStay" label="Días con pernoctación" optional inputMode="numeric" value={draft.daysWithStay} error={errors.daysWithStay} onChange={daysWithStay => update({ daysWithStay })} />
            <Field name="daysWithoutStay" label="Días sin pernoctación" optional inputMode="numeric" value={draft.daysWithoutStay} error={errors.daysWithoutStay} onChange={daysWithoutStay => update({ daysWithoutStay })} />
            <Field name="totalDays" label="Total de días" value={draft.totalDays} error={errors.totalDays} onChange={totalDays => update({ totalDays })} />
          </div>
          <div className="personnel-grid">
            <Field name="allowance" label="Importe del viático" optional inputMode="decimal" placeholder="Ej.: 186.000" value={draft.allowance} error={errors.allowance} onChange={allowance => update({ allowance })} />
            <Choice name="currency" legend="Moneda" value={draft.currency} error={errors.currency} onChange={currency => update({ currency })}
              options={[{ value: 'CLP', label: 'CLP' }, { value: 'USD', label: 'USD' }]} />
          </div>
        </div>}

        {step === 'financiamiento' && <><p className="personnel-hint">Sólo números. Cada fuente indica el porcentaje que financia (hasta 100 %); la Fuente 2 es opcional, pero si la usas debes completar todos sus campos.</p>
        <div className="personnel-funding__scroll" role="region" aria-label="Código presupuestario"><table className="personnel-funding">
          <caption className="personnel-sr">Código presupuestario</caption>
          <thead><tr><th scope="col"><span className="personnel-sr">Fuente</span></th><th scope="col">Institución</th><th scope="col">Organización</th><th scope="col">Unidad</th><th scope="col">Proyecto</th><th scope="col">% financ.</th></tr></thead>
          <tbody>{draft.funding.map((row, rowIndex) => <tr key={rowIndex}>
            <th scope="row">{rowIndex === 0 ? 'Fuente 1' : <>Fuente 2<small>Opcional</small></>}</th>
            {(['institution', 'organization', 'unit', 'project', 'percent'] as const).map(key => {
              const path = `funding.${rowIndex}.${key}`, id = fieldId(path);
              const label = { institution: 'Institución', organization: 'Organización', unit: 'Unidad', project: 'Proyecto', percent: '% financ.' }[key];
              return <td key={key} data-label={label}>
                <input id={id} className="cenit-input" inputMode="numeric" autoComplete="off" value={row[key]} aria-label={`Fuente ${rowIndex + 1}, ${{ institution: 'institución', organization: 'organización', unit: 'unidad', project: 'proyecto', percent: 'porcentaje' }[key]}`}
                  aria-invalid={!!errors[path]} aria-describedby={errors[path] ? `${id}-error` : undefined} onChange={event => setFunding(rowIndex, key, event.target.value)} />
                {errors[path] && <p className="personnel-error" id={`${id}-error`}>{errors[path]}</p>}
              </td>;
            })}
          </tr>)}</tbody>
        </table></div></>}

        {step === 'actividad' && <div className="personnel-group">
          <Choice name="activity" legend="¿La comisión corresponde a un evento?" value={draft.activity} onChange={activity => update({ activity })}
            options={[{ value: 'evento', label: 'Sí, a un evento' }, { value: 'descripcion', label: 'No, describir la comisión' }]} />
          {event ? <>
            <Field name="eventName" label="Nombre del evento" value={draft.eventName} error={errors.eventName} onChange={eventName => update({ eventName })} />
            <div className="personnel-grid">
              <Field name="eventOrganizer" label="Institución organizadora" value={draft.eventOrganizer} error={errors.eventOrganizer} onChange={eventOrganizer => update({ eventOrganizer })} />
              <Field name="eventProject" label="Proyecto al que se asocia el trabajo" optional value={draft.eventProject} error={errors.eventProject} onChange={eventProject => update({ eventProject })} />
            </div>
            <Field name="eventWork" label="Nombre del trabajo o ponencia" optional textarea value={draft.eventWork} error={errors.eventWork} onChange={eventWork => update({ eventWork })} />
            <Field name="eventNotes" label="Otros antecedentes u observaciones" optional value={draft.eventNotes} error={errors.eventNotes} onChange={eventNotes => update({ eventNotes })} />
          </> : <Field name="description" label="Descripción de la comisión" textarea value={draft.description} error={errors.description} onChange={description => update({ description })} />}
        </div>}

        {step === 'revision' && <div>
          <div className="personnel-review-actions">
            <button type="button" className="cenit-button" onClick={() => setPreview(true)}><EyeIcon size={16} aria-hidden="true" />Vista previa</button>
            {pdfActions}
          </div>
          {review.map(block => <ReviewSection key={block.step} title={block.title} errors={stepErrors(block.step)} rows={block.rows} onEdit={() => go(block.step)} />)}
        </div>}

        <div className="personnel-card__foot">
          <div>{index > 0 && <button type="button" className="cenit-button cenit-button--quiet" onClick={() => go(steps[index - 1]!.key)}><ArrowLeftIcon size={16} aria-hidden="true" />{steps[index - 1]!.label}</button>}</div>
          {step !== 'revision' && <button type="button" className="cenit-button cenit-button--primary" onClick={next}>{steps[index + 1]!.key === 'revision' ? 'Revisar' : `Continuar a ${steps[index + 1]!.label}`}<ArrowRightIcon size={16} aria-hidden="true" /></button>}
        </div>
      </div>

      <aside className="personnel-summary" aria-label="Resumen">
        <h2>Resumen</h2>
        <dl>
          <div><dt>Funcionario</dt><dd>{draft.name || '—'}</dd></div>
          <div><dt>Lugar</dt><dd>{draft.territory ? `${draft.territory === 'nacional' ? 'Nacional' : 'Extranjero'}${draft.place ? ` · ${draft.place}` : ''}` : '—'}</dd></div>
          <div><dt>Fechas</dt><dd>{draft.from && draft.to ? `${displayDate(draft.from)} al ${displayDate(draft.to)}` : '—'}</dd></div>
          <div><dt>Total de días</dt><dd>{draft.totalDays || '—'}</dd></div>
          <div><dt>Viático</dt><dd>{draft.allowance ? `${draft.allowance} ${draft.currency}` : '—'}</dd></div>
          <div><dt>Actividad</dt><dd>{event ? draft.eventName || '—' : draft.description ? 'Descripción de la comisión' : '—'}</dd></div>
        </dl>
      </aside>
    </div>}

  </section>;
}
