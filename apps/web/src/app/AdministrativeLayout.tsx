import { useEffect, useRef, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import type { Account } from '@cenit/contracts/auth';
import { SessionWarning } from '../features/auth/components/SessionWarning.js';
import './administration.css';
const navigation = [
  { to: '/administracion', label: 'Home', end: true },
  { to: '/administracion/compras', label: 'Sistema de compra', end: false },
  { to: '/administracion/personal', label: 'Sistema de personal', end: false },
  { to: '/administracion/bienes', label: 'Sistema de bienes', end: false },
];
export function AdministrativeLayout({ account, expiresAt, logout, children }: {
  account: Account; expiresAt: string; logout: () => Promise<void>; children: ReactNode;
}) {
  const location = useLocation(), main = useRef<HTMLElement>(null);
  useEffect(() => { main.current?.focus(); window.scrollTo(0, 0); }, [location.pathname]);
  return <div className="admin-shell">
    <a className="admin-skip" href="#admin-content">Ir al contenido</a>
    <header className="admin-header"><div className="admin-header__inner">
      <NavLink to="/administracion" className="admin-brand" aria-label="Cenit, inicio administrativo">Cenit</NavLink>
      <div className="admin-account"><span>{account.name}</span><span>Rol: {account.role}</span></div>
      <button className="admin-logout" data-session-exit onClick={() => { void logout(); }}>Cerrar sesión</button>
    </div></header>
    <nav className="admin-nav" aria-label="Sistemas administrativos"><div className="admin-nav__inner">
      {navigation.map(link => <NavLink key={link.to} to={link.to} end={link.end}>{link.label}</NavLink>)}
    </div></nav>
    <main className="admin-content" id="admin-content" ref={main} tabIndex={-1}>
      <SessionWarning expiresAt={expiresAt} logout={logout} />
      {children}
    </main>
  </div>;
}
