import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { ImageIcon } from '@phosphor-icons/react/dist/csr/Image';
import { createReviewDraft, type ExtractionResponse, type ExtractionReviewDraft } from '@cenit/contracts/purchases';
import { extractPurchase } from '../api/purchases.js';
import { PurchaseReviewEditor } from '../components/PurchaseReviewEditor.js';
import { usePurchaseTransfer } from '../model/transfer.js';
import { useGuardChanges, usePurchaseGuard } from '../model/guard.js';
import { usePurchaseReturnTo } from '../model/location.js';
import { inspectCapture, type SelectedCapture } from '../model/capture-file.js';
import '../records.css';
import '../review.css';
import '../capture.css';

export function PurchaseCapture() {
  const [selected, setSelected] = useState<SelectedCapture | null>(null);
  const [original, setOriginal] = useState<ExtractionResponse | null>(null);
  const [draft, setDraft] = useState<ExtractionReviewDraft | null>(null);
  const [busy, setBusy] = useState(false), [checking, setChecking] = useState(false), [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null), preview = useRef<string | null>(null);
  const fileTrigger = useRef<HTMLElement | null>(null), processTrigger = useRef<HTMLButtonElement>(null);
  const request = useRef<AbortController | null>(null), generation = useRef(0);
  const transfer = usePurchaseTransfer(), guard = usePurchaseGuard(), returnTo = usePurchaseReturnTo(), navigate = useNavigate();
  const dirty = !!original && !!draft && JSON.stringify(draft) !== JSON.stringify(createReviewDraft(original));
  useGuardChanges(dirty, false, () => {
    if (dirty) { setOriginal(null); setDraft(null); }
  });

  useEffect(() => () => {
    generation.current++; request.current?.abort();
    if (preview.current) URL.revokeObjectURL(preview.current);
  }, []);

  function applyFile(file: File) {
    const current = ++generation.current;
    request.current?.abort();
    setBusy(false); setChecking(true); setError(''); setOriginal(null); setDraft(null);
    if (preview.current) URL.revokeObjectURL(preview.current);
    preview.current = null; setSelected(null);
    void inspectCapture(file).then(next => {
      if (current !== generation.current) { URL.revokeObjectURL(next.url); return; }
      preview.current = next.url; setSelected(next);
    }).catch(problem => {
      if (current === generation.current) setError(problem instanceof Error ? problem.message : 'No se pudo abrir la imagen.');
    }).finally(() => { if (current === generation.current) setChecking(false); });
  }

  function select(file?: File, origin: HTMLElement | null = null) {
    if (!file) return;
    guard.request(() => applyFile(file), origin, { title: 'Cambiar captura', description: 'Se descartarán los datos corregidos de esta captura.', confirmLabel: 'Descartar y cambiar' });
  }

  async function runExtraction() {
    if (!selected) return;
    const current = ++generation.current, controller = new AbortController();
    request.current?.abort(); request.current = controller;
    setBusy(true); setError('');
    try {
      const result = await extractPurchase(selected.file, controller.signal);
      if (current !== generation.current) return;
      setOriginal(result); setDraft(createReviewDraft(result));
    } catch (problem) {
      if (current === generation.current && !controller.signal.aborted) setError(problem instanceof Error ? problem.message : 'No se pudo procesar la captura.');
    } finally { if (current === generation.current) setBusy(false); }
  }

  function process() {
    if (!selected || busy || checking) return;
    guard.request(() => { void runExtraction(); }, processTrigger.current, { title: 'Volver a extraer datos', description: 'Se descartarán tus correcciones y se procesará nuevamente la captura.', confirmLabel: 'Descartar y extraer' });
  }

  return <section className="purchase-records purchase-review purchase-capture">
    <Link className="purchase-back-link" to={returnTo} onClick={event => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      guard.request(() => navigate(returnTo), event.currentTarget);
    }}><ArrowLeftIcon size={13} aria-hidden="true" />Volver a solicitudes</Link>
    <div className="purchase-page-heading"><div><h1>Revisar captura</h1><p>Sube una captura de la solicitud de compra y revisa los datos antes de guardarlos.</p></div><span className="purchase-origin-badge">Procesamiento local</span></div>
    <div className="capture-upload">
      <div><label htmlFor="capture-file"><ImageIcon size={18} aria-hidden="true" />Captura de la solicitud de compra</label><p id="capture-limits">PNG o JPEG · hasta 5 MiB y 20 megapíxeles.</p>
        <input hidden ref={input} id="capture-file" type="file" accept="image/png,image/jpeg" aria-describedby="capture-limits" onChange={event => {
          const file = event.target.files?.[0]; event.target.value = '';
          select(file, fileTrigger.current); fileTrigger.current = null;
        }} />
        <button type="button" aria-describedby="capture-limits" onClick={event => { fileTrigger.current = event.currentTarget; input.current?.click(); }}>{selected ? 'Cambiar captura' : 'Seleccionar imagen'}</button>
      </div>
      <div className="capture-upload__actions"><button ref={processTrigger} type="button" className="purchase-save" disabled={!selected || busy || checking} onClick={process}>{busy ? 'Analizando captura…' : error && selected ? 'Reintentar' : 'Extraer datos'}</button></div>
    </div>
    <div aria-live="polite" aria-atomic="true">{checking && <p role="status">Comprobando imagen…</p>}{busy && <p role="status">Analizando captura… Puedes cambiar la imagen para cancelar.</p>}</div>
    {error && <div className="purchase-state" role="alert">{error}{original && <p>Se conservan los datos de la extracción anterior.</p>}</div>}
    <div className="capture-workspace">
      {selected && <figure className="capture-preview"><figcaption><strong>{selected.file.name}</strong><span>{selected.width} × {selected.height} px · {(selected.file.size / 1024).toFixed(0)} KiB</span></figcaption><img src={selected.url} alt="Vista previa de la captura seleccionada" /><p>Comprueba que se lean la cabecera y los ítems.</p></figure>}
      {original && draft && <div className="capture-review" aria-busy={busy}>
        <div className="capture-layout" role="status">{original.data.captureLayout!.status === 'compatible' ? 'Formato compatible' : 'Captura parcial: revisa los datos recuperados'}<p>La comprobación reconoce el formato; no acredita autenticidad ni conexión con Oracle.</p></div>
        <fieldset className="capture-review__contents" disabled={busy}>
          <PurchaseReviewEditor key={original.data.extractionId} original={original} draft={draft} onChange={setDraft} onContinue={values => {
            if (!original.data.origin) return;
            if (Date.now() - Date.parse(original.data.origin.processedAt) >= 7200000) { setError('La referencia de captura venció. Vuelve a extraer los datos antes de continuar.'); return; }
            transfer.put(values, original.data.origin);
            guard.leave(() => navigate('/administracion/compras/nueva', { state: { purchasesReturnTo: returnTo } }));
          }} />
        </fieldset>
      </div>}
    </div>
  </section>;
}
