import { useCallback, useEffect, useRef, useState } from 'react';
import { leaveTypes } from '@cenit/contracts';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { EyeIcon } from '@phosphor-icons/react/dist/csr/Eye';
import { TrashIcon } from '@phosphor-icons/react/dist/csr/Trash';
import { DateField } from '../../../shared/components/DateField.js';
import { ContextualConfirm } from '../../../shared/components/ContextualConfirm.js';
import { displayDate } from '../../../shared/lib/dates.js';
import { useGuardChanges } from '../../purchases/model/guard.js';
import { StaffSearch } from '../components/StaffSearch.js';
import { LeaveDocument } from '../components/LeaveDocument.js';
import { personnelForm } from '../components/FormControls.js';
import { PdfActions, usePersonnelPdf } from '../components/PdfOutput.js';
import { BackToPersonnel, DocumentPreview, ReviewSection, StepNav } from '../components/PersonnelLayout.js';
import { units } from '../model/staff.js';
import { requestLeavePdf } from '../api/leave.js';
import { formatRut } from '../model/format.js';
import { emptyLeave, leaveFileName, leaveStepFields, leaveSteps, leaveTypeLabels, validateLeaveStep, type Errors, type LeaveDraft, type LeaveStep } from '../model/leave.js';
import '../personnel.css';

const { fieldId, Field } = personnelForm('leave');
const formSteps = ['funcionario', 'permiso'] as const;
const hourlyFields = ['hours', 'minutes', 'startTime', 'endTime', 'recoveryDate'];

function DateInputField({ name, label, value, error, onChange }: { name: string; label: string; value: string; error?: string; onChange: (value: string) => void }) {
  const id = fieldId(name);
  return <div className="personnel-field">
    <label htmlFor={id}>{label}</label>
    <DateField id={id} label={label} value={value} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} onValueChange={onChange} />
    {error && <p className="personnel-error" id={`${id}-error`}>{error}</p>}
  </div>;
}

export function LeaveRequest() {
  const [draft, setDraft] = useState(emptyLeave);
  const [step, setStep] = useState<LeaveStep>('funcionario');
  const [errors, setErrors] = useState<Errors>({});
  const serverErrors = useRef<Errors>({});
  const [tried, setTried] = useState<Partial<Record<LeaveStep, boolean>>>({});
  const [focusKey, setFocusKey] = useState<{ key: string } | null>(null);
  const [preview, setPreview] = useState(false);
  const [discardOrigin, setDiscardOrigin] = useState<HTMLElement | null>(null);
  const pdf = usePersonnelPdf({
    request: signal => requestLeavePdf(draft, signal), fileName: () => leaveFileName(draft), printTitle: 'Imprimir solicitud de permiso',
    onFieldErrors: fields => {
      const target = formSteps.find(item => leaveStepFields[item].some(key => fields[key]));
      if (!target) return false;
      serverErrors.current = { ...fields };
      setErrors(fields); setTried(current => ({ ...current, [target]: true }));
      go(target); setFocusKey({ key: leaveStepFields[target].find(key => fields[key])! });
      return true;
    },
  });
  const [initial] = useState(emptyLeave);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const { abort: abortPdf, setMessage: setPdfMessage } = pdf;
  const reset = useCallback(() => { abortPdf(); serverErrors.current = {}; setDraft(emptyLeave()); setStep('funcionario'); setErrors({}); setTried({}); setPreview(false); setPdfMessage(''); }, [abortPdf, setPdfMessage]);
  useGuardChanges(dirty, false, reset);

  useEffect(() => { if (focusKey) document.getElementById(fieldId(focusKey.key))?.focus(); }, [focusKey]);

  function update(patch: Partial<LeaveDraft>) {
    if (pdf.busy.current) {
      pdf.abort();
      pdf.setMessage('Se canceló la preparación porque cambiaste el formulario.');
    } else pdf.setMessage('');
    const next = { ...draft, ...patch };
    for (const key of Object.keys(patch) as (keyof LeaveDraft)[]) if (draft[key] !== next[key]) delete serverErrors.current[key];
    if (patch.from !== undefined && patch.from !== draft.from) delete serverErrors.current.to;
    if (patch.startTime !== undefined && patch.startTime !== draft.startTime) delete serverErrors.current.endTime;
    if (next.type !== 'por_hora') for (const key of hourlyFields) delete serverErrors.current[key];
    setDraft(next);
    if (step !== 'revision') setErrors(current => {
      const kept = Object.fromEntries(Object.entries(current).filter(([key]) => !leaveStepFields[step].includes(key)));
      const remaining = Object.fromEntries(Object.entries(serverErrors.current).filter(([key]) => leaveStepFields[step].includes(key)));
      return { ...kept, ...remaining, ...(tried[step] ? validateLeaveStep(next, step) : {}) };
    });
  }

  function go(next: LeaveStep) { setStep(next); setPreview(false); document.getElementById('admin-content')?.scrollTo({ top: 0 }); }
  function check(target: Exclude<LeaveStep, 'revision'>) {
    const remaining = Object.fromEntries(Object.entries(serverErrors.current).filter(([key]) => leaveStepFields[target].includes(key)));
    const found = { ...remaining, ...validateLeaveStep(draft, target) };
    setErrors(current => ({ ...Object.fromEntries(Object.entries(current).filter(([key]) => !leaveStepFields[target].includes(key))), ...found }));
    setTried(current => ({ ...current, [target]: true }));
    return leaveStepFields[target].find(key => found[key]);
  }
  function next() {
    if (step === 'revision') return;
    const invalid = check(step);
    if (invalid) { setFocusKey({ key: invalid }); return; }
    go(leaveSteps[leaveSteps.findIndex(item => item.key === step) + 1]!.key);
  }
  // Marca los errores de todas las secciones y lleva al primero; devuelve false si no hay.
  function showFirstError() {
    for (const target of formSteps) {
      const invalid = check(target);
      if (invalid) { go(target); setFocusKey({ key: invalid }); return true; }
    }
    return false;
  }
  async function preparePdf(action: 'download' | 'print') {
    if (pdf.busy.current || showFirstError()) return;
    await pdf.run(action);
  }
  const pending = formSteps.reduce((total, target) => total + new Set([...Object.keys(validateLeaveStep(draft, target)), ...leaveStepFields[target].filter(key => serverErrors.current[key])]).size, 0);

  const index = leaveSteps.findIndex(item => item.key === step), current = leaveSteps[index]!;
  const stepErrors = (target: LeaveStep) => target === 'revision' ? 0 : leaveStepFields[target].filter(key => errors[key]).length;
  const complete = (target: LeaveStep) => target !== 'revision' && !Object.keys(validateLeaveStep(draft, target)).length;
  const known = (value: string) => value.trim() ? value : undefined;
  const hourly = draft.type === 'por_hora';
  const dates = draft.from && draft.to ? `${displayDate(draft.from)} al ${displayDate(draft.to)}` : undefined;
  const review: { step: Exclude<LeaveStep, 'revision'>; title: string; rows: [string, string | undefined][] }[] = [
    { step: 'funcionario', title: 'Funcionario', rows: [['Nombre', known(draft.name)], ['RUT', known(draft.rut)], ['Unidad en que trabaja', known(draft.unit)], ['Fecha de la solicitud', draft.requestDate ? displayDate(draft.requestDate) : undefined]] },
    { step: 'permiso', title: 'Permiso', rows: [
      ['Tipo de permiso', draft.type ? leaveTypeLabels[draft.type] : undefined], ['Fechas', dates], ['Total de días', known(draft.totalDays)],
      ...(hourly ? [['Tiempo', draft.hours || draft.minutes ? `${draft.hours || '0'} h ${draft.minutes || '0'} min` : undefined], ['Horario', draft.startTime && draft.endTime ? `${draft.startTime} a ${draft.endTime} h` : undefined],
        ['Fecha de recuperación', draft.recoveryDate ? displayDate(draft.recoveryDate) : undefined]] as [string, string | undefined][] : []),
      ['Observaciones', known(draft.notes)],
    ] },
  ];
  const pdfActions = <PdfActions pdf={{ ...pdf, run: preparePdf }} />;

  return <section className="personnel-page">
    <div className="personnel-heading">
      <div><BackToPersonnel /><h1>Nueva solicitud de permiso</h1><p>Propuesta pendiente de validación. Usa sólo datos ficticios; la búsqueda muestra funcionarios de ejemplo.</p></div>
      <div className="personnel-heading__actions">
        {!preview && step !== 'revision' && <button type="button" className="cenit-button" onClick={() => setPreview(true)}><EyeIcon size={16} aria-hidden="true" />Vista previa</button>}
        <button type="button" className="cenit-button cenit-button--quiet" disabled={!dirty} onClick={event => setDiscardOrigin(event.currentTarget)}><TrashIcon size={16} aria-hidden="true" />Descartar</button>
      </div>
    </div>
    <ContextualConfirm open={!!discardOrigin} origin={discardOrigin} title="¿Descartar esta solicitud?" description="Se borrarán todos los datos ingresados."
      confirmLabel="Descartar" destructive onCancel={() => setDiscardOrigin(null)} onConfirm={() => { setDiscardOrigin(null); reset(); }} />

    {pdf.message && <p role="alert" className="personnel-print-error">{pdf.message}</p>}
    {preview ? <DocumentPreview onClose={() => setPreview(false)} actions={pdfActions} pending={pending} onFix={showFirstError}><LeaveDocument draft={draft} /></DocumentPreview>
    : <div className="personnel-layout">
      <StepNav steps={leaveSteps} current={step} errors={stepErrors} complete={complete} onGo={go} />

      <div className="personnel-card">
        <div className="personnel-card__head"><h2>{current.label}</h2><p>{current.intro}</p></div>

        {step === 'funcionario' && <div className="personnel-group">
          <StaffSearch id={fieldId('name')} label="Nombre del funcionario" value={draft.name} error={errors.name} onChange={name => update({ name })}
            onPick={person => update({ name: person.name, rut: person.rut, unit: person.unit })} />
          <div className="personnel-grid">
            <Field name="rut" label="RUT" placeholder="Ej.: 12.345.678-5" value={draft.rut} error={errors.rut} onChange={rut => update({ rut: formatRut(rut) })} />
            <DateInputField name="requestDate" label="Fecha de la solicitud" value={draft.requestDate} error={errors.requestDate} onChange={requestDate => update({ requestDate })} />
          </div>
          <Field name="unit" label="Unidad en que trabaja" value={draft.unit} error={errors.unit} list="leave-units" onChange={unit => update({ unit })} />
          <datalist id="leave-units">{units.map(unit => <option key={unit} value={unit} />)}</datalist>
        </div>}

        {step === 'permiso' && <div className="personnel-group">
          <fieldset className="personnel-field" aria-describedby={errors.type ? `${fieldId('type')}-error` : undefined}>
            <legend>Tipo de permiso</legend>
            <div className={`personnel-options${errors.type ? ' personnel-options--invalid' : ''}`}>
              {leaveTypes.map((type, position) => <label key={type}>
                <input type="radio" name="leave-type" id={position === 0 ? fieldId('type') : undefined} checked={draft.type === type} onChange={() => update({ type })} />
                <span>{leaveTypeLabels[type]}</span>
              </label>)}
            </div>
            {errors.type && <p className="personnel-error" id={`${fieldId('type')}-error`}>{errors.type}</p>}
          </fieldset>
          <div className="personnel-grid personnel-grid--three">
            <DateInputField name="from" label="Desde" value={draft.from} error={errors.from} onChange={from => update({ from })} />
            <DateInputField name="to" label="Hasta" value={draft.to} error={errors.to} onChange={to => update({ to })} />
            <Field name="totalDays" label="Total de días" optional value={draft.totalDays} error={errors.totalDays} onChange={totalDays => update({ totalDays })} />
          </div>
          {hourly && <fieldset className="personnel-field personnel-subgroup">
            <legend>Permiso por hora</legend>
            <div className="personnel-grid personnel-grid--four">
              <Field name="hours" label="Horas" inputMode="numeric" value={draft.hours} error={errors.hours} onChange={hours => update({ hours })} />
              <Field name="minutes" label="Minutos" inputMode="numeric" value={draft.minutes} error={errors.minutes} onChange={minutes => update({ minutes })} />
              <Field name="startTime" label="Desde las" type="time" value={draft.startTime} error={errors.startTime} onChange={startTime => update({ startTime })} />
              <Field name="endTime" label="Hasta las" type="time" value={draft.endTime} error={errors.endTime} onChange={endTime => update({ endTime })} />
            </div>
            <div className="personnel-grid">
              <DateInputField name="recoveryDate" label="Fecha de recuperación del permiso" value={draft.recoveryDate} error={errors.recoveryDate} onChange={recoveryDate => update({ recoveryDate })} />
            </div>
          </fieldset>}
          <Field name="notes" label="Observaciones" optional value={draft.notes} error={errors.notes} onChange={notes => update({ notes })} />
        </div>}

        {step === 'revision' && <div>
          <div className="personnel-review-actions">
            <button type="button" className="cenit-button" onClick={() => setPreview(true)}><EyeIcon size={16} aria-hidden="true" />Vista previa</button>
            {pdfActions}
          </div>
          {review.map(block => <ReviewSection key={block.step} title={block.title} errors={stepErrors(block.step)} rows={block.rows} onEdit={() => go(block.step)} />)}
          <p className="personnel-hint">El documento lleva en blanco los espacios de firma y la sección de uso exclusivo de Recursos Humanos. Según el formulario, el VºBº del VAEA o del VR de sede corresponde sólo a permisos sin goce de sueldo.</p>
        </div>}

        <div className="personnel-card__foot">
          <div>{index > 0 && <button type="button" className="cenit-button cenit-button--quiet" onClick={() => go(leaveSteps[index - 1]!.key)}><ArrowLeftIcon size={16} aria-hidden="true" />{leaveSteps[index - 1]!.label}</button>}</div>
          {step !== 'revision' && <button type="button" className="cenit-button cenit-button--primary" onClick={next}>{leaveSteps[index + 1]!.key === 'revision' ? 'Revisar' : `Continuar a ${leaveSteps[index + 1]!.label}`}<ArrowRightIcon size={16} aria-hidden="true" /></button>}
        </div>
      </div>

      <aside className="personnel-summary" aria-label="Resumen">
        <h2>Resumen</h2>
        <dl>
          <div><dt>Funcionario</dt><dd>{draft.name || '—'}</dd></div>
          <div><dt>Tipo de permiso</dt><dd>{draft.type ? leaveTypeLabels[draft.type] : '—'}</dd></div>
          <div><dt>Fechas</dt><dd>{dates ?? '—'}</dd></div>
          <div><dt>Total de días</dt><dd>{draft.totalDays || '—'}</dd></div>
          {hourly && <div><dt>Horario</dt><dd>{draft.startTime && draft.endTime ? `${draft.startTime} a ${draft.endTime} h` : '—'}</dd></div>}
        </dl>
      </aside>
    </div>}
  </section>;
}
