import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { AssetDetail, Delivery, DocumentItem, Loan } from '@cenit/contracts/assets';
import { ApiError } from '../../../infrastructure/errors.js';

// Documentos de Bienes en una hoja carta. Siguen la estructura de los formularios recibidos
// (alta de la Sección Registro, entrega y préstamo internos), con firmas vacías y sin datos del ejemplo.
// El formato es una propuesta pendiente de validación institucional.
const W = 612, H = 792, M = 54, ink = rgb(0.13, 0.13, 0.15), muted = rgb(0.38, 0.38, 0.42), line = rgb(0.2, 0.2, 0.22);
const winAnsi = new Set('–—‘’“”•…€™'.split(''));
const printable = (char: string) => { const code = char.charCodeAt(0); return char === '\n' || char === '\t' || (code >= 32 && code <= 255 && (code < 127 || code > 159)) || winAnsi.has(char); };
/** Primer carácter que la fuente estándar del PDF no puede imprimir (p. ej. ✓, ≥ o un emoji). */
export const unprintableChar = (value: string) => [...value.replace(/\r/g, '')].find(char => !printable(char));
// Un carácter no admitido se rechaza con su nombre; nunca se imprime un «?» en su lugar.
const clean = (value: string) => {
  const bad = unprintableChar(value);
  if (bad) throw new ApiError(422, 'VALIDATION_ERROR', `El texto contiene «${bad}», un carácter que no se puede imprimir en el documento. Reemplázalo y vuelve a intentar.`);
  return value.replace(/\r/g, '').replace(/\t/g, ' ');
};
const dateParts = (value: string) => { const [y, m, d] = value.split('-'); return [d!, m!, y!]; };
const dateText = (value: string) => dateParts(value).join('/');

class Sheet {
  y = H - M;
  low = H; // punto más bajo dibujado: si invade el pie, el documento no cabe en una hoja
  private constructor(readonly pdf: PDFDocument, readonly page: PDFPage, readonly regular: PDFFont, readonly bold: PDFFont) {}
  static async create() {
    const pdf = await PDFDocument.create();
    pdf.setProducer('Cenit'); pdf.setCreator('Cenit');
    return new Sheet(pdf, pdf.addPage([W, H]), await pdf.embedFont(StandardFonts.Helvetica), await pdf.embedFont(StandardFonts.HelveticaBold));
  }
  wrap(text: string, size: number, width: number, font = this.regular) {
    const lines: string[] = [];
    for (const paragraph of clean(text).split('\n')) {
      let current = '';
      for (const word of paragraph.split(/\s+/)) {
        const next = current ? `${current} ${word}` : word;
        if (current && font.widthOfTextAtSize(next, size) > width) { lines.push(current); current = word; } else current = next;
        while (font.widthOfTextAtSize(current, size) > width && current.length > 1) {
          let cut = current.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(current.slice(0, cut), size) > width) cut--;
          lines.push(current.slice(0, cut)); current = current.slice(cut);
        }
      }
      lines.push(current);
    }
    return lines;
  }
  text(value: string, x: number, y: number, { size = 9, font = this.regular, color = ink, width, align = 'left' }: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; width?: number; align?: 'left' | 'center' | 'right' } = {}) {
    const lines = width ? this.wrap(value, size, width, font) : [clean(value)];
    lines.forEach((text, index) => {
      const w = font.widthOfTextAtSize(text, size);
      const dx = !width || align === 'left' ? 0 : align === 'center' ? (width - w) / 2 : width - w;
      this.page.drawText(text, { x: x + dx, y: y - index * size * 1.25, size, font, color });
      this.low = Math.min(this.low, y - index * size * 1.25 - size * 0.25);
    });
    return lines.length * size * 1.25;
  }
  rect(x: number, y: number, w: number, h: number, fill?: ReturnType<typeof rgb>) {
    this.low = Math.min(this.low, y - h);
    this.page.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: line, borderWidth: 0.7, color: fill });
  }
  hline(x: number, y: number, w: number) { this.page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness: 0.7, color: line }); }
  dateBoxes(value: string, x: number, y: number) {
    this.text('FECHA', x, y - 12, { size: 8, font: this.bold });
    dateParts(value).forEach((part, index) => { this.rect(x + 40 + index * 34, y, 34, 18); this.text(part, x + 40 + index * 34, y - 12.5, { size: 9, width: 34, align: 'center' }); });
  }
  title(value: string, size = 13) { this.y -= this.text(value, M, this.y, { size, font: this.bold, width: W - 2 * M, align: 'center' }); }
  // Tabla de dos columnas etiqueta/valor; cada fila crece con su contenido.
  labelled(rows: [string, string][], { labelWidth = 120, size = 9 } = {}) {
    const width = W - 2 * M;
    for (const [label, value] of rows) {
      const lines = Math.max(1, this.wrap(value, size, width - labelWidth - 12).length), h = lines * size * 1.25 + 9;
      this.rect(M, this.y, labelWidth, h, rgb(0.96, 0.96, 0.97)); this.rect(M + labelWidth, this.y, width - labelWidth, h);
      this.text(label, M + 6, this.y - 6 - size * 0.85, { size: 8, font: this.bold });
      this.text(value, M + labelWidth + 6, this.y - 6 - size * 0.85, { size, width: width - labelWidth - 12 });
      this.y -= h;
    }
  }
  table(columns: { label: string; width: number }[], rows: string[][], size = 8.5) {
    const total = columns.reduce((sum, column) => sum + column.width, 0), scale = (W - 2 * M) / total;
    const draw = (cells: string[], header: boolean) => {
      const h = Math.max(...cells.map((cell, i) => this.wrap(cell, size, columns[i]!.width * scale - 10, header ? this.bold : this.regular).length)) * size * 1.25 + 8;
      let x = M;
      cells.forEach((cell, i) => {
        const w = columns[i]!.width * scale;
        this.rect(x, this.y, w, h, header ? rgb(0.96, 0.96, 0.97) : undefined);
        this.text(cell, x + 5, this.y - 5 - size * 0.85, { size, width: w - 10, font: header ? this.bold : this.regular });
        x += w;
      });
      this.y -= h;
    };
    draw(columns.map(column => column.label), true);
    rows.forEach(row => draw(row, false));
  }
  box(heading: string, body: string, minHeight = 60) {
    const width = W - 2 * M, lines = this.wrap(body || ' ', 9, width - 16), h = Math.max(minHeight, lines.length * 11.25 + 30);
    this.rect(M, this.y, width, h);
    this.text(heading, M + 8, this.y - 14, { size: 8, font: this.bold });
    this.text(body, M + 8, this.y - 28, { size: 9, width: width - 16 });
    this.y -= h;
  }
  signature(label: string, detail: string[], x: number, width: number) {
    this.hline(x, this.y, width);
    this.text(label, x, this.y - 11, { size: 8, font: this.bold, width, align: 'center' });
    detail.filter(Boolean).forEach((value, index) => this.text(value, x, this.y - 22 - index * 10, { size: 8, color: muted, width, align: 'center' }));
  }
  async finish(generatedOn: string) {
    if (this.low < 46) throw new ApiError(422, 'DOCUMENT_TOO_LONG', 'El documento no cabe en una hoja carta. Acorta las descripciones u observaciones, o registra los bienes en dos documentos.');
    this.text('BORRADOR · Formato propuesto, pendiente de validación', M, H - 30, { size: 9, font: this.bold, color: muted, width: W - 2 * M, align: 'right' });
    this.text(`Generado en Cenit el ${dateText(generatedOn)}. Formato propuesto, pendiente de validación institucional. Las firmas se gestionan fuera de Cenit.`, M, 30, { size: 8, color: muted, width: W - 2 * M, align: 'center' });
    return this.pdf.save();
  }
}

const santiagoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
const itemDetail = (item: Pick<DocumentItem, 'kind' | 'brand' | 'model' | 'serialNumber' | 'material' | 'dimensions'>) => {
  if (item.kind === 'mueble') return [item.material && `Material: ${item.material}`, item.dimensions && `Medidas: ${item.dimensions}`].filter(Boolean).join(' · ');
  return [item.brand, item.model, item.serialNumber && `N° serie ${item.serialNumber}`].filter(Boolean).join(' · ');
};

export async function altaPdf(asset: AssetDetail) {
  const s = await Sheet.create();
  s.text('DIRECCIÓN DE ADMINISTRACIÓN Y FINANZAS', M, s.y, { size: 8, font: s.bold });
  s.text('DEPARTAMENTO DE CONTABILIDAD Y FINANZAS', M, s.y - 11, { size: 8, font: s.bold });
  s.text('SECCIÓN REGISTRO', W - M - 200, s.y - 34, { size: 8, font: s.bold, width: 200, align: 'right' });
  s.dateBoxes(asset.registeredOn, M, s.y - 26); s.y -= 70;
  s.title('INFORMACIÓN REQUERIDA (ALTA DE BIENES INVENTARIABLES)', 12);
  s.y -= s.text('INVERSIONES: Muebles, Equipos, Maquinarias, Construcciones, Etc.', M, s.y - 4, { size: 8.5, color: muted, width: W - 2 * M, align: 'center' }) + 14;
  s.labelled([
    ['CANTIDAD', String(asset.quantity)], ['DESCRIPCIÓN', asset.description], ['UBICACIÓN', asset.location],
    ['RESPONSABLE', asset.custodian ? [asset.custodian.name, asset.custodian.position, asset.custodian.unit].filter(Boolean).join(' · ') : ''],
    ['CÓDIGO CENIT', `${asset.code}${asset.inventoryNumber ? ` · N° inventario ${asset.inventoryNumber}` : ''}`],
  ]);
  s.y -= 8;
  s.y -= s.text('Nota 1: Sobre los EQUIPOS indicar cuando corresponda si es parte de un sistema. Respecto de los MUEBLES, indicar si van adosados al piso o a la pared. Sobre los EQUIPOS COMPUTACIONALES, indicar si son armados.', M, s.y - 8, { size: 7.5, color: muted, width: W - 2 * M }) + 14;
  const facts = asset.kind === 'mueble' ? [['Tipo', asset.furnitureType], ['Material', asset.material], ['Medidas', asset.dimensions], ['Adosado al piso o la pared', asset.wallMounted ? 'Sí' : 'No']]
    : asset.kind === 'construccion' ? [['Medidas (m²)', asset.area], ['Materiales', asset.material]]
      : [['Marca', asset.brand], ['Modelo', asset.model], ['N° de serie', asset.serialNumber], ...(asset.kind === 'equipo_computacional' ? [['Equipo armado', asset.assembled ? 'Sí' : 'No']] : []), ...(['equipo', 'equipo_computacional', 'maquinaria'].includes(asset.kind) ? [['Parte de un sistema', asset.systemPart ? 'Sí' : 'No']] : [])];
  s.box('MÁS DATOS: EQUIPOS, MUEBLES, MAQUINARIAS, CONSTRUCCIÓN, ETC.', [facts.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n'), asset.notes].filter(Boolean).join('\n\n'), 110);
  s.y -= 60;
  s.signature('Responsable', asset.custodian ? [asset.custodian.name, asset.custodian.position ?? '', asset.custodian.unit ?? ''] : [], W / 2 - 120, 240);
  s.y -= 70;
  s.text('Nota 2: Para todo requerimiento de compra de bienes inventariables (inversiones) se solicitará al proveedor indicar claramente en la factura: MARCA, MODELO y N° DE SERIE en los equipos computacionales y equipos varios; TIPO, MATERIAL y MEDIDAS en todo tipo de muebles; MEDIDAS (m²) y MATERIALES en construcciones e infraestructura.', M, s.y, { size: 7.5, color: muted, width: W - 2 * M });
  return s.finish(santiagoToday());
}

export async function deliveryPdf(delivery: Delivery) {
  const s = await Sheet.create();
  s.text('Facultad de Medicina', M, s.y - 12, { size: 9, font: s.bold });
  s.text('Universidad Católica del Norte', M, s.y - 23, { size: 8, color: muted });
  s.dateBoxes(delivery.deliveredOn, W - M - 142, s.y); s.y -= 54;
  s.title(`ENTREGA DE EQUIPOS E INSUMOS N° ${delivery.number.split('/')[0]}`);
  s.y -= s.text('(BIENES INVENTARIABLES Y GASTOS CONTROLADOS)', M, s.y - 2, { size: 8.5, width: W - 2 * M, align: 'center' }) + 14;
  s.y -= s.text('Recibe conforme:', M, s.y, { size: 9, font: s.bold }) + 2;
  const r = delivery.receiver, upper = (value: string | null) => (value ?? '').toLocaleUpperCase('es');
  s.labelled([['NOMBRE', upper(r.name)], ['RUT', r.rut ?? ''], ['UNIDAD', upper(r.unit)], ['CARGO', upper(r.position)], ['FIRMA', '\n']], { labelWidth: 90 });
  s.y -= 14;
  s.y -= s.text('Los siguientes bienes y equipos:', M, s.y, { size: 9, font: s.bold }) + 2;
  s.table([{ label: 'CANT', width: 40 }, { label: 'DESCRIPCIÓN', width: 230 }, { label: 'MARCA', width: 90 }, { label: 'SERIE', width: 100 }, { label: 'CÓDIGO', width: 60 }],
    delivery.items.map(item => [String(item.quantity), upper(item.description), upper(item.brand), item.serialNumber ?? '', item.code]));
  s.y -= 12;
  s.labelled([['MOTIVO', delivery.reason], ['FECHA ENTREGA', dateText(delivery.deliveredOn)], ...(delivery.destination ? [['UBICACIÓN', delivery.destination] as [string, string]] : [])], { labelWidth: 90 });
  s.y -= 70;
  s.signature('Recibe conforme', [r.name], M, 220);
  s.signature('Entrega conforme', [delivery.giverName, delivery.giverPosition ?? '', delivery.giverUnit ?? ''], W - M - 220, 220);
  s.y -= 70;
  if (delivery.notes) s.box('NOTA', delivery.notes, 44);
  return s.finish(santiagoToday());
}

export async function loanPdf(loan: Loan) {
  const s = await Sheet.create();
  s.text('Facultad de Medicina', M, s.y - 12, { size: 9, font: s.bold });
  s.text('Universidad Católica del Norte', M, s.y - 23, { size: 8, color: muted });
  s.dateBoxes(loan.loanedOn, W - M - 142, s.y); s.y -= 54;
  s.title(`INFORMACIÓN REQUERIDA N° ${loan.number}`);
  s.title('PRÉSTAMO TRANSITORIO DE BIENES'); s.y -= 10;
  const quantity = loan.items.reduce((sum, item) => sum + item.quantity, 0);
  s.labelled([
    ['DATOS', 'Equipo, Accesorio, Mueble, Maquinaria, Construcción, Etc.'], ['CANTIDAD', String(quantity)],
    ['DESCRIPCIÓN', loan.items.map(item => [item.description, item.serialNumber && `SN: ${item.serialNumber}`].filter(Boolean).join(' ')).join('\n')],
    ['UBICACIÓN', loan.location ?? ''], ['NOMBRE', loan.borrower.name], ['RUT', loan.borrower.rut ?? ''],
    ['DEVOLUCIÓN', loan.dueOn ? `Esperada el ${dateText(loan.dueOn)}` : 'Sin fecha definida'], ['FIRMA Y FECHA', '\n'],
  ]);
  s.y -= 10;
  s.y -= s.text('Recuerde seguir las reglas de seguridad del Plan de Seguridad de la UCN y lo indicado en el Reglamento Interno de Orden, Higiene y Seguridad: quien recibe bienes para el desempeño de sus labores responde de su buen uso, mantención y conservación. Se considera sólo el daño o deterioro por el uso normal.', M, s.y, { size: 7.5, color: muted, width: W - 2 * M }) + 10;
  s.box('MÁS DATOS: EQUIPO, ACCESORIO, MUEBLE, MAQUINARIA, CONSTRUCCIÓN, ETC.', [loan.items.map(item => `${item.code} · ${item.description}${itemDetail(item) ? ` · ${itemDetail(item)}` : ''}`).join('\n'), loan.notes].filter(Boolean).join('\n\n'), 70);
  s.y -= 6;
  s.y -= s.text('Indicar claramente: MARCA, MODELO y N° SERIE en los equipos computacionales y equipos varios; TIPO, MATERIAL y MEDIDAS en todo tipo de muebles.', M, s.y - 6, { size: 7.5, color: muted, width: W - 2 * M }) + 14;
  s.labelled([['AUTORIZADOR', loan.authorizerName], ['UNIDAD', loan.authorizerUnit ?? ''], ['FIRMA', '\n']]);
  return s.finish(santiagoToday());
}
