import { afterEach, describe, expect, it, vi } from 'vitest';
import { printPdf } from './pdf.js';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('impresión del PDF recibido', () => {
  function setup() {
    const view = Object.assign(new EventTarget(), { focus: vi.fn(), print: vi.fn() });
    const frame = { title: '', style: { cssText: '' }, src: '', onload: () => {}, onerror: () => {},
      setAttribute: vi.fn(), remove: vi.fn(), contentWindow: view };
    const browser = new EventTarget();
    const revoke = vi.fn();
    vi.stubGlobal('window', browser);
    vi.stubGlobal('document', { createElement: () => frame, body: { append: vi.fn() } });
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:commission', revokeObjectURL: revoke });
    return { frame, view, browser, revoke };
  }
  it('imprime el PDF del servidor y libera el documento después del diálogo', () => {
    const { frame, view, browser, revoke } = setup(), controller = new AbortController(), onError = vi.fn();
    printPdf(new Blob(['%PDF-test']), 'Imprimir documento', onError, controller.signal);
    expect(frame.src).toBe('blob:commission');
    expect(view.print).not.toHaveBeenCalled();
    frame.onload();
    expect(view.print).toHaveBeenCalledOnce();
    browser.dispatchEvent(new Event('afterprint'));
    expect(frame.remove).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:commission');
    expect(onError).not.toHaveBeenCalled();
  });
  it('informa el fallo y libera el documento si el visor no carga', () => {
    vi.useFakeTimers();
    const { frame, view, revoke } = setup(), controller = new AbortController(), onError = vi.fn();
    printPdf(new Blob(['%PDF-test']), 'Imprimir documento', onError, controller.signal);
    vi.advanceTimersByTime(10_000);
    expect(onError).toHaveBeenCalledOnce();
    expect(frame.remove).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledOnce();
    frame.onload();
    expect(view.print).not.toHaveBeenCalled();
  });
  it('cancela la impresión pendiente al abandonar la sesión', () => {
    const { frame, view, revoke } = setup(), controller = new AbortController(), onError = vi.fn();
    printPdf(new Blob(['%PDF-test']), 'Imprimir documento', onError, controller.signal);
    controller.abort(); frame.onload();
    expect(view.print).not.toHaveBeenCalled();
    expect(frame.remove).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });
});
