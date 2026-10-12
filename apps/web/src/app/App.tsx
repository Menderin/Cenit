import { Navigate, Route, Routes } from 'react-router';
import { useAuth, destination } from '../features/auth/model/session.js';
import { Login } from '../features/auth/pages/Login.js';
import { Administration } from '../features/purchases/pages/Administration.js';
import { Academic } from '../features/academic/pages/Academic.js';
import { SessionWarning } from '../features/auth/components/SessionWarning.js';

export function App() {
  const auth = useAuth();
  let content;
  if (auth.status === 'checking' || auth.status === 'closing') content = <p role="status">{auth.status === 'closing' ? 'Cerrando sesión…' : 'Comprobando sesión…'}</p>;
  else if (auth.status === 'error' || auth.status === 'logout-error') content = <section className="space-y-4"><p role="alert">{auth.message}</p><button onClick={() => { void (auth.status === 'logout-error' ? auth.logout() : auth.refresh()); }}>Reintentar</button></section>;
  else if (!auth.session) content = <Routes><Route path="/login" element={<Login />} /><Route path="*" element={<Navigate to="/login" replace />} /></Routes>;
  else {
    const home = destination(auth.session);
    content = <>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <p><span className="font-semibold">{auth.session.account.name}</span><br /><span>Rol: {auth.session.account.role}</span></p>
        <button onClick={() => { void auth.logout(); }}>Cerrar sesión</button>
      </header>
      <SessionWarning expiresAt={auth.session.expiresAt} logout={auth.logout} />
      <Routes>
        <Route path="/compras" element={home === '/compras' ? <Administration /> : <Navigate to={home} replace />} />
        <Route path="/academico" element={home === '/academico' ? <Academic /> : <Navigate to={home} replace />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </>;
  }
  return <main className="mx-auto my-12 max-w-xl rounded-xl bg-white p-6 shadow-sm"><p className="mb-6 text-sm text-slate-600">Cenit · Demostración de acceso local</p>{content}</main>;
}
