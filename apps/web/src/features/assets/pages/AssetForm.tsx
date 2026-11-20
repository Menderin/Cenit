import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { InfoIcon } from '@phosphor-icons/react/dist/csr/Info';
import { assetAltaEntries, assetAltaForm, type AssetData, type AssetDetail, type AssetKind, type Person } from '@cenit/contracts/assets';
import { createAsset, getAsset, updateAsset } from '../api/assets.js';
import { kindOrder, kinds, today, usesSerial } from '../model/labels.js';
import { BackLink, DateBlock, LoadState, TextField, focusFirstError, missingMessage, nullable, useAssetSummary } from '../components/AssetsUi.js';
import { PersonPicker } from '../components/Pickers.js';
import { FormPreview } from '../components/Documents.js';
import template from '../components/alta-template.png';
import { StatusNotice } from '../../../shared/components/StatusNotice.js';
import { HttpError } from '../../../shared/lib/http.js';
import { useGuardChanges, usePurchaseGuard } from '../../purchases/model/guard.js';
import { listPurchases } from '../../purchases/api/purchases.js';
import '../assets.css';

type Draft = Record<'description' | 'quantity' | 'inventoryNumber' | 'brand' | 'model' | 'serialNumber' | 'furnitureType' | 'material' | 'dimensions' | 'area' | 'notes' | 'location' | 'registeredOn' | 'purchase', string>
  & { kind: AssetKind; systemPart: boolean; wallMounted: boolean; assembled: boolean };
const blank = (): Draft => ({ kind: 'equipo_computacional', description: '', quantity: '1', inventoryNumber: '', brand: '', model: '', serialNumber: '', furnitureType: '', material: '', dimensions: '', area: '',
  notes: '', location: '', registeredOn: today(), purchase: '', systemPart: false, wallMounted: false, assembled: false });
const fromAsset = (asset: AssetDetail): Draft => ({ ...blank(), kind: asset.kind, description: asset.description, quantity: String(asset.quantity), inventoryNumber: asset.inventoryNumber ?? '',
  brand: asset.brand ?? '', model: asset.model ?? '', serialNumber: asset.serialNumber ?? '', furnitureType: asset.furnitureType ?? '', material: asset.material ?? '', dimensions: asset.dimensions ?? '',
  area: asset.area ?? '', notes: asset.notes ?? '', location: asset.location, registeredOn: asset.registeredOn, purchase: asset.purchase?.requestNumber ?? '',
  systemPart: asset.systemPart, wallMounted: asset.wallMounted, assembled: asset.assembled });

/** Alta y edición de un bien. Los campos se adaptan al tipo, según lo que pide la Sección Registro. */
export function AssetForm() {
  const { id } = useParams(), editing = !!id;
  const existing = useQuery({ queryKey: ['assets', 'detail', id], queryFn: ({ signal }) => getAsset(id!, signal), enabled: editing });
  if (editing && !existing.data) return <section className="assets-page assets-page--doc"><BackLink /><LoadState query={existing} label="el bien" /></section>;
  return <Form key={existing.data?.version ?? 'new'} asset={existing.data} />;
}

function Form({ asset }: { asset?: AssetDetail }) {
  const navigate = useNavigate(), client = useQueryClient(), guard = usePurchaseGuard();
  const initial = useMemo(() => asset ? fromAsset(asset) : blank(), [asset]);
  const [draft, setDraft] = useState(initial), [custodian, setCustodian] = useState<Person | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({}), [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false), operation = useRef(crypto.randomUUID());
  const locations = useAssetSummary().data?.locations ?? [];
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial) || !!custodian;
  const discard = useCallback(() => {}, []);
  useGuardChanges(dirty && !busy, busy, discard);
  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) => { setDraft(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: undefined })); };
  const purchaseText = draft.purchase.trim();
  const purchases = useQuery({ queryKey: ['assets', 'purchase-lookup', purchaseText], queryFn: ({ signal }) => listPurchases('all', 1, signal, { q: purchaseText }, { sort: 'sentDateDesc', pageSize: 5 }), enabled: purchaseText.length >= 3 });
  const purchase = purchases.data?.data.find(record => record.requestNumber.toLocaleLowerCase('es') === purchaseText.toLocaleLowerCase('es'));
  const kind = kinds[draft.kind];
  const [overflow, setOverflow] = useState<string[]>([]);

  function validate() {
    const next: typeof errors = {};
    if (!draft.description.trim()) next.description = 'Escribe qué bien es. Por ejemplo: «Proyector láser».';
    if (!/^[1-9]\d{0,3}$/.test(draft.quantity.trim())) next.quantity = 'Usa un número entero entre 1 y 9999.';
    if (!editing() && !draft.location.trim()) next.location = 'Indica dónde queda el bien.';
    if (!editing() && !/^\d{4}-\d{2}-\d{2}$/.test(draft.registeredOn)) next.registeredOn = 'Indica la fecha de alta.';
    if (purchaseText && !purchase && !(asset?.purchase && asset.purchase.requestNumber === purchaseText)) next.purchase = 'No encontramos esa compra en Cenit. Revisa el número o deja el campo vacío.';
    setErrors(next);
    return Object.keys(next).length;
  }
  function editing() { return !!asset; }
  async function submit() {
    setFailure('');
    const invalid = validate();
    if (invalid) { setFailure(missingMessage(invalid)); focusFirstError(); return; }
    const serial = usesSerial(draft.kind), furniture = draft.kind === 'mueble', building = draft.kind === 'construccion';
    const data: AssetData = {
      kind: draft.kind, quantity: Number(draft.quantity), description: draft.description.trim(), inventoryNumber: nullable(draft.inventoryNumber),
      brand: serial ? nullable(draft.brand) : null, model: serial ? nullable(draft.model) : null, serialNumber: serial ? nullable(draft.serialNumber) : null,
      furnitureType: furniture ? nullable(draft.furnitureType) : null, material: furniture || building ? nullable(draft.material) : null, dimensions: furniture ? nullable(draft.dimensions) : null,
      area: building ? nullable(draft.area) : null, systemPart: ['equipo', 'equipo_computacional', 'maquinaria'].includes(draft.kind) && draft.systemPart,
      wallMounted: furniture && draft.wallMounted, assembled: draft.kind === 'equipo_computacional' && draft.assembled, notes: nullable(draft.notes),
      purchaseId: purchaseText ? purchase?.id ?? asset?.purchase?.id ?? null : null,
    };
    setBusy(true);
    try {
      const saved = asset ? await updateAsset(asset.id, { expectedVersion: asset.version, ...data })
        : await createAsset({ operationId: operation.current, ...data, location: draft.location.trim(), custodianId: custodian?.id ?? null, registeredOn: draft.registeredOn });
      await client.invalidateQueries({ queryKey: ['assets'] });
      setDraft(initial); setCustodian(null);
      toast.success(asset ? 'Cambios guardados' : 'Bien registrado', { description: asset ? undefined : `Quedó como ${saved.code}. Puedes descargar el formulario de alta desde su ficha.` });
      guard.leave(() => navigate(`/administracion/bienes/${saved.id}`, { replace: true }));
    } catch (cause) { setFailure(cause instanceof HttpError ? cause.message : 'No pudimos guardar. Tus datos siguen en el formulario.'); } finally { setBusy(false); }
  }

  return <section className="assets-page assets-page--doc">
    <BackLink to={asset ? `/administracion/bienes/${asset.id}` : '/administracion/bienes'}>{asset ? `Volver a la ficha de ${asset.code}` : 'Volver a Bienes'}</BackLink>
    <header className="assets-heading"><div><h1>{asset ? 'Editar datos del bien' : 'Registrar bien'}</h1>
      <p>{asset ? 'Corrige los datos del bien. Para cambiar responsable o ubicación usa «Entregar a una persona» o «Cambiar ubicación» en la ficha.' : 'Completa los datos que pide la Sección Registro. Lo que no sepas, déjalo en blanco.'}</p></div></header>
    <div className="assets-form-layout">
      <form className="assets-form" noValidate onSubmit={event => { event.preventDefault(); void submit(); }}>
        <fieldset>
          <legend>1. ¿Qué tipo de bien es?</legend>
          <div className="assets-kinds">{kindOrder.map(value => { const Icon = kinds[value].icon; return <label key={value}>
            <input type="radio" name="asset-kind" value={value} checked={draft.kind === value} onChange={() => set('kind')(value)} />
            <Icon size={20} aria-hidden="true" />{kinds[value].label}</label>; })}</div>
        </fieldset>
        <fieldset>
          <legend>2. Datos del bien</legend>
          <div className="assets-grid">
            <TextField id="asset-description" label="Descripción" wide value={draft.description} onChange={set('description')} error={errors.description} placeholder="Por ejemplo: Notebook ThinkBook 14" />
            {usesSerial(draft.kind) && <>
              <TextField id="asset-brand" label="Marca" optional value={draft.brand} onChange={set('brand')} />
              <TextField id="asset-model" label="Modelo" optional value={draft.model} onChange={set('model')} />
              <TextField id="asset-serial" label="Número de serie" optional value={draft.serialNumber} onChange={set('serialNumber')} hint="Aparece en la etiqueta del equipo o en la factura." />
            </>}
            {draft.kind === 'mueble' && <>
              <TextField id="asset-furniture" label="Tipo de mueble" optional value={draft.furnitureType} onChange={set('furnitureType')} placeholder="Escritorio, silla, estante…" />
              <TextField id="asset-material" label="Material" optional value={draft.material} onChange={set('material')} />
              <TextField id="asset-dimensions" label="Medidas" optional value={draft.dimensions} onChange={set('dimensions')} placeholder="Ancho × fondo × alto" />
            </>}
            {draft.kind === 'construccion' && <>
              <TextField id="asset-area" label="Superficie" optional value={draft.area} onChange={set('area')} placeholder="Por ejemplo: 12 m²" />
              <TextField id="asset-material" label="Materiales" optional value={draft.material} onChange={set('material')} />
            </>}
            <TextField id="asset-quantity" label="Cantidad" value={draft.quantity} onChange={set('quantity')} error={errors.quantity} inputMode="numeric" />
            <TextField id="asset-inventory" label="Número de inventario" optional value={draft.inventoryNumber} onChange={set('inventoryNumber')} hint="Lo asigna la Sección Registro. Si aún no lo tienes, déjalo en blanco." />
            <div className="assets-wide assets-checks">
            {draft.kind === 'equipo_computacional' && <label className="assets-check"><input type="checkbox" checked={draft.assembled} onChange={event => set('assembled')(event.target.checked)} /><span>Es un equipo armado<small>Computador armado con piezas, no de una marca.</small></span></label>}
            {['equipo', 'equipo_computacional', 'maquinaria'].includes(draft.kind) && <label className="assets-check"><input type="checkbox" checked={draft.systemPart} onChange={event => set('systemPart')(event.target.checked)} /><span>Es parte de un sistema<small>Por ejemplo, un monitor que funciona junto a otro equipo.</small></span></label>}
            {draft.kind === 'mueble' && <label className="assets-check"><input type="checkbox" checked={draft.wallMounted} onChange={event => set('wallMounted')(event.target.checked)} /><span>Va adosado al piso o a la pared</span></label>}
            </div>
            <TextField id="asset-notes" label="Más datos" optional textarea wide value={draft.notes} onChange={set('notes')} hint="Accesorios incluidos, características o cualquier dato útil para identificarlo." />
          </div>
        </fieldset>
        {!asset && <fieldset>
          <legend>3. ¿Dónde queda y quién lo tiene?</legend>
          <div className="assets-grid">
            <TextField id="asset-location" label="Ubicación" value={draft.location} onChange={set('location')} error={errors.location} list="asset-locations" placeholder="Recinto, pabellón o unidad" />
            <datalist id="asset-locations">{locations.map(place => <option key={place} value={place} />)}</datalist>
            <DateBlock id="asset-date" label="Fecha de alta" value={draft.registeredOn} onChange={set('registeredOn')} error={errors.registeredOn} />
            <div className="assets-wide"><PersonPicker id="asset-custodian" label="Responsable (opcional)" value={custodian} onChange={setCustodian} />
              <p className="assets-sub" style={{ marginTop: 6 }}>Si todavía no se entrega a nadie, déjalo en blanco. Después puedes usar «Entregar» y se generará el acta.</p></div>
          </div>
        </fieldset>}
        <fieldset>
          <legend>{asset ? '3.' : '4.'} Compra asociada <small>(opcional)</small></legend>
          <div className="assets-grid">
            <TextField id="asset-purchase" label="Número de solicitud de compra" value={draft.purchase} onChange={set('purchase')} error={errors.purchase} placeholder="Por ejemplo: CENIT-2026-063"
              hint={purchase ? `Compra encontrada: ${purchase.description}` : 'Si el bien se compró y la compra está en Cenit, escribe su número para vincularla.'} />
          </div>
        </fieldset>
        <div className="assets-footer">
          {failure && <StatusNotice kind="error" title="No se guardó" message={failure} />}
          <button type="submit" className="cenit-button cenit-button--primary" disabled={busy}>{busy ? 'Guardando…' : asset ? 'Guardar cambios' : 'Registrar bien'}</button>
          <Link className="cenit-button cenit-button--quiet" to={asset ? `/administracion/bienes/${asset.id}` : '/administracion/bienes'}>Cancelar</Link>
          {!asset && <p>Cenit le asigna un código al guardar.</p>}
        </div>
      </form>
      <aside className="assets-aside">
        <div className="assets-requires">
          <h2><InfoIcon size={18} aria-hidden="true" />Qué pide la Sección Registro</h2>
          <p><strong>{kind.label}:</strong> {kind.requires}</p>
          <p>Estos datos se piden al proveedor en la factura. Con ellos se prepara el formulario de alta, que puedes descargar desde la ficha del bien.</p>
        </div>
        <FormPreview caption="Así queda el formulario de alta, en el formato de la Sección Registro." overflow={overflow} onOverflow={setOverflow}
          label="Vista previa del formulario de alta" template={template} alt="Formulario de alta de bienes inventariables de la Sección Registro, con los datos del bien."
          layout={assetAltaForm} entries={assetAltaEntries({ ...draft, code: asset?.code, location: asset?.location ?? draft.location, custodian: asset?.custodian ?? custodian })} />
      </aside>
    </div>
  </section>;
}
