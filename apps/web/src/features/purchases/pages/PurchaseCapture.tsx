import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, parsePath, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { ImagesIcon } from '@phosphor-icons/react/dist/csr/Images';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { CircleNotchIcon } from '@phosphor-icons/react/dist/csr/CircleNotch';
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { draftFromExtraction, emptyDraft, recordDateFromFileName, type CaptureDateSource, type ContractProblem, type RecordSources } from '@cenit/contracts/purchases';
import { createPurchase, extractPurchase } from '../api/purchases.js';
import { CaptureLens } from '../components/CaptureLens.js';
import { CapturePreview } from '../components/CapturePreview.js';
import { RecordForm } from '../components/RecordForm.js';
import { useAuth } from '../../auth/model/session.js';
import { usePurchaseDraft, type CaptureItem } from '../model/drafts.js';
import { useGuardChanges, usePurchaseGuard } from '../model/guard.js';
import { usePurchaseReturnTo } from '../model/location.js';
import { inspectCapture } from '../model/capture-file.js';
import { captureSourcePath } from '../model/fields.js';
import { payloadProblems, preparePayload, todayInSantiago } from '../model/submit.js';
import '../records.css';
import '../capture.css';

const pending = (item: CaptureItem) => item.status !== 'saved';
const statusText = (item: CaptureItem) => item.status === 'saved' ? 'Guardada' : item.status === 'waiting' ? 'En espera' : item.status === 'reading' ? 'Leyendo la captura…'
  : item.status === 'failed' && !item.manual ? 'No se pudo leer' : missingRut(item) ? 'RUT sin dato · opcional' : 'Lista para guardar';
const missingRut = (item: CaptureItem) => !item.manual && !item.draft.record.rut;
function manualDraft(file: File) {
  const draft = emptyDraft(), namedDate = recordDateFromFileName(file.name);
  draft.record.recordDate = namedDate ?? todayInSantiago();
  const dateSource: CaptureDateSource = namedDate ? 'filename' : 'today';
  const sources: RecordSources = { recordDate: 'suggested' };
  return { draft, dateSource, sources };
}

export function PurchaseCapture() {
  const snapshot = usePurchaseDraft(), accountId = useAuth().session!.account.id, client = useQueryClient();
  const guard = usePurchaseGuard(), returnTo = usePurchaseReturnTo(), navigate = useNavigate();
  const returnSearch = parsePath(returnTo).search;
  const [restored] = useState(() => snapshot.current?.accountId === accountId && snapshot.current.kind === 'capture' ? snapshot.current : null);
  // Una lectura interrumpida (recarga de la vista o cambio de pestaña) vuelve a la cola de espera.
  const [items, setItems] = useState<CaptureItem[]>(() => (restored?.items ?? []).map(item => item.status === 'reading' ? { ...item, status: 'waiting' } : item));
  const [selected, setSelected] = useState<string | null>(restored?.selected ?? null);
  const [problems, setProblems] = useState<ContractProblem[]>([]);
  const [notice, setNotice] = useState(''), [adding, setAdding] = useState(false), [dragging, setDragging] = useState(false), [activePath, setActivePath] = useState('');
  const input = useRef<HTMLInputElement>(null), workspace = useRef<HTMLDivElement>(null);
  const stageHeading = useRef<HTMLHeadingElement>(null);
  const focusNext = useRef<'move' | 'reading' | null>(null);
  const controllers = useRef(new Map<string, AbortController>()), urls = useRef(new Map<string, string>()), active = useRef(true);
  const url = (item: CaptureItem) => { let value = urls.current.get(item.key); if (!value) { value = URL.createObjectURL(item.file); urls.current.set(item.key, value); } return value; };
  const change = (key: string, patch: Partial<CaptureItem>) => setItems(list => list.map(item => item.key === key ? { ...item, ...patch } : item));

  useEffect(() => { active.current = true; return () => {
    active.current = false;
    for (const controller of controllers.current.values()) controller.abort();
    for (const value of urls.current.values()) URL.revokeObjectURL(value);
  }; }, []);
  useEffect(() => { snapshot.current = items.length ? { kind: 'capture', accountId, items, selected } : null; }, [snapshot, accountId, items, selected]);
  // El lector atiende una captura a la vez: se envían en orden y las demás esperan su turno.
  useEffect(() => {
    if (items.some(item => item.status === 'reading')) return;
    const next = items.find(item => item.status === 'waiting');
    if (!next) return;
    const controller = new AbortController(); controllers.current.set(next.key, controller);
    change(next.key, { status: 'reading', error: null });
    extractPurchase(next.file, controller.signal).then(result => {
      if (!active.current || controller.signal.aborted) return;
      change(next.key, { ...draftFromExtraction(result, next.file), status: 'ready', extraction: result, manual: false });
    }).catch((problem: unknown) => {
      if (!active.current || controller.signal.aborted) return;
      change(next.key, { status: 'failed', error: problem instanceof Error ? problem.message : 'No se pudo leer la captura.' });
    }).finally(() => controllers.current.delete(next.key));
  }, [items]);

  async function add(files: File[]) {
    if (!files.length) return;
    setAdding(true); setNotice('');
    const accepted: CaptureItem[] = [], rejected: string[] = [];
    for (const file of files) {
      try {
        const checked = await inspectCapture(file);
        const key = crypto.randomUUID(); urls.current.set(key, checked.url);
        accepted.push({ key, file, width: checked.width, height: checked.height, operationId: crypto.randomUUID(), status: 'waiting', error: null, extraction: null,
          ...manualDraft(file), manual: false, savedId: null });
      } catch (problem) { rejected.push(`${file.name}: ${problem instanceof Error ? problem.message : 'no se pudo abrir.'}`); }
    }
    if (!active.current) return;
    setAdding(false);
    if (rejected.length) setNotice(`${rejected.length === 1 ? 'No se agregó una imagen' : `No se agregaron ${rejected.length} imágenes`}. ${rejected.join(' ')}`);
    if (!accepted.length) return;
    if (!items.length) focusNext.current = 'move';
    setItems(list => [...list, ...accepted]);
    setSelected(current => current && items.some(item => item.key === current && pending(item)) ? current : accepted[0]!.key);
  }

  const current = items.find(item => item.key === selected) ?? null;
  const unsaved = items.filter(pending);
  const singleSavedId = items.length === 1 ? items[0]?.savedId : null;
  const position = current ? items.indexOf(current) + 1 : 0;
  function nextAfter(key: string, list = items) {
    const index = list.findIndex(item => item.key === key);
    return [...list.slice(index + 1), ...list.slice(0, index)].find(item => pending(item) && item.key !== key)?.key ?? null;
  }
  const mutation = useMutation({ mutationFn: createPurchase, onSuccess: (result, input) => {
    if (!active.current) return;
    void client.invalidateQueries({ queryKey: ['purchases'] });
    toast.success('Compra guardada', { description: `Solicitud ${result.data.record.requestNumber}` });
    const item = items.find(candidate => candidate.operationId === input.operationId);
    if (!item) return;
    setItems(list => list.map(candidate => candidate.key === item.key ? { ...candidate, status: 'saved', savedId: result.data.id } : candidate));
    focusNext.current = 'move';
    setSelected(nextAfter(item.key)); setProblems([]); setActivePath('');
  } });
  useGuardChanges(unsaved.length > 0 && !mutation.isPending, mutation.isPending, () => { snapshot.current = null; });

  useEffect(() => {
    if (!focusNext.current || mutation.isPending) return;
    if (focusNext.current === 'reading' && document.activeElement !== stageHeading.current && document.activeElement !== document.body) {
      focusNext.current = null;
      return;
    }
    const ready = current?.status === 'ready' || current?.manual;
    const waiting = current?.status === 'reading' || current?.status === 'waiting';
    if (waiting && focusNext.current === 'reading') return;
    focusNext.current = waiting ? 'reading' : null;
    const target = ready ? workspace.current?.querySelector<HTMLElement>('[data-mark="missing"] :is(input, textarea)')
      ?? (current && missingRut(current) ? workspace.current?.querySelector<HTMLElement>('#purchase-record-rut') : null)
      ?? workspace.current?.querySelector<HTMLElement>('#purchase-record-requestNumber') : stageHeading.current;
    target?.focus();
  }, [current, mutation.isPending]);
  function save() {
    if (!current || mutation.isPending || current.status === 'saved') return;
    if (current.status !== 'ready' && !current.manual) return;
    const payload = preparePayload(current.draft), errors = payloadProblems(payload);
    setProblems(errors); if (errors.length) return;
    const origin = current.manual || !current.extraction?.data.origin ? { type: 'manual' as const } : current.extraction.data.origin;
    mutation.mutate({ operationId: current.operationId, origin, ...payload });
  }
  function choose(key: string) { focusNext.current = null; setSelected(key); setProblems([]); setActivePath(''); mutation.reset(); }
  function remove(item: CaptureItem, origin: HTMLElement) {
    const drop = () => {
      controllers.current.get(item.key)?.abort();
      const next = nextAfter(item.key);
      setItems(list => list.filter(candidate => candidate.key !== item.key));
      const value = urls.current.get(item.key); if (value) { URL.revokeObjectURL(value); urls.current.delete(item.key); }
      if (selected === item.key) choose(next ?? '');
    };
    if (item.status === 'ready' || item.manual) guard.request(drop, origin, { title: 'Cancelar esta captura', description: 'No se guardará esta compra y la imagen sale de la lista. Cenit no conserva las capturas.', confirmLabel: 'Cancelar captura' });
    else drop();
  }
  function locate(path: string) {
    const key = (Object.entries(captureSourcePath) as [string, string][]).find(([, source]) => source === path)?.[0];
    const field = key ? workspace.current?.querySelector<HTMLElement>(`#purchase-record-${key}`) : null;
    field?.focus();
  }
  const regions = useMemo(() => current?.extraction?.data.regions ?? [], [current?.extraction]);
  const picker = <input hidden ref={input} type="file" multiple accept="image/png,image/jpeg" aria-label="Capturas de las solicitudes de compra"
    onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void add(files); }} />;
  const dropProps = { onDragOver: (event: React.DragEvent) => { event.preventDefault(); setDragging(true); },
    onDragLeave: (event: React.DragEvent) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); },
    onDrop: (event: React.DragEvent) => { event.preventDefault(); setDragging(false); void add(Array.from(event.dataTransfer.files)); } };
  const back = <Link className="capture-title__back" to={returnTo} aria-label="Volver al registro" title="Volver al registro" onClick={event => { if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); guard.request(() => navigate(returnTo), event.currentTarget); }}><ArrowLeftIcon size={18} aria-hidden="true" /></Link>;
  const alert = notice && <p className="capture-notice" role="alert"><WarningCircleIcon size={18} aria-hidden="true" /><span>{notice}</span>
    <button type="button" className="cenit-button cenit-button--icon cenit-button--quiet" aria-label="Cerrar el aviso" onClick={() => setNotice('')}><XIcon size={14} aria-hidden="true" /></button></p>;

  if (!items.length) return <section className="purchase-records capture-start">
    {picker}
    <div className="purchase-page-heading"><div><div className="capture-title">{back}<h1>Registrar capturas</h1></div><p>Sube las capturas de Oracle de las compras que aprobaste. Cenit lee cada una y tú las revisas antes de guardar. Las imágenes no se guardan: de cada compra queda sólo su fila.</p></div></div>
    <button type="button" className={`capture-dropzone${dragging ? ' capture-dropzone--over' : ''}`} disabled={adding} onClick={() => input.current?.click()} {...dropProps}>
      <span className="capture-dropzone__icon"><ImagesIcon size={30} aria-hidden="true" /></span>
      <strong>{adding ? 'Revisando las imágenes…' : 'Arrastra aquí tus capturas'}</strong>
      <span>Puedes soltar varias a la vez</span>
      <span className="cenit-button cenit-button--primary"><PlusIcon size={16} weight="bold" aria-hidden="true" />Elegir capturas</span>
      <small>PNG o JPG · hasta 5 MB cada una</small>
    </button>
    {alert}
    <ol className="capture-tips">
      <li><b>1</b><span><strong>Saca la captura completa</strong>Desde el título de la solicitud hasta la cuenta de cargo.</span></li>
      <li><b>2</b><span><strong>Súbelas todas juntas</strong>Cenit llena la fila de cada compra mientras sigues trabajando.</span></li>
      <li><b>3</b><span><strong>Revisa y guarda</strong>Una por una; con Enter pasas a la siguiente.</span></li>
    </ol>
    <Link className="capture-tips__manual" to="/administracion/compras/nueva" state={{ purchasesReturnTo: returnTo }}>¿Sin captura? Registrar a mano</Link>
  </section>;

  return <form className="purchase-records capture-queue-page" noValidate aria-busy={mutation.isPending} onSubmit={event => { event.preventDefault(); save(); }}>
    {picker}
    <div className="purchase-page-heading"><div className="capture-title">{back}<h1>Registrar capturas</h1>
      {unsaved.length > 0 && current && <span className="capture-title__progress">{position} de {items.length}</span>}</div>
      {current && pending(current) && <div className="purchase-heading-actions">
        <button className="cenit-button" type="button" disabled={mutation.isPending} onClick={event => remove(current, event.currentTarget)}>Cancelar</button>
        <button className="cenit-button cenit-button--primary" type="submit" disabled={mutation.isPending || (current.status !== 'ready' && !current.manual)}>
          {mutation.isPending ? 'Guardando…' : <>Guardar y seguir<kbd>Enter</kbd></>}</button>
      </div>}
    </div>
    {alert}
    <div className="capture-queue" ref={workspace}>
      <nav className="capture-queue__list" aria-label="Capturas por revisar" {...dropProps} data-dragging={dragging || undefined}>
        {items.map((item, index) => <div key={item.key} className="capture-queue__item" aria-current={item.key === selected ? 'true' : undefined} data-status={item.status === 'failed' && item.manual ? 'ready' : item.status} data-missing={pending(item) && item.status === 'ready' && missingRut(item) ? 'true' : undefined}>
          <button type="button" className="capture-queue__open" onClick={() => choose(item.key)} disabled={mutation.isPending} title={item.file.name}>
            <strong>{item.draft.record.requestNumber ?? `Captura ${index + 1}`}</strong>
            {item.draft.record.requestNumber && <span className="capture-queue__provider">{item.draft.record.provider ?? 'Sin proveedor'}</span>}
              <span className="capture-queue__status">{item.status === 'reading' ? <CircleNotchIcon className="capture-spin" size={13} aria-hidden="true" /> : item.status === 'saved' || (item.status === 'ready' && !missingRut(item)) ? <CheckIcon size={13} weight="bold" aria-hidden="true" /> : item.status === 'failed' && !item.manual ? <WarningCircleIcon size={13} aria-hidden="true" /> : null}{statusText(item)}</span>
          </button>
          {pending(item) && <button type="button" className="cenit-button cenit-button--icon cenit-button--quiet capture-queue__remove" aria-label={`Quitar ${item.file.name}`} disabled={mutation.isPending} onClick={event => remove(item, event.currentTarget)}><XIcon size={14} aria-hidden="true" /></button>}
        </div>)}
        <button type="button" className="capture-queue__add" disabled={adding} onClick={() => input.current?.click()}><PlusIcon size={16} aria-hidden="true" />{adding ? 'Revisando…' : 'Agregar más capturas'}</button>
      </nav>

      <div className="capture-queue__main">
        {!unsaved.length ? <div className="capture-done">
          <span className="capture-done__icon"><CheckIcon size={28} weight="bold" aria-hidden="true" /></span>
          <h2 ref={stageHeading} tabIndex={-1}>Listo, revisaste todas las capturas</h2>
          <p>Quedaron en el registro como pendientes de pago, salvo las que marcaste como pagadas.</p>
          <div>{singleSavedId && <Link className="cenit-button cenit-button--primary" to={{ pathname: `/administracion/compras/${singleSavedId}`, search: returnSearch }} state={{ purchasesReturnTo: returnTo }}>Ver la compra</Link>}
            <Link className={`cenit-button${singleSavedId ? '' : ' cenit-button--primary'}`} to={returnTo} onClick={() => { snapshot.current = null; }}>Ver el registro</Link>
            <button type="button" className="cenit-button" onClick={() => { setItems([]); setSelected(null); }}>Registrar más capturas</button></div>
        </div> : !current ? <p className="purchase-state">Elige una captura de la lista.</p> : current.status === 'saved' ? <div className="capture-done">
          <h2>Esta captura ya está guardada</h2><p>Solicitud {current.draft.record.requestNumber}.</p>
          {current.savedId && <Link className="cenit-button" to={{ pathname: `/administracion/compras/${current.savedId}`, search: returnSearch }} state={{ purchasesReturnTo: returnTo }}>Ver la compra</Link>}
        </div> : current.status === 'waiting' || current.status === 'reading' ? <div className="capture-panel">
          <span className="capture-panel__icon"><CircleNotchIcon className="capture-spin" size={26} aria-hidden="true" /></span>
          <h2 ref={stageHeading} tabIndex={-1}>{current.status === 'reading' ? 'Leyendo la captura…' : 'En espera'}</h2>
          <p>{current.status === 'reading' ? 'Cenit está llenando la fila. Puedes revisar otra captura mientras tanto.' : 'Se leerá cuando termine la anterior.'}</p>
        </div> : current.status === 'failed' && !current.manual ? <div className="capture-panel capture-panel--problem">
          <span className="capture-panel__icon"><WarningCircleIcon size={26} aria-hidden="true" /></span>
          <h2 ref={stageHeading} tabIndex={-1}>No pudimos leer esta captura</h2><p>{current.error}</p>
          <div className="capture-panel__actions"><button type="button" className="cenit-button" onClick={() => change(current.key, { status: 'waiting' })}>Reintentar la lectura</button>
            <button type="button" className="cenit-button" onClick={() => {
              focusNext.current = 'move';
              change(current.key, { ...manualDraft(current.file), manual: true });
            }}>Completarla a mano con la imagen al lado</button></div>
        </div> : <>
          {mutation.isError && <p className="purchase-state" role="alert">{mutation.error.message} La fila sigue aquí.</p>}
          {!current.manual && <CaptureLens capture={{ file: current.file, url: url(current), width: current.width, height: current.height }} regions={regions} activePath={activePath}
            title={current.draft.record.requestNumber ?? `Captura ${position}`} onSelect={locate} />}
          <RecordForm heading="La fila que se guardará" draft={current.draft} sources={current.sources} dateSource={current.dateSource} problems={problems} disabled={mutation.isPending}
            extraction={current.manual ? null : current.extraction} activePath={activePath} onLocate={setActivePath}
            onChange={(draft, sources) => { change(current.key, { draft, sources }); setProblems([]); mutation.reset(); }} />
          {current.manual && <div className="capture-queue__preview">
            <CapturePreview selected={{ file: current.file, url: url(current), width: current.width, height: current.height }} regions={[]} activePath="" onSelect={locate} />
          </div>}
        </>}
      </div>
    </div>
  </form>;
}
