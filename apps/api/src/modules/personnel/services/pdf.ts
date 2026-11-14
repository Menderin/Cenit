import { readFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { ServiceCommission } from '@cenit/contracts/personnel';
import { commissionCells } from './commission-layout.js';

const templatePath = new URL('../../../../assets/service-commission-template.pdf', import.meta.url);
const scale = Math.min(540 / 910, 706 / 1278);
const left = (612 - 910 * scale) / 2, top = 792 - 36;
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
  const pdf = await PDFDocument.create();
  const [background] = await pdf.embedPdf(await readFile(templatePath));
  const page = pdf.addPage([612, 792]);
  page.drawPage(background!, { x: left, y: top - 1278 * scale, width: 910 * scale, height: 1278 * scale });
  const font = await pdf.embedFont(StandardFonts.TimesRoman), fields: Record<string, string> = {};
  for (const [rawCell, entry] of Object.entries(entries)) {
    const cell = rawCell as Cell, [key, value] = entry!;
    if (!value) continue;
    const text = ['G29', 'P29'].includes(cell) ? value : value.toLocaleUpperCase('es');
    const [x, y, w, h] = commissionCells[cell];
    let lines: string[] = [], chosen = 0;
    try {
      for (let size = 13.3333 * scale; size >= 4.5; size -= 0.25) {
        const maxWidth = (w - 4) * scale;
        const result: string[] = [];
        for (const paragraph of text.split('\n')) {
          let line = '';
          for (const char of paragraph) {
            if (line && font.widthOfTextAtSize(line + char, size) > maxWidth) { result.push(line); line = ''; }
            line += char;
          }
          result.push(line);
        }
        if (result.every(line => font.widthOfTextAtSize(line, size) <= maxWidth) && result.length * size * 1.1 <= h * scale) { lines = result; chosen = size; break; }
      }
    } catch { fields[key] = 'Contiene caracteres que no admite el documento.'; continue; }
    if (!chosen) { fields[key] = 'El texto no cabe en la plantilla; acórtalo.'; continue; }
    const blockHeight = lines.length * chosen * 1.1;
    lines.forEach((line, index) => {
      const width = font.widthOfTextAtSize(line, chosen);
      const textX = left + x * scale + (leftAligned.has(cell) ? 2 * scale : (w * scale - width) / 2);
      const textY = top - (y + h / 2) * scale + blockHeight / 2 - (index + 1) * chosen * 1.1 + chosen * 0.15;
      page.drawText(line, { x: textX, y: textY, size: chosen, font, color: rgb(0, 0, 0) });
    });
  }
  if (Object.keys(fields).length) return { fields };
  page.drawText('BORRADOR', { x: 306 - font.widthOfTextAtSize('BORRADOR', 6) / 2, y: 36, size: 6, font });
  return { bytes: await pdf.save(), fields };
}
