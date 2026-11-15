import { commissionAllowance, commissionDate, type CommissionDraft } from '../model/commission.js';
import { commissionCells } from '../model/commission-layout.js';
import { TemplateDocument } from './TemplateDocument.js';
import template from './commission-template.svg';

const left = new Set(['E11', 'E13', 'E15', 'E41', 'E43', 'E45', 'E47', 'E49', 'B54']);
const keepCase = new Set(['G29', 'P29']);

// La plantilla conserva únicamente el formato y los rótulos de COMISION.
// Los datos del ejemplo, fórmulas, macros y nombres de firmantes quedan fuera.
export function CommissionDocument({ draft }: { draft: CommissionDraft }) {
  const event = draft.activity === 'evento';
  const mark = (selected: boolean) => selected ? 'X' : '';
  const values: Partial<Record<keyof typeof commissionCells, string>> = {
    E11: draft.name, E13: draft.position, E15: draft.unit,
    F17: mark(draft.group === 'I'), M17: mark(draft.group === 'II'), U17: mark(draft.group === 'III'),
    E19: mark(draft.category === 'academico'), K19: mark(draft.category === 'no_academico'),
    E21: mark(draft.category === 'directivo'), R21: mark(draft.category === 'otro'), V21: draft.category === 'otro' ? draft.categoryOther : '',
    E23: mark(draft.plant === 'oficial'), M23: mark(draft.plant === 'especial'), R23: mark(draft.plant === 'temporal'),
    E25: mark(draft.territory === 'nacional'), E27: mark(draft.territory === 'extranjero'),
    P25: draft.territory === 'nacional' ? draft.place : '', P27: draft.territory === 'extranjero' ? draft.place : '',
    G29: commissionDate(draft.from), P29: commissionDate(draft.to),
    I31: draft.daysWithStay, O31: draft.daysWithoutStay, Y31: draft.totalDays,
    F33: commissionAllowance(draft.allowance), T33: draft.allowance.trim() ? draft.currency : '',
    E41: event ? draft.eventName : '', E43: event ? draft.eventOrganizer : '',
    E45: event ? draft.eventWork : '', E47: event ? draft.eventProject : '', E49: event ? draft.eventNotes : '',
    B54: event ? '' : draft.description,
  };
  draft.funding.forEach((row, index) => {
    const cells = index === 0 ? ['E35', 'H35', 'K35', 'R35', 'AA35'] as const : ['E37', 'H37', 'K37', 'R37', 'AA37'] as const;
    [row.institution, row.organization, row.unit, row.project, row.percent ? `${row.percent}%` : ''].forEach((value, i) => { values[cells[i]!] = value; });
  });
  return <TemplateDocument variant="commission" label="Documento de comisión de servicios" template={template}
    alt="Comisión de servicios UCN: datos generales, datos del evento, descripción y tres espacios de autorización."
    sheet={{ width: 910, height: 1278 }} cells={commissionCells} values={values as Record<string, string>} left={left} keepCase={keepCase} />;
}
