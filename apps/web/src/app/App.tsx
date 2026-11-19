import { Navigate, Route, Routes, useLocation } from 'react-router';
import { useAuth } from '../features/auth/model/session.js';
import { Login } from '../features/auth/pages/Login.js';
import { Profile, AcademicProfile } from '../features/auth/pages/Profile.js';
import { PurchaseReview } from '../features/purchases/pages/PurchaseReview.js';
import { PurchaseCapture } from '../features/purchases/pages/PurchaseCapture.js';
import { Purchases } from '../features/purchases/pages/Purchases.js';
import { PurchaseCreate } from '../features/purchases/pages/PurchaseCreate.js';
import { PurchaseDetail } from '../features/purchases/pages/PurchaseDetail.js';
import { PurchaseEdit } from '../features/purchases/pages/PurchaseEdit.js';
import { PurchaseTransferProvider } from '../features/purchases/model/transfer.js';
import { AdministrativeLayout } from './AdministrativeLayout.js';
import { Home } from '../features/administration/pages/Home.js';
import { ServiceCommission } from '../features/personnel/pages/ServiceCommission.js';
import { LeaveRequest } from '../features/personnel/pages/LeaveRequest.js';
import { Personnel } from '../features/personnel/pages/Personnel.js';
import { Inventory } from '../features/assets/pages/Inventory.js';
import { AssetDetail } from '../features/assets/pages/AssetDetail.js';
import { AssetForm } from '../features/assets/pages/AssetForm.js';
import { Deliveries, DeliveryDetail } from '../features/assets/pages/Deliveries.js';
import { DeliveryCreate } from '../features/assets/pages/DeliveryCreate.js';
import { Loans, LoanDetail } from '../features/assets/pages/Loans.js';
import { LoanCreate } from '../features/assets/pages/LoanCreate.js';
import { People } from '../features/assets/pages/People.js';
import { AssetsLayout } from '../features/assets/pages/AssetsLayout.js';
import { AccessLayout } from '../features/auth/components/AccessLayout.js';
import { Academic } from '../features/academic/pages/Academic.js';
import { PurchaseGuardProvider, usePurchaseGuard } from '../features/purchases/model/guard.js';
import { StatusNotice } from '../shared/components/StatusNotice.js';
import { LoadingLabel, Skeleton, TableSkeleton } from '../shared/components/Skeleton.js';

function SessionLoading() {
  const { pathname } = useLocation();
  if (/^\/(administracion|academico)(\/|$)/.test(pathname)) return <div className="workspace">
    <LoadingLabel>Comprobando sesión…</LoadingLabel>
    <div className="workspace-shell" aria-hidden="true">
      <div className="workspace-sidebar"><div className="workspace-sidebar-content">
        <Skeleton width="4rem" height="24px" /><div className="workspace-nav">{[0, 1, 2].map(index => <div className="workspace-nav-item" key={index}><Skeleton width="1rem" /><Skeleton width="68%" /></div>)}</div>
      </div></div>
      <div className="workspace-main"><div className="workspace-toolbar"><Skeleton width="11rem" /></div>
        <div className="admin-content"><Skeleton width="13rem" height="30px" /><div className="purchase-list"><TableSkeleton className="purchase-table-scroll" columns={[1, 2, 1]} /></div></div>
      </div>
    </div>
  </div>;
  return <AccessLayout>
    <LoadingLabel>Comprobando sesión…</LoadingLabel>
    <div className="cenit-access__heading"><h1 id="access-title" className="cenit-loading-label">Acceso a Cenit</h1><Skeleton width="10rem" height="31px" /><Skeleton width="12rem" height="21px" className="cenit-access__loading-intro" /></div>
    <div className="cenit-access__form" aria-hidden="true">
      {[0, 1].map(index => <div className="cenit-access__field" key={index}><Skeleton width="7rem" height="18px" /><Skeleton height="42px" className="cenit-access__loading-field" /></div>)}
      <Skeleton height="44px" className="cenit-access__loading-field" />
    </div>
  </AccessLayout>;
}

function AdministrativeArea() {
  const auth = useAuth(), guard = usePurchaseGuard();
  const session = auth.session!;
  const logout = async (origin?: HTMLElement) => { guard.request(() => { void auth.logout(); }, origin ?? null); };
  return <AdministrativeLayout account={session.account} expiresAt={session.expiresAt} logout={logout}>
    <Routes>
      <Route path="/administracion" element={<Home />} />
      <Route path="/administracion/perfil" element={<Profile key={session.account.id} />} />
      <Route path="/administracion/compras" element={<Purchases key={session.account.id} />} />
      <Route path="/administracion/compras/nueva" element={<PurchaseCreate key={session.account.id} />} />
      <Route path="/administracion/compras/laboratorio" element={<PurchaseReview key={session.account.id} />} />
      <Route path="/administracion/compras/captura" element={<PurchaseCapture key={session.account.id} />} />
      <Route path="/administracion/compras/:id/editar" element={<PurchaseEdit key={session.account.id} />} />
      <Route path="/administracion/compras/:id" element={<PurchaseDetail key={session.account.id} />} />
      <Route path="/administracion/personal" element={<Personnel />} />
      <Route path="/administracion/personal/comision" element={<ServiceCommission />} />
      <Route path="/administracion/personal/permiso" element={<LeaveRequest />} />
      <Route element={<AssetsLayout />}>
        <Route path="/administracion/bienes" element={<Inventory />} />
        <Route path="/administracion/bienes/entregas" element={<Deliveries />} />
        <Route path="/administracion/bienes/prestamos" element={<Loans />} />
        <Route path="/administracion/bienes/responsables" element={<People />} />
      </Route>
      <Route path="/administracion/bienes/nuevo" element={<AssetForm key="new" />} />
      <Route path="/administracion/bienes/entregas/nueva" element={<DeliveryCreate />} />
      <Route path="/administracion/bienes/entregas/:id" element={<DeliveryDetail />} />
      <Route path="/administracion/bienes/prestamos/nuevo" element={<LoanCreate />} />
      <Route path="/administracion/bienes/prestamos/:id" element={<LoanDetail />} />
      <Route path="/administracion/bienes/:id/editar" element={<AssetForm key="edit" />} />
      <Route path="/administracion/bienes/:id" element={<AssetDetail />} />
      <Route path="*" element={<Navigate to="/administracion" replace />} />
    </Routes>
  </AdministrativeLayout>;
}

export function App() {
  const auth = useAuth();
  if (auth.status === 'checking') return <SessionLoading />;
  if (auth.status === 'authenticated' && auth.session && auth.session.account.role !== 'administrativo') {
    return <Routes><Route path="/academico" element={<Academic key={auth.session.account.id} />} /><Route path="/academico/perfil" element={<AcademicProfile key={auth.session.account.id} />} /><Route path="*" element={<Navigate to="/academico" replace />} /></Routes>;
  }
  let content;
  if (auth.status === 'closing') content = <>
    <h1 id="access-title">Cenit</h1>
    <p className="cenit-access__intro" role="status">Cerrando sesión…</p>
  </>;
  else if (auth.status === 'error' || auth.status === 'logout-error') content = <>
    <h1 id="access-title">No pudimos completar la operación</h1>
    <StatusNotice kind="error" title={auth.status === 'logout-error' ? 'Cierre sin confirmar' : 'Sesión sin comprobar'} message={auth.message} />
    <button className="cenit-button cenit-button--primary cenit-access__primary" onClick={() => { void (auth.status === 'logout-error' ? auth.logout() : auth.refresh()); }}>Reintentar</button>
  </>;
  else if (!auth.session) content = <Routes><Route path="/login" element={<Login />} /><Route path="*" element={<Navigate to="/login" replace />} /></Routes>;
  if (auth.status === 'authenticated' && auth.session?.account.role === 'administrativo') return <PurchaseTransferProvider key={auth.session.account.id}>
    <PurchaseGuardProvider><AdministrativeArea /></PurchaseGuardProvider>
  </PurchaseTransferProvider>;
  return <AccessLayout>{content}</AccessLayout>;
}
