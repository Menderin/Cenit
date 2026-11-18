import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { maxDocumentItems, type AssetKind, type AssetListItem, type DeliveryItemInput, type Person } from '@cenit/contracts/assets';
import { createDelivery, getAsset, listAssets, listPeople } from '../api/assets.js';
import { kindOrder, kinds, today } from '../model/labels.js';
import { BackLink, DateBlock, ProposalNotice, TextField, focusFirstError, missingMessage, nullable, useAssetSummary } from '../components/AssetsUi.js';
import { AssetPicker, PersonPicker } from '../components/Pickers.js';
import { ItemsTable, SheetPreview, type DocItem } from '../components/Documents.js';
import { Select } from '../../../shared/components/Select.js';
import { StatusNotice } from '../../../shared/components/StatusNotice.js';
import { HttpError } from '../../../shared/lib/http.js';
import { useGuardChanges, usePurchaseGuard } from '../../purchases/model/guard.js';
import { useAuth } from '../../auth/model/session.js';
import '../assets.css';

type Line = { key: string; asset?: AssetListItem; fresh?: { kind: AssetKind; quantity: string; description: string; brand: string; serialNumber: string } };
const toItem = (line: Line): DocItem => line.asset
  ? { key: line.key, assetId: line.asset.id, code: line.asset.code, quantity: line.asset.quantity, description: line.asset.description, brand: line.asset.brand, serialNumber: line.asset.serialNumber, kind: line.asset.kind,
    detail: line.asset.custodian ? `hoy con ${line.asset.custodian.name}` : 'sin responsable' }
  : { key: line.key, quantity: Number(line.fresh!.quantity) || 1, description: line.fresh!.description || 'Bien nuevo', brand: nullable(line.fresh!.brand), serialNumber: nullable(line.fresh!.serialNumber), kind: line.fresh!.kind };

/** Entrega: quien recibe pasa a ser responsable de los bienes. Admite ?bien=id o ?desde=persona para cargar sus bienes. */
export function DeliveryCreate() {
  const [params] = useSearchParams(), navigate = useNavigate(), client = useQueryClient(), guard = usePurchaseGuard();
  const account = useAuth().session?.account;
  const [receiver, setReceiver] = useState<Person | null>(null), [lines, setLines] = useState<Line[]>([]);
  const [fresh, setFresh] = useState<Line['fresh'] | null>(null);
  const [reason, setReason] = useState(''), [date, setDate] = useState(today()), [destination, setDestination] = useState('');
  const [giver, setGiver] = useState(account?.name ?? ''), [giverPosition, setGiverPosition] = useState(''), [giverUnit, setGiverUnit] = useState('Facultad de Medicina'), [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({}), [failure, setFailure] = useState(''), [busy, setBusy] = useState(false);
  const operation = useRef(crypto.randomUUID()), loaded = useRef(false);
  const locations = useAssetSummary().data?.locations ?? [];
  const preset = params.get('bien'), from = params.get('desde');
  const presetAsset = useQuery({ queryKey: ['assets', 'detail', preset], queryFn: ({ signal }) => getAsset(preset!, signal), enabled: !!preset });
  const fromAssets = useQuery({ queryKey: ['assets', 'list', { custodianId: from }], queryFn: ({ signal }) => listAssets({ custodianId: from!, page: 1, pageSize: 30 }, signal), enabled: !!from });
  const fromPerson = useQuery({ queryKey: ['assets', 'people', 'all'], queryFn: ({ signal }) => listPeople({}, signal), enabled: !!from });
  useEffect(() => {
    if (loaded.current) return;
    if (presetAsset.data && !presetAsset.data.loan) { loaded.current = true; setLines([{ key: presetAsset.data.id, asset: presetAsset.data }]); }
    if (fromAssets.data) { loaded.current = true; setLines(fromAssets.data.data.filter(asset => !asset.loan).slice(0, maxDocumentItems).map(asset => ({ key: asset.id, asset }))); }
  }, [presetAsset.data, fromAssets.data]);
  const previous = from ? fromPerson.data?.find(person => person.id === from) : undefined;
  const onLoanCount = fromAssets.data?.data.filter(asset => asset.loan).length ?? 0;
  const pending = Math.max(0, (fromAssets.data?.data.filter(asset => !asset.loan).length ?? 0) - maxDocumentItems);
  const full = lines.length >= maxDocumentItems;
  const dirty = !!receiver || !!reason || (!preset && !from && lines.length > 0) || !!fresh;
  useGuardChanges(dirty && !busy, busy, useCallback(() => {}, []));
  const items = lines.map(toItem);

  function addFresh() {
    if (!fresh?.description.trim()) { setErrors({ ...errors, fresh: 'Escribe la descripción del bien.' }); return; }
    if (!/^[1-9]\d{0,3}$/.test(fresh.quantity.trim())) { setErrors({ ...errors, fresh: 'La cantidad debe ser un número entre 1 y 9999.' }); return; }
    setLines([...lines, { key: crypto.randomUUID(), fresh }]); setFresh(null); setErrors({ ...errors, fresh: '', items: '' });
  }
  async function submit() {
    const next: Record<string, string> = {};
    if (!receiver) next.receiver = 'Elige a la persona que recibe.';
    if (!lines.length) next.items = 'Agrega al menos un bien.';
    if (!reason.trim()) next.reason = 'Escribe el motivo de la entrega.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) next.date = 'Indica la fecha de entrega.';
    if (!giver.trim()) next.giver = 'Escribe quién entrega.';
    setErrors(next); setFailure('');
    if (Object.keys(next).length) { setFailure(missingMessage(Object.keys(next).length)); focusFirstError(); return; }
    setBusy(true);
    try {
      const delivery = await createDelivery({
        operationId: operation.current, receiverId: receiver!.id, deliveredOn: date, reason: reason.trim(), destination: nullable(destination),
        giverName: giver.trim(), giverPosition: nullable(giverPosition), giverUnit: nullable(giverUnit), notes: nullable(notes),
        items: lines.map((line): DeliveryItemInput => line.asset ? { assetId: line.asset.id }
          : { newAsset: { kind: line.fresh!.kind, quantity: Number(line.fresh!.quantity), description: line.fresh!.description.trim(), brand: nullable(line.fresh!.brand), serialNumber: nullable(line.fresh!.serialNumber) } }),
      });
      await client.invalidateQueries({ queryKey: ['assets'] });
      setReceiver(null); setReason(''); setLines([]);
      toast.success(`Entrega N° ${delivery.number} guardada`, { description: 'Descarga el acta para imprimirla y firmarla.' });
      guard.leave(() => navigate(`/administracion/bienes/entregas/${delivery.id}`, { replace: true }));
    } catch (cause) { setFailure(cause instanceof HttpError ? cause.message : 'No pudimos guardar la entrega. Tus datos siguen en el formulario.'); } finally { setBusy(false); }
  }

  return <section className="assets-page assets-page--doc">
    <BackLink to={preset ? `/administracion/bienes/${preset}` : '/administracion/bienes/entregas'}>{preset ? 'Volver a la ficha del bien' : 'Volver a Entregas'}</BackLink>
    <header className="assets-heading"><div><h1>Nueva entrega</h1><p>Deja constancia de los bienes que entregas. Al guardar, quien recibe queda como responsable y descargas el acta para firmar.</p></div></header>
    <ProposalNotice />
    {previous && <div style={{ marginBottom: 18 }}><StatusNotice kind="warning" title={`Bienes de ${previous.name}`} message={`${previous.active ? '' : 'Ya no pertenece a la institución. '}${lines.length ? 'Cargamos los bienes que tiene a cargo y que no están prestados. Elige a quién se entregan.' : 'No hay bienes para entregar ahora.'}${pending ? ` Un acta admite hasta ${maxDocumentItems} bienes: cargamos los primeros ${maxDocumentItems}; al guardar, repite «Entregar sus bienes» con los ${pending} restantes.` : ''}${onLoanCount ? ` ${onLoanCount === 1 ? 'Un bien suyo está en préstamo' : `${onLoanCount} bienes suyos están en préstamo`}: registra la devolución para poder entregarlo${onLoanCount === 1 ? '' : 's'}.` : ''}`} /></div>}
    {presetAsset.data?.loan && <div style={{ marginBottom: 18 }}><StatusNotice kind="warning" title="Este bien está en préstamo" message="Registra su devolución antes de entregarlo a otra persona." /></div>}
    <div className="assets-form-layout">
      <form className="assets-form" noValidate onSubmit={event => { event.preventDefault(); void submit(); }}>
        <fieldset><legend>1. ¿Quién recibe?</legend>
          <PersonPicker id="delivery-receiver" label="Persona que recibe" value={receiver} onChange={person => { setReceiver(person); setErrors({ ...errors, receiver: '' }); }} error={errors.receiver} />
        </fieldset>
        <fieldset><legend>2. ¿Qué bienes se entregan?</legend>
          <AssetPicker id="delivery-asset" label="Agregar un bien del inventario" disabled={full} exclude={lines.flatMap(line => line.asset ? [line.asset.id] : [])} error={errors.items}
            onPick={asset => { setLines([...lines, { key: asset.id, asset }]); setErrors({ ...errors, items: '' }); }} />
          <div style={{ marginTop: 12 }}><ItemsTable items={items} onRemove={key => setLines(lines.filter(line => line.key !== key))}
            empty={<p className="assets-sub" style={{ margin: 0 }}>Todavía no agregas bienes. Búscalos arriba por código, serie o descripción.</p>} /></div>
          {full && <p className="assets-sub" style={{ margin: '8px 0 0' }}>Un acta admite hasta {maxDocumentItems} bienes para que quepa en una hoja. Guarda esta entrega y registra otra con el resto.</p>}
          {fresh ? <div className="assets-newperson" role="group" aria-label="Bien que no está en el inventario">
            <p>Bien que no está en el inventario</p>
            <div className="assets-grid assets-grid--3">
              <div className="assets-field"><span style={{ color: 'var(--color-ink-label)', fontSize: 13, fontWeight: 500 }}>Tipo</span>
                <Select label="Tipo de bien" className="cenit-select-trigger" value={fresh.kind} onValueChange={kind => setFresh({ ...fresh, kind: kind as AssetKind })} options={kindOrder.map(value => ({ value, label: kinds[value].label }))} /></div>
              <TextField id="fresh-description" label="Descripción" value={fresh.description} onChange={description => setFresh({ ...fresh, description })} />
              <TextField id="fresh-quantity" label="Cantidad" value={fresh.quantity} inputMode="numeric" onChange={quantity => setFresh({ ...fresh, quantity })} />
              <TextField id="fresh-brand" label="Marca" optional value={fresh.brand} onChange={brand => setFresh({ ...fresh, brand })} />
              <TextField id="fresh-serial" label="Número de serie" optional value={fresh.serialNumber} onChange={serialNumber => setFresh({ ...fresh, serialNumber })} />
            </div>
            {errors.fresh && <p className="assets-error" role="alert">{errors.fresh}</p>}
            <div><button type="button" className="cenit-button" onClick={addFresh}>Agregar a la entrega</button><button type="button" className="cenit-button cenit-button--quiet" onClick={() => setFresh(null)}>Cancelar</button></div>
          </div> : !full && <button type="button" className="cenit-button cenit-button--quiet assets-add-row" onClick={() => setFresh({ kind: 'accesorio', quantity: '1', description: '', brand: '', serialNumber: '' })}>
            <PlusIcon size={15} aria-hidden="true" />Agregar un bien que no está en el inventario</button>}
        </fieldset>
        <fieldset><legend>3. Detalle de la entrega</legend>
          <div className="assets-grid">
            <TextField id="delivery-reason" label="Motivo" wide value={reason} onChange={value => { setReason(value); setErrors({ ...errors, reason: '' }); }} error={errors.reason} placeholder="Por ejemplo: Para uso asistencial docente." />
            <DateBlock id="delivery-date" label="Fecha de entrega" value={date} onChange={value => { setDate(value); setErrors({ ...errors, date: '' }); }} error={errors.date} />
            <TextField id="delivery-destination" label="Nueva ubicación" optional value={destination} onChange={setDestination} list="delivery-locations"
              hint={receiver?.unit ? `Si la dejas en blanco, los bienes conservan su ubicación actual. Unidad de quien recibe: ${receiver.unit}.` : 'Si la dejas en blanco, los bienes conservan su ubicación actual.'} />
            <datalist id="delivery-locations">{[...new Set([...(receiver?.unit ? [receiver.unit] : []), ...locations])].map(place => <option key={place} value={place} />)}</datalist>
            <TextField id="delivery-giver" label="Entrega (nombre)" value={giver} onChange={setGiver} error={errors.giver} />
            <TextField id="delivery-giver-position" label="Cargo de quien entrega" optional value={giverPosition} onChange={setGiverPosition} />
            <TextField id="delivery-giver-unit" label="Unidad de quien entrega" optional value={giverUnit} onChange={setGiverUnit} />
            <TextField id="delivery-notes" label="Observaciones" optional textarea wide value={notes} onChange={setNotes} />
          </div>
        </fieldset>
        <div className="assets-footer">
          {failure && <StatusNotice kind="error" title="No se guardó" message={failure} />}
          <button type="submit" className="cenit-button cenit-button--primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar entrega'}</button>
          <Link className="cenit-button cenit-button--quiet" to="/administracion/bienes/entregas">Cancelar</Link>
          <p>El número del acta se asigna al guardar.</p>
        </div>
      </form>
      <aside className="assets-aside">
        <p>Así se verá el acta (vista aproximada)</p>
        <SheetPreview type="delivery" date={date} person={receiver} items={items}
          rows={[['Motivo', reason || null], ['Fecha de entrega', /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').reverse().join('/') : null], ['Entrega', [giver, giverPosition, giverUnit].filter(Boolean).join(', ') || null]]}
          signs={['Recibe conforme', 'Entrega conforme']} />
        {items.length > 0 && <p>{items.length} {items.length === 1 ? 'bien' : 'bienes'}: {items.map(item => item.description).join(', ')}. {lines.some(line => line.asset?.custodian) ? 'Cambiarán de responsable al guardar.' : ''}</p>}
      </aside>
    </div>
  </section>;
}
