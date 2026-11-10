import { PDFDocument } from 'pdf-lib';
import template from '../components/commission-template.svg?raw';

// Respeta saltos y palabras; también admite identificadores largos sin espacios.
export function wrapCommissionText(text: string, width: number, measure: (value: string) => number) {
  return text.split('\n').flatMap(paragraph => {
    const lines: string[] = [];
    let line = '';
    for (const character of paragraph) {
      if (line && measure(line + character) > width) {
        const space = line.lastIndexOf(' ');
        if (space > 0) { lines.push(line.slice(0, space)); line = line.slice(space + 1); }
        else { lines.push(line); line = ''; }
      }
      line += character;
    }
    lines.push(line);
    return lines;
  });
}

/** Composición común para descargar e imprimir, sin persistir ni enviar datos. */
export async function commissionImage(paper: HTMLElement): Promise<HTMLCanvasElement> {
  await document.fonts.ready;
  if (paper.querySelector('[data-overflow="true"]')) throw new Error('Texto fuera de la plantilla.');
  const frame = paper.querySelector<HTMLElement>('.commission-paper__canvas')!.getBoundingClientRect();
  const ratio = 910 / frame.width;
  const fields = [...paper.querySelectorAll<HTMLElement>('.commission-paper__value')].map(field => {
    const span = field.firstElementChild as HTMLElement, rect = field.getBoundingClientRect();
    const style = getComputedStyle(span);
    return { text: getComputedStyle(field).textTransform === 'uppercase' ? (span.textContent ?? '').toLocaleUpperCase('es') : (span.textContent ?? ''),
      x: (rect.left - frame.left) * ratio, y: (rect.top - frame.top) * ratio,
      width: rect.width * ratio, height: rect.height * ratio,
      font: `${style.fontWeight} ${parseFloat(style.fontSize) * ratio}px ${style.fontFamily}`,
      lineHeight: parseFloat(style.lineHeight) * ratio, align: getComputedStyle(field).textAlign };
  });
  const canvas = document.createElement('canvas');
  // 3× la geometría de la plantilla: más de 300 ppp en la página carta.
  canvas.width = 2730; canvas.height = 3834;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo preparar la imagen del documento.');
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(template)}`;
  await image.decode();
  context.scale(3, 3);
  context.fillStyle = '#fff'; context.fillRect(0, 0, 910, 1278);
  context.drawImage(image, 0, 0, 910, 1278);
  context.fillStyle = '#000'; context.textBaseline = 'middle';
  for (const field of fields) {
    context.font = field.font;
    const lines = wrapCommissionText(field.text, field.width - 4 * ratio, text => context.measureText(text).width);
    if (lines.length * field.lineHeight > field.height + 1) throw new Error('Texto fuera de la plantilla.');
    context.textAlign = field.align === 'left' ? 'left' : 'center';
    const x = field.x + (field.align === 'left' ? 2 * ratio : field.width / 2);
    const top = field.y + (field.height - lines.length * field.lineHeight) / 2;
    lines.forEach((line, index) => context.fillText(line, x, top + (index + 0.5) * field.lineHeight));
  }
  // Hoja carta completa a 300 ppp, incluida la marca y los márgenes del PDF.
  const sheet = document.createElement('canvas');
  sheet.width = 2550; sheet.height = 3300;
  const output = sheet.getContext('2d');
  if (!output) throw new Error('No se pudo preparar la hoja.');
  output.scale(2550 / 612, 3300 / 792);
  output.fillStyle = '#fff'; output.fillRect(0, 0, 612, 792);
  const scale = Math.min((612 - 72) / 910, (792 - 72 - 14) / 1278);
  output.drawImage(canvas, (612 - 910 * scale) / 2, 36, 910 * scale, 1278 * scale);
  output.fillStyle = '#000'; output.font = '6px Arial, sans-serif'; output.textAlign = 'center';
  output.fillText('BORRADOR', 306, 756);
  return sheet;
}

/** PDF provisional local: una página carta fija. */
export async function commissionPdf(sheet: HTMLCanvasElement): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const picture = await pdf.embedPng(sheet.toDataURL('image/png'));
  page.drawImage(picture, { x: 0, y: 0, width: 612, height: 792 });
  const bytes = await pdf.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}


export function printCommissionImage(sheet: HTMLCanvasElement, onError: () => void, signal: AbortSignal) {
  const frame = document.createElement('iframe');
  frame.title = 'Imprimir comisión de servicios';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:816px;height:1056px;border:0;pointer-events:none';
  const cleanup = () => { frame.remove(); signal.removeEventListener('abort', cleanup); };
  signal.addEventListener('abort', cleanup, { once: true });
  frame.onload = async () => {
    try {
      const view = frame.contentWindow, image = frame.contentDocument?.querySelector('img');
      if (!view || !image) throw new Error('Impresión no disponible.');
      await image.decode();
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()));
      signal.throwIfAborted();
      view.addEventListener('afterprint', cleanup, { once: true });
      view.focus();
      view.print();
    } catch { cleanup(); onError(); }
  };
  frame.onerror = () => { cleanup(); onError(); };
  // HTML aislado: evita depender del visor PDF oculto y de los estilos de la app.
  frame.srcdoc = `<!doctype html><html lang="es"><head><title>Comisión de servicios</title><style>
    @page { size: letter portrait; margin: 0; }
    html, body { margin: 0; padding: 0; }
    img { display: block; width: 8.5in; height: 11in; }
  </style></head><body><img alt="Comisión de servicios" src="${sheet.toDataURL('image/png')}"></body></html>`;
  signal.throwIfAborted();
  document.body.append(frame);
}
