import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { maxDocumentItems, type AssetListItem, type Person } from '@cenit/contracts/assets';
import { createLoan, getAsset } from '../api/assets.js';
import { today } from '../model/labels.js';
import { BackLink, DateBlock, TextField, focusFirstError, missingMessage, nullable, useAssetSummary } from '../components/AssetsUi.js';
import { AssetPicker, PersonPicker } from '../components/Pickers.js';
import { ItemsTable, SheetPreview } from '../components/Documents.js';
import { StatusNotice } from '../../../shared/components/StatusNotice.js';
import { HttpError } from '../../../shared/lib/http.js';
import { useGuardChanges, usePurchaseGuard } from '../../purchases/model/guard.js';
import '../assets.css';

const addDays = (value: string, days: number) => { const d = new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

/** Préstamo transitorio: el bien no cambia de responsable; queda «en préstamo» hasta registrar su devolución. */
export function LoanCreate() {
  const [params] = useSearchParams(), navigate = useNavigate(), client = useQueryClient(), guard = usePurchaseGuard();
  const [borrower, setBorrower] = useState<Person | null>(null), [assets, setAssets] = useState<AssetListItem[]>([]);
  const [date, setDate] = useState(today()), [due, setDue] = useState(addDays(today(), 14)), [location, setLocation] = useState('');
  const [authorizer, setAuthorizer] = useState(''), [authorizerUnit, setAuthorizerUnit] = useState('Facultad de Medicina'), [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({}), [failure, setFailure] = useState(''), [busy, setBusy] = useState(false);
  const operation = useRef(crypto.randomUUID()), loaded = useRef(false), preset = params.get('bien');
  const locations = useAssetSummary().data?.locations ?? [];
  const presetAsset = useQuery({ queryKey: ['assets', 'detail', preset], queryFn: ({ signal }) => getAsset(preset!, signal), enabled: !!preset });
  useEffect(() => { if (!loaded.current && presetAsset.data && !presetAsset.data.loan) { loaded.current = true; setAssets([presetAsset.data]); } }, [presetAsset.data]);
  useGuardChanges((!!borrower || !!authorizer || (!preset && assets.length > 0)) && !busy, busy, useCallback(() => {}, []));
  const items = assets.map(asset => ({ key: asset.id, assetId: asset.id, code: asset.code, quantity: asset.quantity, description: asset.description, brand: asset.brand, serialNumber: asset.serialNumber, kind: asset.kind,
    detail: asset.custodian ? `responsable: ${asset.custodian.name}` : 'sin responsable' }));
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

  async function submit() {
    const next: Record<string, string> = {};
    if (!borrower) next.borrower = 'Elige a la persona que recibe el préstamo.';
    if (!assets.length) next.assets = 'Agrega el bien que se presta.';
    if (!valid(date)) next.date = 'Indica la fecha del préstamo.';
    if (due && !valid(due)) next.due = 'Completa la fecha o déjala en blanco.';
    else if (due && due < date) next.due = 'La devolución no puede ser antes del préstamo.';
    if (!authorizer.trim()) next.authorizer = 'Escribe quién autoriza el préstamo.';
    setErrors(next); setFailure('');
    if (Object.keys(next).length) { setFailure(missingMessage(Object.keys(next).length)); focusFirstError(); return; }
    setBusy(true);
    try {
      const loan = await createLoan({ operationId: operation.current, borrowerId: borrower!.id, loanedOn: date, dueOn: due || null, location: nullable(location),
        authorizerName: authorizer.trim(), authorizerUnit: nullable(authorizerUnit), notes: nullable(notes), assetIds: assets.map(asset => asset.id) });
      await client.invalidateQueries({ queryKey: ['assets'] });
      setBorrower(null); setAssets([]); setAuthorizer('');
      toast.success(`Préstamo N° ${loan.number} guardado`, { description: 'Descarga el documento para imprimirlo y firmarlo.' });
      guard.leave(() => navigate(`/administracion/bienes/prestamos/${loan.id}`, { replace: true }));
    } catch (cause) { setFailure(cause instanceof HttpError ? cause.message : 'No pudimos guardar el préstamo. Tus datos siguen en el formulario.'); } finally { setBusy(false); }
  }

  return <section className="assets-page assets-page--doc">
    <BackLink to={preset ? `/administracion/bienes/${preset}` : '/administracion/bienes/prestamos'}>{preset ? 'Volver a la ficha del bien' : 'Volver a Préstamos'}</BackLink>
    <header className="assets-heading"><div><h1>Nuevo préstamo</h1><p>Presta un bien por un tiempo. El responsable no cambia; cuando vuelva, registra la devolución.</p></div></header>
    {presetAsset.data?.loan && <div style={{ marginBottom: 18 }}><StatusNotice kind="warning" title="Este bien ya está prestado" message={`Está prestado a ${presetAsset.data.loan.borrowerName}. Registra su devolución antes de prestarlo otra vez.`} /></div>}
    <div className="assets-form-layout">
      <form className="assets-form" noValidate onSubmit={event => { event.preventDefault(); void submit(); }}>
        <fieldset><legend>1. ¿Qué bien se presta?</legend>
          <AssetPicker id="loan-asset" label="Buscar en el inventario" forLoan disabled={assets.length >= maxDocumentItems} exclude={assets.map(asset => asset.id)} error={errors.assets}
            onPick={asset => { setAssets([...assets, asset]); setErrors({ ...errors, assets: '' }); }} />
          <div style={{ marginTop: 12 }}><ItemsTable items={items} onRemove={key => setAssets(assets.filter(asset => asset.id !== key))}
            empty={<p className="assets-sub" style={{ margin: 0 }}>Busca el bien arriba. Sólo aparecen los que no están prestados.</p>} /></div>
          {assets.length >= maxDocumentItems && <p className="assets-sub" style={{ margin: '8px 0 0' }}>Un préstamo admite hasta {maxDocumentItems} bienes para que quepa en una hoja. Guarda este y registra otro con el resto.</p>}
        </fieldset>
        <fieldset><legend>2. ¿Quién lo recibe?</legend>
          <PersonPicker id="loan-borrower" label="Persona que recibe el préstamo" value={borrower} onChange={person => { setBorrower(person); setErrors({ ...errors, borrower: '' }); }} error={errors.borrower} />
        </fieldset>
        <fieldset><legend>3. Fechas y lugar</legend>
          <div className="assets-grid">
            <DateBlock id="loan-date" label="Fecha del préstamo" value={date} onChange={value => { setDate(value); setErrors({ ...errors, date: '' }); }} error={errors.date} />
            <DateBlock id="loan-due" label="Devolución esperada" optional value={due} onChange={value => { setDue(value); setErrors({ ...errors, due: '' }); }} error={errors.due}
              hint="Si pasa esta fecha, el préstamo aparecerá como vencido. Bórrala si no hay fecha." />
            <TextField id="loan-location" label="¿Dónde se usará?" optional value={location} onChange={setLocation} list="loan-locations" placeholder="Por ejemplo: Docencia, Sala 204" />
            <datalist id="loan-locations">{locations.map(place => <option key={place} value={place} />)}</datalist>
          </div>
        </fieldset>
        <fieldset><legend>4. Quién autoriza</legend>
          <div className="assets-grid">
            <TextField id="loan-authorizer" label="Nombre de quien autoriza" value={authorizer} onChange={value => { setAuthorizer(value); setErrors({ ...errors, authorizer: '' }); }} error={errors.authorizer} />
            <TextField id="loan-authorizer-unit" label="Unidad" optional value={authorizerUnit} onChange={setAuthorizerUnit} />
            <TextField id="loan-notes" label="Observaciones" optional textarea wide value={notes} onChange={setNotes} hint="Accesorios que se prestan junto al bien o su estado al salir." />
          </div>
        </fieldset>
        <div className="assets-footer">
          {failure && <StatusNotice kind="error" title="No se guardó" message={failure} />}
          <button type="submit" className="cenit-button cenit-button--primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar préstamo'}</button>
          <Link className="cenit-button cenit-button--quiet" to="/administracion/bienes/prestamos">Cancelar</Link>
          <p>El número del documento se asigna al guardar.</p>
        </div>
      </form>
      <aside className="assets-aside">
        <p>Así se verá el documento (vista aproximada)</p>
        <SheetPreview type="loan" date={date} person={borrower} items={items}
          rows={[['Ubicación', location || null], ['Devolución', due && valid(due) ? `Esperada el ${due.split('-').reverse().join('/')}` : 'Sin fecha definida'], ['Autorizador', authorizer || null], ['Unidad', authorizerUnit || null]]}
          signs={['Firma de quien recibe', 'Firma de quien autoriza']} />
      </aside>
    </div>
  </section>;
}
