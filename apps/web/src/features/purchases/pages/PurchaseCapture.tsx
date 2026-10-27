import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { UploadSimpleIcon } from '@phosphor-icons/react/dist/csr/UploadSimple';
import { createReviewDraft, type ExtractionResponse } from '@cenit/contracts/purchases';
import { extractPurchase } from '../api/purchases.js';
import { PurchaseForm } from '../components/PurchaseForm.js';
import { CapturePreview } from '../components/CapturePreview.js';
import { usePurchaseDraft } from '../model/drafts.js';
import { useAuth } from '../../auth/model/session.js';
import { emptyDraft } from '../model/fields.js';
import { usePurchaseGuard } from '../model/guard.js';
import { usePurchaseReturnTo } from '../model/location.js';
import { inspectCapture, type SelectedCapture } from '../model/capture-file.js';
import '../records.css';
import '../review.css';
import '../capture.css';

export function PurchaseCapture() {
  const snapshot = usePurchaseDraft(), accountId = useAuth().session!.account.id;
  const [restored] = useState(() => snapshot.current?.accountId === accountId && snapshot.current.kind === 'capture' ? snapshot.current : null);
  const [selected, setSelected] = useState<SelectedCapture | null>(() => restored?.file ? { file: restored.file, width: restored.width, height: restored.height, url: URL.createObjectURL(restored.file) } : null);
  const [original, setOriginal] = useState<ExtractionResponse | null>(restored?.original ?? null);
  const [draft, setDraft] = useState(() => restored?.draft ?? emptyDraft());
  const [lineKeys, setLineKeys] = useState(restored?.lineKeys ?? [] as string[]);
  const [operationId, setOperationId] = useState(() => restored?.operationId ?? crypto.randomUUID());
  const [busy, setBusy] = useState(false), [checking, setChecking] = useState(false), [saving, setSaving] = useState(false);
  const [error, setError] = useState(restored?.file && !restored.original ? 'El análisis se interrumpió. Puedes reintentarlo.' : '');
  const [dragging, setDragging] = useState(false), [activePath, setActivePath] = useState('');
  const input = useRef<HTMLInputElement>(null), workspace = useRef<HTMLDivElement>(null);
  const preview = useRef<string | null>(selected?.url ?? null), saved = useRef(false);
  const request = useRef<AbortController | null>(null), generation = useRef(0);
  const fileTrigger = useRef<HTMLElement | null>(null);
  const guard = usePurchaseGuard(), returnTo = usePurchaseReturnTo(), navigate = useNavigate();
  useEffect(() => {
    if (!saved.current) snapshot.current = { kind: 'capture', accountId, file: selected?.file ?? null, width: selected?.width ?? 0, height: selected?.height ?? 0, original, draft, lineKeys, operationId };
  }, [snapshot, accountId, selected, original, draft, lineKeys, operationId]);
  useEffect(() => () => { generation.current++; request.current?.abort(); if (preview.current) URL.revokeObjectURL(preview.current); }, []);

  async function runExtraction(file: File) {
    const current = ++generation.current, controller = new AbortController();
    request.current?.abort(); request.current = controller; setBusy(true); setError('');
    try {
      const result = await extractPurchase(file, controller.signal);
      if (current !== generation.current) return;
      setOriginal(result); setDraft(createReviewDraft(result)); setLineKeys(result.data.lines.map((_, index) => `capture-${index}`)); setActivePath('');
    } catch (problem) {
      if (current === generation.current && !controller.signal.aborted) setError(problem instanceof Error ? problem.message : 'No se pudo procesar la captura.');
    } finally { if (current === generation.current) setBusy(false); }
  }
  async function applyFile(file: File) {
    const current = ++generation.current;
    request.current?.abort(); setBusy(false); setChecking(true); setError(''); setOriginal(null); setDraft(emptyDraft()); setLineKeys([]); setActivePath(''); setOperationId(crypto.randomUUID());
    if (preview.current) URL.revokeObjectURL(preview.current);
    preview.current = null; setSelected(null);
    try {
      const next = await inspectCapture(file);
      if (current !== generation.current) { URL.revokeObjectURL(next.url); return; }
      preview.current = next.url; setSelected(next); setChecking(false); void runExtraction(next.file);
    } catch (problem) {
      if (current === generation.current) { setError(problem instanceof Error ? problem.message : 'No se pudo abrir la imagen.'); setChecking(false); }
    }
  }
  function select(files: FileList | File[], origin: HTMLElement | null) {
    if (saving || !files.length) return;
    if (files.length !== 1) { setError('Selecciona una sola imagen PNG o JPEG.'); return; }
    const file = files[0]!;
    guard.request(() => { void applyFile(file); }, origin, { title: 'Cambiar captura', description: 'Se descartarán los datos de esta captura.', confirmLabel: 'Descartar y cambiar' });
  }
  function chooseRegion(path: string) {
    const field = Array.from(workspace.current?.querySelectorAll<HTMLElement>('[data-source-path]') ?? []).find(element => element.dataset.sourcePath === path);
    if (!field) return;
    let section = field.closest('details'); while (section) { section.open = true; section = section.parentElement?.closest('details') ?? null; }
    setActivePath(path); field.focus({ preventScroll: true });
  }
  return <section className="purchase-records purchase-review purchase-capture">
    <Link className="purchase-back-link" to={returnTo} onClick={event => { if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); guard.request(() => navigate(returnTo), event.currentTarget); }}><ArrowLeftIcon size={16} aria-hidden="true" />Volver al registro</Link>
    <div className="purchase-page-heading"><div><h1>Registrar desde una captura</h1><p>Compara los datos con la imagen, corrige lo necesario y guarda el registro.</p></div></div>
    <input hidden ref={input} id="capture-file" type="file" accept="image/png,image/jpeg" aria-label="Captura de la solicitud de compra" onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; select(files, fileTrigger.current); }} />
    <div className="capture-status-row">
    <div className="capture-status" aria-live="polite" aria-atomic="true">
      {checking && <p role="status">Comprobando imagen…</p>}
      {busy && <p className="capture-processing" role="status">Analizando captura… Puedes cambiar la imagen para cancelar.</p>}
      {error && <div className="purchase-state" role="alert">{error}{original && <p>Se conservan los datos de la extracción anterior.</p>}</div>}
    </div>
    {selected && <div className="capture-actions">
      <button type="button" disabled={saving} onClick={event => { fileTrigger.current = event.currentTarget; input.current?.click(); }}>Cambiar captura</button>
      <button type="button" disabled={saving || checking || busy} onClick={event => guard.request(() => { void runExtraction(selected.file); }, event.currentTarget, { title: 'Volver a extraer datos', description: 'Se reemplazarán tus correcciones con una nueva extracción.', confirmLabel: 'Descartar y extraer' })}>{busy ? 'Analizando…' : error ? 'Reintentar extracción' : 'Volver a extraer'}</button>
    </div>}
    </div>
    <div ref={workspace} className="capture-workspace">
      <div className={`capture-image-area${dragging ? ' capture-image-area--dragging' : ''}`} onDragOver={event => { event.preventDefault(); if (!saving) setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); select(event.dataTransfer.files, fileTrigger.current); }}>
        {selected ? <CapturePreview selected={selected} regions={(original?.data.regions ?? []).filter(region => !region.path.startsWith('/lines/') || lineKeys.includes(`capture-${region.path.split('/')[2]}`))} activePath={activePath} onSelect={chooseRegion} /> : <button type="button" className="capture-placeholder capture-drop" disabled={checking} onClick={event => { fileTrigger.current = event.currentTarget; input.current?.click(); }}><UploadSimpleIcon size={40} aria-hidden="true" /><strong>Arrastra la imagen aquí</strong><span>O haz clic para seleccionarla desde tu equipo</span><small>PNG o JPEG · hasta 5 MiB y 20 megapíxeles</small></button>}
      </div>
      <div className="capture-review" aria-busy={busy || checking}>
        {original && <div className="capture-layout" role="status"><strong>{original.data.captureLayout?.status === 'compatible' ? 'Formato compatible' : 'Captura parcial'}</strong><span>Revisa los datos antes de guardar.</span></div>}
        {selected && <PurchaseForm draft={draft} onChange={setDraft} lineKeys={lineKeys} onLineKeysChange={setLineKeys} operationId={operationId} origin={original?.data.origin ?? null} original={original ?? undefined}
          activePath={activePath} onFieldFocus={setActivePath} disabled={!original || busy || checking} onSavingChange={setSaving} returnTo={returnTo} onSaved={() => { saved.current = true; }} />}
        {!selected && <div className="capture-placeholder capture-placeholder--form"><h2>Datos de la compra</h2><p>Aquí podrás revisar y completar la cabecera y los ítems.</p><div className="capture-placeholder__fields" aria-hidden="true"><span /><span /><span /><span /></div></div>}
      </div>
    </div>
  </section>;
}
