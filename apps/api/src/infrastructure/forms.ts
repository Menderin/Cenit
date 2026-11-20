import { readFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { cellStyle, formFrame, formLineHeight, formMinSize, letterPage, type FormEntry, type FormFont, type FormLayout } from '@cenit/contracts';

const standardFonts: Record<FormFont, StandardFonts> = {
  sans: StandardFonts.Helvetica, 'sans-bold': StandardFonts.HelveticaBold, serif: StandardFonts.TimesRoman, 'serif-bold': StandardFonts.TimesRomanBold,
};
const winAnsi = new Set('–—‘’“”•…€™'.split(''));
const printable = (char: string) => { const code = char.charCodeAt(0); return char === '\n' || char === '\t' || (code >= 32 && code <= 255 && (code < 127 || code > 159)) || winAnsi.has(char); };
/** Primer carácter que la fuente estándar del PDF no puede imprimir (p. ej. ✓, ≥ o un emoji). */
export const unprintableChar = (value: string) => [...value.replace(/\r/g, '')].find(char => !printable(char));

/** Líneas que caben en `width`: corta entre palabras y, si una palabra no cabe sola, entre letras. */
export function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/(?<=\s)/)) {
      if (font.widthOfTextAtSize((line + word).trimEnd(), size) <= width) { line += word; continue; }
      if (line) { lines.push(line.trimEnd()); line = ''; }
      for (const char of word) {
        if (line && font.widthOfTextAtSize((line + char).trimEnd(), size) > width) { lines.push(line.trimEnd()); line = ''; }
        line += char;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

const templates = new Map<string, Promise<Buffer>>();
const load = (template: URL) => {
  if (!templates.has(template.href)) templates.set(template.href, readFile(template).catch(error => { templates.delete(template.href); throw error; }));
  return templates.get(template.href)!;
};

/**
 * Escribe los valores sobre la copia exacta de un formulario, en una hoja carta. Reduce la letra hasta que el texto quepa;
 * si no cabe o tiene un carácter que la fuente no imprime, informa el campo sin entregar un documento recortado.
 */
export async function fillForm<Cell extends string>(template: URL, layout: FormLayout<Cell>, entries: readonly FormEntry<Cell>[]): Promise<{ bytes?: Uint8Array; fields: Record<string, string> }> {
  const frame = formFrame(layout), { scale } = frame, top = letterPage.height - frame.y;
  const pdf = await PDFDocument.create();
  pdf.setProducer('Cenit'); pdf.setCreator('Cenit');
  const [background] = await pdf.embedPdf(await load(template));
  const page = pdf.addPage([letterPage.width, letterPage.height]);
  page.drawPage(background!, { x: frame.x, y: top - layout.sheet.height * scale, width: layout.sheet.width * scale, height: layout.sheet.height * scale });
  const fonts = new Map<FormFont, PDFFont>(), fields: Record<string, string> = {};
  const font = async (name: FormFont) => { if (!fonts.has(name)) fonts.set(name, await pdf.embedFont(standardFonts[name])); return fonts.get(name)!; };
  for (const [cell, field, value] of entries) {
    if (!value || fields[field]) continue;
    const bad = unprintableChar(value);
    if (bad) { fields[field] = `El texto contiene «${bad}», un carácter que no se puede imprimir en el documento.`; continue; }
    const style = cellStyle(layout, cell), typeface = await font(style.font);
    const text = (style.upper ? value.toLocaleUpperCase('es') : value).replace(/\r/g, '').replace(/\t/g, ' ');
    const [x, y, w, h] = style.box, inset = 2 * scale;
    let lines: string[] = [], size = 0;
    for (let candidate = style.size * scale; candidate >= formMinSize; candidate -= 0.25) {
      const wrapped = wrapText(text, typeface, candidate, w * scale - 2 * inset);
      if (wrapped.length * candidate * formLineHeight <= h * scale - (style.valign === 'top' ? inset : 0)) { lines = wrapped; size = candidate; break; }
    }
    if (!size) { fields[field] = 'El texto no cabe en el documento; acórtalo.'; continue; }
    const block = lines.length * size * formLineHeight;
    const blockTop = style.valign === 'top' ? top - y * scale - inset : top - (y + h / 2) * scale + block / 2;
    lines.forEach((line, index) => {
      const width = typeface.widthOfTextAtSize(line, size);
      const textX = frame.x + x * scale + (style.align === 'left' ? inset : (w * scale - width) / 2);
      page.drawText(line, { x: textX, y: blockTop - (index + 1) * size * formLineHeight + size * 0.15, size, font: typeface, color: rgb(0, 0, 0) });
    });
  }
  if (Object.keys(fields).length) return { fields };
  const marker = await font('serif');
  page.drawText('BORRADOR', { x: letterPage.width / 2 - marker.widthOfTextAtSize('BORRADOR', 6) / 2, y: frame.mark, size: 6, font: marker });
  return { bytes: await pdf.save(), fields };
}
