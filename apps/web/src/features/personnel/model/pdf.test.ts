import { describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { commissionPdf, printCommissionImage, wrapCommissionText } from './pdf.js';

describe('texto del PDF provisional de comisión', () => {
  const measure = (text: string) => text.length;
  it('conserva palabras, tildes y saltos de línea', () => {
    expect(wrapCommissionText('Comisión de servicios\nUCN', 12, measure)).toEqual(['Comisión de', 'servicios', 'UCN']);
    expect(wrapCommissionText('', 12, measure)).toEqual(['']);
  });
  it('divide identificadores largos sin perder caracteres', () => {
    const lines = wrapCommissionText('12345678901234567890', 6, measure);
    expect(lines.every(line => line.length <= 6)).toBe(true);
    expect(lines.join('')).toBe('12345678901234567890');
  });
});

describe('salida carta de comisión', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  const sheet = { toDataURL: () => png } as HTMLCanvasElement;

  it('descarga exactamente una página carta', async () => {
    const blob = await commissionPdf(sheet);
    const pdf = await PDFDocument.load(await blob.arrayBuffer());
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  });

  it.each([false, true])('espera la imagen y respeta cancelación=%s', async cancelled => {
    let ready!: () => void;
    const decoded = new Promise<void>(resolve => { ready = resolve; });
    const view = Object.assign(new EventTarget(), {
      focus: vi.fn(), print: vi.fn(), requestAnimationFrame: (callback: () => void) => callback(),
    });
    const frame = {
      title: '', style: { cssText: '' }, srcdoc: '', onload: async () => {},
      setAttribute: vi.fn(), remove: vi.fn(), contentWindow: view,
      contentDocument: { querySelector: () => ({ decode: () => decoded }) },
    };
    vi.stubGlobal('document', { createElement: () => frame, body: { append: vi.fn() } });
    try {
      const controller = new AbortController(), onError = vi.fn();
      printCommissionImage(sheet, onError, controller.signal);
      const pending = frame.onload();
      expect(view.print).not.toHaveBeenCalled();
      if (cancelled) controller.abort();
      ready();
      await pending;
      expect(view.print).toHaveBeenCalledTimes(cancelled ? 0 : 1);
      if (!cancelled) {
        expect(onError).not.toHaveBeenCalled();
        expect(frame.remove).not.toHaveBeenCalled();
        view.dispatchEvent(new Event('afterprint'));
      }
      expect(frame.remove).toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});
