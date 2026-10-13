import { useEffect, useRef } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { useAuth, destination } from '../features/auth/model/session.js';
import { Login } from '../features/auth/pages/Login.js';
import { AccessLayout } from '../features/auth/components/AccessLayout.js';
import { SessionWarning } from '../features/auth/components/SessionWarning.js';
import { Academic } from '../features/academic/pages/Academic.js';

function AreaUnderConstruction({ title }: { title: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <div className="cenit-access__completion">
    <h1 id="access-title" ref={heading} tabIndex={-1}>{title}</h1>
    <p className="cenit-access__intro">Este espacio está en construcción.</p>
  </div>;
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
    <p className="cenit-access__notice cenit-access__error" role="alert">{auth.message}</p>
    <button className="cenit-access__primary" onClick={() => { void (auth.status === 'logout-error' ? auth.logout() : auth.refresh()); }}>Reintentar</button>
  </>;
  else if (!auth.session) content = <Routes><Route path="/login" element={<Login />} /><Route path="*" element={<Navigate to="/login" replace />} /></Routes>;
  else {
    const home = destination(auth.session);
    content = <>
      <Routes>
        <Route path="/administracion" element={home === '/administracion' ? <AreaUnderConstruction title="Administración" /> : <Navigate to={home} replace />} />
        <Route path="/academico" element={home === '/academico' ? <AreaUnderConstruction title="Área académica" /> : <Navigate to={home} replace />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
      <p className="cenit-access__account"><span>{auth.session.account.name}</span><span>Rol: {auth.session.account.role}</span></p>
      <SessionWarning expiresAt={auth.session.expiresAt} logout={auth.logout} />
      <button className="cenit-access__primary" onClick={() => { void auth.logout(); }}>Cerrar sesión</button>
    </>;
  }
  return <AccessLayout>{content}</AccessLayout>;
}
