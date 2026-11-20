import { readFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

type Box = readonly [number, number, number, number];

/**
 * Dibuja los valores sobre la plantilla vectorial de un formulario, en una hoja carta.
 * Reduce la letra hasta que el texto quepa; si no cabe o la fuente no admite un carácter, informa el campo sin recortar.
 */
export async function fillTemplate({ template, sheet, top = 36, font: fontName, cells, entries, left, keepCase }: {
  template: URL; sheet: { width: number; height: number }; top?: number; font: StandardFonts;
  cells: Record<string, Box>; entries: [cell: string, field: string, value: string][];
  left: ReadonlySet<string>; keepCase?: ReadonlySet<string>;
}): Promise<{ bytes?: Uint8Array; fields: Record<string, string> }> {
  const scale = Math.min(540 / sheet.width, (792 - 2 * top - 14) / sheet.height);
  const originX = (612 - sheet.width * scale) / 2, originY = 792 - top;
  const pdf = await PDFDocument.create();
  const [background] = await pdf.embedPdf(await readFile(template));
  const page = pdf.addPage([612, 792]);
  page.drawPage(background!, { x: originX, y: originY - sheet.height * scale, width: sheet.width * scale, height: sheet.height * scale });
  const font = await pdf.embedFont(fontName), fields: Record<string, string> = {};
  for (const [cell, key, value] of entries) {
    if (!value) continue;
    const text = keepCase?.has(cell) ? value : value.toLocaleUpperCase('es');
    const [x, y, w, h] = cells[cell]!;
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
      const textX = originX + x * scale + (left.has(cell) ? 2 * scale : (w * scale - width) / 2);
      const textY = originY - (y + h / 2) * scale + blockHeight / 2 - (index + 1) * chosen * 1.1 + chosen * 0.15;
      page.drawText(line, { x: textX, y: textY, size: chosen, font, color: rgb(0, 0, 0) });
    });
  }
  if (Object.keys(fields).length) return { fields };
  const marker = fontName === StandardFonts.TimesRoman ? font : await pdf.embedFont(StandardFonts.TimesRoman);
  page.drawText('BORRADOR', { x: 306 - marker.widthOfTextAtSize('BORRADOR', 6) / 2, y: 36, size: 6, font: marker });
  return { bytes: await pdf.save(), fields };
}
