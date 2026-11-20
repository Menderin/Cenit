import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Value } from '@sinclair/typebox/value';
import { PersonnelPdfErrorsSchema } from '@cenit/contracts';
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/csr/DownloadSimple';
import { PrinterIcon } from '@phosphor-icons/react/dist/csr/Printer';
import { HttpError } from '../../../shared/lib/http.js';
import { useAuth } from '../../auth/model/session.js';
import { printPdf } from '../model/pdf.js';

export type PdfAction = 'download' | 'print';

/**
 * Pide el PDF al servidor y lo descarga o imprime. Cancela la respuesta pendiente al cambiar la sesión;
 * los errores por campo se entregan a la pantalla, que decide a qué sección volver.
 */
export function usePersonnelPdf({ request, fileName, printTitle, onFieldErrors }: {
  request: (signal: AbortSignal) => Promise<Blob>; fileName: () => string; printTitle: string;
  onFieldErrors: (fields: Record<string, string>) => boolean;
}) {
  const [action, setAction] = useState<PdfAction | null>(null);
  const [message, setMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null), busy = useRef(false);
  const { status, session } = useAuth();
  useLayoutEffect(() => () => { abortRef.current?.abort(); }, [status, session?.account.id]);

  async function run(next: PdfAction) {
    if (busy.current) return;
    setMessage('');
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller; busy.current = true; setAction(next);
    try {
      const blob = await request(controller.signal);
      controller.signal.throwIfAborted();
      if (next === 'print') {
        printPdf(blob, printTitle, () => {
          if (!controller.signal.aborted) setMessage('No pudimos abrir la impresión. Descarga el documento para imprimirlo.');
        }, controller.signal);
      } else {
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        const revoke = () => URL.revokeObjectURL(url);
        controller.signal.addEventListener('abort', revoke, { once: true });
        link.href = url; link.download = `${fileName()}.pdf`;
        document.body.append(link); link.click(); link.remove();
        window.setTimeout(() => { controller.signal.removeEventListener('abort', revoke); revoke(); }, 60_000);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof HttpError && error.status === 422 && Value.Check(PersonnelPdfErrorsSchema, error.body) && onFieldErrors(error.body.error.fields)) {
        setMessage('Revisa los campos indicados. El formulario conserva tus datos.');
        return;
      }
      setMessage(error instanceof HttpError ? `${error.message} El formulario conserva tus datos.` : 'No pudimos preparar el documento. El formulario conserva tus datos.');
    } finally { busy.current = false; setAction(null); }
  }

  const abort = useCallback(() => { abortRef.current?.abort(); }, []);
  const cancel = useCallback(() => { abortRef.current?.abort(); setMessage('Preparación cancelada. El formulario conserva tus datos.'); }, []);
  return { action, busy, message, setMessage, run, abort, cancel };
}

export function PdfActions({ pdf }: { pdf: ReturnType<typeof usePersonnelPdf> }) {
  const downloading = pdf.action === 'download', printing = pdf.action === 'print';
  return <div className="personnel-download__actions">
    <button type="button" className={`cenit-button${printing ? ' cenit-button--quiet' : ''}`} onClick={printing ? pdf.cancel : () => { void pdf.run('download'); }} disabled={downloading} aria-busy={downloading}>
      {printing ? 'Cancelar' : <><DownloadSimpleIcon size={16} aria-hidden="true" />{downloading ? 'Preparando…' : 'Descargar'}</>}
    </button>
    <button type="button" className={`cenit-button${downloading ? ' cenit-button--quiet' : ' cenit-button--primary'}`} onClick={downloading ? pdf.cancel : () => { void pdf.run('print'); }} disabled={printing} aria-busy={printing}>
      {downloading ? 'Cancelar' : <><PrinterIcon size={16} aria-hidden="true" />{printing ? 'Preparando…' : 'Imprimir'}</>}
    </button>
  </div>;
}
