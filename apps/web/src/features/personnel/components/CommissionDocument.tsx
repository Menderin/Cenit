import { displayDate } from '../../../shared/lib/dates.js';
import type { CommissionDraft } from '../model/commission.js';

// Estructura del formulario «Comisión de servicios»: rótulos, casillas y firmas del original.
export function CommissionDocument({ draft }: { draft: CommissionDraft }) {
  const x = (on: boolean) => on ? 'X' : '';
  const event = draft.activity === 'evento';
  const box = (text: string, className = '') => <span className={`commission-paper__box ${className}`}>{text}</span>;
  const check = (on: boolean) => <span className="commission-paper__check">{x(on)}</span>;
  return <article className="commission-paper" aria-label="Documento de comisión de servicios">
    <div className="commission-paper__logo">Universidad Católica del Norte</div>
    <h2 className="commission-paper__title">COMISIÓN DE SERVICIOS</h2>
    <section className="commission-paper__frame">
      <p className="commission-paper__lead">Autorízase la comisión de servicios que a continuación se describe.</p>
      <h3>I. Datos generales</h3>
      <div className="commission-paper__row"><span>Nombre completo</span><b>:</b>{box(draft.name)}</div>
      <div className="commission-paper__row"><span>Cargo</span><b>:</b>{box(draft.position)}</div>
      <div className="commission-paper__row"><span>Unidad</span><b>:</b>{box(draft.unit)}</div>
      <div className="commission-paper__row commission-paper__band"><span>Grupo</span><b>:</b><div className="commission-paper__options commission-paper__options--spread">
        {(['I', 'II', 'III'] as const).map(group => <span key={group}>{group} {check(draft.group === group)}</span>)}
      </div></div>
      <div className="commission-paper__row"><span>Estamento</span><b>:</b><div className="commission-paper__options">
        <span>{check(draft.category === 'academico')}Académico</span>
        <span>{check(draft.category === 'no_academico')}No académico</span>
        <span>{check(draft.category === 'directivo')}Directivo superior o exclusiva confianza</span>
        <span>{check(draft.category === 'otro')}Otro {box(draft.category === 'otro' ? draft.categoryOther : '', 'commission-paper__box--line')}<small>(especificar)</small></span>
      </div></div>
      <div className="commission-paper__row"><span>Planta a la que pertenece</span><b>:</b><div className="commission-paper__options">
        <span>{check(draft.plant === 'oficial')}Planta oficial</span><span>{check(draft.plant === 'especial')}Planta especial</span><span>{check(draft.plant === 'temporal')}Planta temporal</span>
      </div></div>
      <div className="commission-paper__row commission-paper__band"><span>Lugar de realización comisión</span><b>:</b><div className="commission-paper__stack">
        <div className="commission-paper__options"><span>{check(draft.territory === 'nacional')}Territorio nacional</span><span className="commission-paper__grow">Lugar {box(draft.territory === 'nacional' ? draft.place : '', 'commission-paper__box--center')}</span></div>
        <div className="commission-paper__options"><span>{check(draft.territory === 'extranjero')}Extranjero</span><span className="commission-paper__grow">Lugar {box(draft.territory === 'extranjero' ? draft.place : '', 'commission-paper__box--center')}</span></div>
      </div></div>
      <div className="commission-paper__row"><span>Fechas de la comisión</span><b>:</b><div className="commission-paper__options commission-paper__nowrap">
        <span className="commission-paper__grow">Desde {box(displayDate(draft.from), 'commission-paper__box--center')}</span>
        <span className="commission-paper__grow">Hasta {box(displayDate(draft.to), 'commission-paper__box--center')}</span>
      </div></div>
      <div className="commission-paper__row commission-paper__band"><span>Cantidad de días</span><b>:</b><div className="commission-paper__options commission-paper__nowrap">
        <span>Días con pernoctar {box(draft.daysWithStay, 'commission-paper__box--small')}</span>
        <span>Días sin pernoctar {box(draft.daysWithoutStay, 'commission-paper__box--small')}</span>
        <span>Total días {box(draft.totalDays, 'commission-paper__box--small')}</span>
      </div></div>
      <div className="commission-paper__row commission-paper__band"><span>Costo total viático (CLP)</span><b>:</b><div className="commission-paper__options commission-paper__nowrap">
        {box(draft.allowance, 'commission-paper__box--amount')}{box(draft.allowance.trim() ? draft.currency : '', 'commission-paper__box--small')}
      </div></div>
      <div className="commission-paper__row"><span>Código presupuestario</span><b>:</b><div className="commission-paper__stack">
        {draft.funding.map((row, index) => <div key={index} className="commission-paper__codes">
          {box(row.institution, 'commission-paper__box--center')}{box(row.organization, 'commission-paper__box--center')}{box(row.unit, 'commission-paper__box--center')}{box(row.project, 'commission-paper__box--center')}{box(row.percent ? `${row.percent}%` : '', 'commission-paper__box--center')}
        </div>)}
        <div className="commission-paper__codes commission-paper__captions"><span>Inst.</span><span>Org.</span><span>Unidad</span><span>Proyecto</span><span>% Financ.</span></div>
      </div></div>
    </section>
    <section className="commission-paper__frame">
      <h3>II. Datos del evento</h3>
      <div className="commission-paper__row"><span>Nombre del evento</span><b>:</b>{box(event ? draft.eventName : '')}</div>
      <div className="commission-paper__row"><span>Institución organizadora</span><b>:</b>{box(event ? draft.eventOrganizer : '')}</div>
      <div className="commission-paper__row"><span>Nombre del trabajo o ponencia</span><b>:</b>{box(event ? draft.eventWork : '', 'commission-paper__box--tall')}</div>
      <div className="commission-paper__row"><span>Proy. al que se asocia trabajo</span><b>:</b>{box(event ? draft.eventProject : '')}</div>
      <div className="commission-paper__row"><span>Otros antecedentes u observ.</span><b>:</b>{box(event ? draft.eventNotes : '')}</div>
    </section>
    <section className="commission-paper__frame">
      <h3>III. Descripción de la comisión <small>(Si no corresponde a un evento descrito en II.)</small></h3>
      {box(event ? '' : draft.description, 'commission-paper__box--tall')}
    </section>
    <div className="commission-paper__signatures">
      <div><span>Autorización Jefe de Unidad</span></div>
      <div><span>Autorización Decano/a Facultad</span></div>
      <div><span>Autorización VRA (o) VAEA (o) VRS</span></div>
    </div>
  </article>;
}
