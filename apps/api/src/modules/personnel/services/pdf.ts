import { StandardFonts } from 'pdf-lib';
import type { ServiceCommission } from '@cenit/contracts/personnel';
import { commissionCells } from './commission-layout.js';
import { fillTemplate } from './template-pdf.js';

const templatePath = new URL('../../../../assets/service-commission-template.pdf', import.meta.url);
const leftAligned = new Set(['E11', 'E13', 'E15', 'E41', 'E43', 'E45', 'E47', 'E49', 'B54']);
const date = (value: string) => {
  const [year, month, day] = value.split('-');
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
  return `${Number(day)}/${months[Number(month) - 1]}/${year!.slice(-2)}`;
};
const allowance = (value: string) => {
  if (!value.trim()) return '';
  const [integer, decimals = ''] = value.trim().split(',');
  return `${integer!.replaceAll('.', '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decimals.padEnd(2, '0')}`;
};

export async function commissionPdf(d: ServiceCommission): Promise<{ bytes?: Uint8Array; fields: Record<string, string> }> {
  const mark = (condition: boolean) => condition ? 'X' : '';
  type Cell = keyof typeof commissionCells;
  const entries: Partial<Record<Cell, [string, string]>> = {
    E11: ['name', d.name], E13: ['position', d.position], E15: ['unit', d.unit],
    F17: ['group', mark(d.group === 'I')], M17: ['group', mark(d.group === 'II')], U17: ['group', mark(d.group === 'III')],
    E19: ['category', mark(d.category === 'academico')], K19: ['category', mark(d.category === 'no_academico')],
    E21: ['category', mark(d.category === 'directivo')], R21: ['category', mark(d.category === 'otro')], V21: ['categoryOther', d.category === 'otro' ? d.categoryOther : ''],
    E23: ['plant', mark(d.plant === 'oficial')], M23: ['plant', mark(d.plant === 'especial')], R23: ['plant', mark(d.plant === 'temporal')],
    E25: ['territory', mark(d.territory === 'nacional')], E27: ['territory', mark(d.territory === 'extranjero')],
    P25: ['place', d.territory === 'nacional' ? d.place : ''], P27: ['place', d.territory === 'extranjero' ? d.place : ''],
    G29: ['from', date(d.from)], P29: ['to', date(d.to)], I31: ['daysWithStay', d.daysWithStay], O31: ['daysWithoutStay', d.daysWithoutStay], Y31: ['totalDays', d.totalDays],
    F33: ['allowance', allowance(d.allowance)], T33: ['currency', d.allowance.trim() ? d.currency : ''],
    E41: ['eventName', d.activity === 'evento' ? d.eventName : ''], E43: ['eventOrganizer', d.activity === 'evento' ? d.eventOrganizer : ''],
    E45: ['eventWork', d.activity === 'evento' ? d.eventWork : ''], E47: ['eventProject', d.activity === 'evento' ? d.eventProject : ''],
    E49: ['eventNotes', d.activity === 'evento' ? d.eventNotes : ''], B54: ['description', d.activity === 'descripcion' ? d.description : ''],
  };
  d.funding.forEach((row, index) => {
    const cells = index === 0 ? ['E35', 'H35', 'K35', 'R35', 'AA35'] as const : ['E37', 'H37', 'K37', 'R37', 'AA37'] as const;
    const keys = ['institution', 'organization', 'unit', 'project', 'percent'] as const;
    keys.forEach((key, i) => { entries[cells[i]!] = [`funding.${index}.${key}`, key === 'percent' && row[key] ? `${row[key]}%` : row[key]]; });
  });
  return fillTemplate({
    template: templatePath, sheet: { width: 910, height: 1278 }, font: StandardFonts.TimesRoman, cells: commissionCells,
    entries: Object.entries(entries).map(([cell, entry]) => [cell, entry![0], entry![1]]), left: leftAligned, keepCase: new Set(['G29', 'P29']),
  });
}
