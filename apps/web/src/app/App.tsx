import { Navigate, Route, Routes } from 'react-router';
import { useAuth } from '../features/auth/model/session.js';
import { Login } from '../features/auth/pages/Login.js';
import { PurchaseReview } from '../features/purchases/pages/PurchaseReview.js';
import { PurchaseCapture } from '../features/purchases/pages/PurchaseCapture.js';
import { Purchases } from '../features/purchases/pages/Purchases.js';
import { PurchaseCreate } from '../features/purchases/pages/PurchaseCreate.js';
import { PurchaseDetail } from '../features/purchases/pages/PurchaseDetail.js';
import { PurchaseEdit } from '../features/purchases/pages/PurchaseEdit.js';
import { PurchaseTransferProvider } from '../features/purchases/model/transfer.js';
import { AdministrativeLayout } from './AdministrativeLayout.js';
import { Home } from '../features/administration/pages/Home.js';
import { Personnel } from '../features/administration/pages/Personnel.js';
import { Assets } from '../features/administration/pages/Assets.js';
import { AccessLayout } from '../features/auth/components/AccessLayout.js';
import { Academic } from '../features/academic/pages/Academic.js';
import { PurchaseGuardProvider, usePurchaseGuard } from '../features/purchases/model/guard.js';
import { StatusNotice } from '../shared/components/StatusNotice.js';
import { PurchaseCapabilitiesProvider } from '../features/purchases/model/capabilities.js';

function AdministrativeArea() {
  const auth = useAuth(), guard = usePurchaseGuard();
  const session = auth.session!;
  const logout = async (origin?: HTMLElement) => { guard.request(() => { void auth.logout(); }, origin ?? null); };
  return <AdministrativeLayout account={session.account} expiresAt={session.expiresAt} logout={logout}>
    <Routes>
      <Route path="/administracion" element={<Home />} />
      <Route path="/administracion/compras" element={<Purchases key={session.account.id} />} />
      <Route path="/administracion/compras/nueva" element={<PurchaseCreate key={session.account.id} />} />
      <Route path="/administracion/compras/laboratorio" element={<PurchaseReview key={session.account.id} />} />
      <Route path="/administracion/compras/captura" element={<PurchaseCapture key={session.account.id} />} />
      <Route path="/administracion/compras/:id/editar" element={<PurchaseEdit key={session.account.id} />} />
      <Route path="/administracion/compras/:id" element={<PurchaseDetail key={session.account.id} />} />
      <Route path="/administracion/personal" element={<Personnel />} />
      <Route path="/administracion/bienes" element={<Assets />} />
      <Route path="*" element={<Navigate to="/administracion" replace />} />
    </Routes>
  </AdministrativeLayout>;
}

export function App() {
  const auth = useAuth();
  if (auth.status === 'authenticated' && auth.session && auth.session.account.role !== 'administrativo') {
    return <Routes><Route path="/academico" element={<Academic key={auth.session.account.id} />} /><Route path="*" element={<Navigate to="/academico" replace />} /></Routes>;
  }
  let content;
  if (auth.status === 'checking' || auth.status === 'closing') content = <>
    <h1 id="access-title">Cenit</h1>
    <p className="cenit-access__intro" role="status">{auth.status === 'closing' ? 'Cerrando sesión…' : 'Comprobando sesión…'}</p>
  </>;
  else if (auth.status === 'error' || auth.status === 'logout-error') content = <>
    <h1 id="access-title">No pudimos completar la operación</h1>
    <StatusNotice kind="error" title={auth.status === 'logout-error' ? 'Cierre sin confirmar' : 'Sesión sin comprobar'} message={auth.message} />
    <button className="cenit-button cenit-button--primary cenit-access__primary" onClick={() => { void (auth.status === 'logout-error' ? auth.logout() : auth.refresh()); }}>Reintentar</button>
  </>;
  else if (!auth.session) content = <Routes><Route path="/login" element={<Login />} /><Route path="*" element={<Navigate to="/login" replace />} /></Routes>;
  if (auth.status === 'authenticated' && auth.session?.account.role === 'administrativo') return <PurchaseTransferProvider key={auth.session.account.id}>
    <PurchaseCapabilitiesProvider><PurchaseGuardProvider><AdministrativeArea /></PurchaseGuardProvider></PurchaseCapabilitiesProvider>
  </PurchaseTransferProvider>;
  return <AccessLayout>{content}</AccessLayout>;
}
