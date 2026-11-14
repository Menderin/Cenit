/** Imprime el PDF recibido, sin reconstruir ni modificar el documento. */
export function printPdf(blob: Blob, title: string, onError: () => void, signal: AbortSignal) {
  signal.throwIfAborted();
  const url = URL.createObjectURL(blob), frame = document.createElement('iframe');
  frame.title = title;
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:816px;height:1056px;border:0;pointer-events:none';
  let closed = false, view: Window | null = null;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timeout);
    signal.removeEventListener('abort', cleanup);
    window.removeEventListener('afterprint', cleanup);
    try { view?.removeEventListener('afterprint', cleanup); } catch { /* El visor puede cambiar de origen. */ }
    frame.remove(); URL.revokeObjectURL(url);
  };
  const timeout = setTimeout(() => { cleanup(); if (!signal.aborted) onError(); }, 10_000);
  signal.addEventListener('abort', cleanup, { once: true });
  window.addEventListener('afterprint', cleanup, { once: true });
  frame.onload = () => {
    if (closed) return;
    clearTimeout(timeout);
    try {
      signal.throwIfAborted();
      view = frame.contentWindow;
      if (!view) throw new Error('Impresión no disponible.');
      view.addEventListener('afterprint', cleanup, { once: true });
      view.focus(); view.print();
    } catch { cleanup(); if (!signal.aborted) onError(); }
  };
  frame.onerror = () => { cleanup(); if (!signal.aborted) onError(); };
  frame.src = url;
  document.body.append(frame);
}
