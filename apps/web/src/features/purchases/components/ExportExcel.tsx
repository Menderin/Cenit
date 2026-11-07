import { useId, useLayoutEffect, useRef, useState } from 'react';
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/csr/DownloadSimple';
import { toast } from 'sonner';
import type { PurchaseFilters, PurchaseListQuery } from '@cenit/contracts/purchases';
import { downloadPurchaseExport } from '../api/purchases.js';
import { HttpError } from '../../../shared/lib/http.js';
import { ContextualConfirm } from '../../../shared/components/ContextualConfirm.js';
import { useAuth } from '../../auth/model/session.js';

export type ExportOption = { id: string; label: string; detail: string; filters: PurchaseFilters };

/**
 * Excel download that first says what the file will hold and lets the person pick the scope.
 * Nothing is requested until they confirm; the request is cancelled if the session ends.
 */
export function ExportExcel({ options, sort = 'sentDateDesc', iconOnly = false, label = 'Descargar Excel', disabled = false }: {
  options: ExportOption[]; sort?: PurchaseListQuery['sort']; iconOnly?: boolean; label?: string; disabled?: boolean;
}) {
  const { status, session } = useAuth();
  const [open, setOpen] = useState(false), [choice, setChoice] = useState(options[0]?.id ?? '');
  const [exporting, setExporting] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null), busy = useRef(false), controller = useRef<AbortController | null>(null);
  const name = useId();
  useLayoutEffect(() => () => { controller.current?.abort(); }, [status, session?.account.id]);
  const selected = options.find(option => option.id === choice) ?? options[0];
  async function run(filters: PurchaseFilters) {
    if (busy.current) return;
    const current = new AbortController();
    controller.current = current; busy.current = true; setExporting(true); toast.dismiss('purchase-export');
    try {
      await downloadPurchaseExport(filters, { sort }, current.signal);
      current.signal.throwIfAborted();
      toast.success('Archivo descargado', { id: 'purchase-export', description: 'La exportación de compras está lista.' });
    } catch (error) {
      if (current.signal.aborted) return;
      if (error instanceof HttpError && error.status === 401) toast.error('La sesión venció', { description: 'Inicia sesión nuevamente para descargar el archivo.' });
      else toast.error('No se pudo descargar el archivo', { description: error instanceof Error ? error.message : 'Intenta nuevamente.' });
    } finally { controller.current = null; busy.current = false; setExporting(false); }
  }
  const text = exporting ? 'Generando Excel…' : label;
  return <>
    <button ref={trigger} className={`cenit-button${iconOnly ? ' cenit-button--icon' : ''}`} type="button" disabled={disabled || exporting} aria-busy={exporting} aria-haspopup="dialog" aria-expanded={open}
      aria-label={iconOnly ? text : undefined} title={iconOnly ? text : undefined} onClick={() => { setChoice(options[0]?.id ?? ''); setOpen(true); }}>
      <DownloadSimpleIcon size={18} aria-hidden="true" />{!iconOnly && text}
    </button>
    <ContextualConfirm wide open={open} origin={trigger.current} title="Descargar Excel" confirmLabel="Descargar archivo" cancelLabel="Cancelar"
      description="Un archivo con tres hojas: Compras, Ítems y Resumen. Los montos van tal como están guardados en Cenit."
      onCancel={() => setOpen(false)} onConfirm={() => { if (!selected) return; setOpen(false); void run(selected.filters); }}>
      {options.length > 1 ? <fieldset className="cenit-export-options"><legend>¿Qué compras incluir?</legend>
        {options.map(option => <label key={option.id}><input type="radio" name={name} value={option.id} checked={choice === option.id} onChange={() => setChoice(option.id)} /><span><strong>{option.label}</strong><small>{option.detail}</small></span></label>)}
      </fieldset> : selected && <p className="cenit-export-scope"><strong>{selected.label}</strong><small>{selected.detail}</small></p>}
    </ContextualConfirm>
  </>;
}
