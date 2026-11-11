import { afterEach, describe, expect, it, vi } from 'vitest';
import { printCommissionPdf } from './pdf.js';

afterEach(() => vi.unstubAllGlobals());

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
    printCommissionPdf(new Blob(['%PDF-test']), onError, controller.signal);
    expect(frame.src).toBe('blob:commission');
    expect(view.print).not.toHaveBeenCalled();
    frame.onload();
    expect(view.print).toHaveBeenCalledOnce();
    browser.dispatchEvent(new Event('afterprint'));
    expect(frame.remove).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:commission');
    expect(onError).not.toHaveBeenCalled();
  });
  it('cancela la impresión pendiente al abandonar la sesión', () => {
    const { frame, view, revoke } = setup(), controller = new AbortController(), onError = vi.fn();
    printCommissionPdf(new Blob(['%PDF-test']), onError, controller.signal);
    controller.abort(); frame.onload();
    expect(view.print).not.toHaveBeenCalled();
    expect(frame.remove).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });
});
