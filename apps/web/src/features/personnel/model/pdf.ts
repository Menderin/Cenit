/** Imprime el PDF recibido, sin reconstruir ni modificar el documento. */
export function printCommissionPdf(blob: Blob, onError: () => void, signal: AbortSignal) {
  signal.throwIfAborted();
  const url = URL.createObjectURL(blob), frame = document.createElement('iframe');
  frame.title = 'Imprimir comisión de servicios';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:816px;height:1056px;border:0;pointer-events:none';
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    signal.removeEventListener('abort', cleanup);
    window.removeEventListener('afterprint', cleanup);
    frame.contentWindow?.removeEventListener('afterprint', cleanup);
    frame.remove(); URL.revokeObjectURL(url);
  };
  signal.addEventListener('abort', cleanup, { once: true });
  window.addEventListener('afterprint', cleanup, { once: true });
  frame.onload = () => {
    try {
      signal.throwIfAborted();
      const view = frame.contentWindow;
      if (!view) throw new Error('Impresión no disponible.');
      view.addEventListener('afterprint', cleanup, { once: true });
      view.focus(); view.print();
    } catch { cleanup(); if (!signal.aborted) onError(); }
  };
  frame.onerror = () => { cleanup(); if (!signal.aborted) onError(); };
  frame.src = url;
  document.body.append(frame);
}
