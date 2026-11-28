import { useEffect, useRef, type ReactNode, type MouseEvent } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { HouseIcon } from '@phosphor-icons/react/dist/csr/House';
import { ShoppingCartSimpleIcon } from '@phosphor-icons/react/dist/csr/ShoppingCartSimple';
import { UsersIcon } from '@phosphor-icons/react/dist/csr/Users';
import { PackageIcon } from '@phosphor-icons/react/dist/csr/Package';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import type { Account } from '@cenit/contracts/auth';
import { SessionWarning } from '../features/auth/components/SessionWarning.js';
import { AccountProfileLink } from '../features/auth/components/AccountProfileLink.js';
import { usePurchaseReturnTo } from '../features/purchases/model/location.js';
import { usePurchaseGuard } from '../features/purchases/model/guard.js';
import { useSidebar } from '../shared/lib/use-sidebar.js';
import { WorkspaceShell } from '../shared/components/WorkspaceShell.js';
import './administration.css';
const navigation = [
  { to: '/administracion', label: 'Inicio', end: true, icon: HouseIcon },
  { to: '/administracion/compras', label: 'Registro de compras', end: false, icon: ShoppingCartSimpleIcon },
  { to: '/administracion/personal', label: 'Personal', end: false, icon: UsersIcon },
  { to: '/administracion/bienes', label: 'Bienes', end: false, icon: PackageIcon },
];
// Pantallas de Bienes: nombre de la página y si cuelga de la entrada del módulo.
function assetPage(path: string) {
  const rest = path.slice('/administracion/bienes'.length);
  const fixed: Record<string, string> = { '': 'Bienes', '/nuevo': 'Registrar bien', '/entregas': 'Entregas', '/entregas/nueva': 'Nueva entrega', '/prestamos': 'Préstamos', '/prestamos/nuevo': 'Nuevo préstamo', '/responsables': 'Responsables' };
  return fixed[rest] ?? (rest.startsWith('/entregas/') ? 'Entrega' : rest.startsWith('/prestamos/') ? 'Préstamo' : rest.endsWith('/editar') ? 'Editar bien' : 'Ficha del bien');
}
// Documentos de Personal: su ruta superior sale de Personal.
const personnelDocuments: Record<string, string> = {
  '/administracion/personal/comision': 'Comisión de servicios', '/administracion/personal/permiso': 'Solicitud de permiso',
};
// Los listados de Bienes comparten encabezado: la animación de entrada no debe repetirse al cambiar entre ellos.
const bienesLists = new Set(['/administracion/bienes', '/administracion/bienes/entregas', '/administracion/bienes/prestamos', '/administracion/bienes/responsables']);

export function AdministrativeLayout({ account, expiresAt, logout, children }: {
  account: Account; expiresAt: string; logout: (origin?: HTMLElement) => Promise<void>; children: ReactNode;
}) {
  const location = useLocation(), main = useRef<HTMLElement>(null);
  const focusedPath = useRef('');
  const returnTo = usePurchaseReturnTo();
  const guard = usePurchaseGuard(), navigate = useNavigate();
  function revealFocus(target: HTMLElement) {
    if (!target.matches('input, textarea, select, button, summary, a')) return;
    requestAnimationFrame(() => {
      if (!target.isConnected || document.activeElement !== target || !main.current?.contains(target)) return;
      const content = main.current.getBoundingClientRect(), field = target.getBoundingClientRect();
      const top = Math.max(content.top, main.current.previousElementSibling?.getBoundingClientRect().bottom ?? 0, 0);
      const bottom = Math.min(content.bottom, window.innerHeight);
      if (field.top < top + 16 || field.bottom > bottom - 16) target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }
  function follow(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const target = event.currentTarget;
    target.focus({ preventScroll: true });
    guard.request(() => { navigate(target.pathname + target.search); }, target);
  }
  const sidebarState = useSidebar();
  function navItem({ icon: Icon, ...link }: typeof navigation[number]) {
    return <NavLink key={link.to} to={link.to} end={link.end} onClick={follow} className={({ isActive }) => `workspace-nav-item${isActive ? ' workspace-nav-item--active' : ''}`}>
      {({ isActive }) => <><Icon size={18} weight={isActive ? 'fill' : 'regular'} aria-hidden="true" /><span>{link.label}</span></>}
    </NavLink>;
  }
  const current = navigation.find(link => link.end ? location.pathname === link.to : location.pathname.startsWith(link.to));
  const page = location.pathname === '/administracion/perfil' ? 'Mi perfil' : location.pathname === '/administracion/compras/nueva' ? 'Registrar compra'
    : location.pathname === '/administracion/compras/captura' ? 'Registrar capturas'
    : location.pathname === '/administracion/compras/laboratorio' ? 'Revisar datos'
    : /\/administracion\/compras\/[^/]+\/editar$/.test(location.pathname) ? 'Editar compra'
    : location.pathname.startsWith('/administracion/compras/') ? 'Detalle del registro'
    : location.pathname.startsWith('/administracion/bienes') ? assetPage(location.pathname)
    : personnelDocuments[location.pathname] ?? current?.label ?? 'Inicio';
  const parent = page === current?.label ? null : current?.to === '/administracion/personal' ? { label: 'Personal', to: current.to }
    : current?.to === '/administracion/bienes' ? { label: 'Bienes', to: current.to } : { label: 'Compras', to: returnTo };
  const purchaseRegister = location.pathname === '/administracion/compras' || page === 'Detalle del registro';
  const contentPath = purchaseRegister ? '/administracion/compras' : location.pathname;
  useEffect(() => { document.title = `Cenit · ${page}`; return () => { document.title = 'Cenit'; }; }, [page]);
  useEffect(() => {
    if (focusedPath.current === contentPath) return;
    focusedPath.current = contentPath;
    main.current?.scrollTo(0, 0); window.scrollTo(0, 0); main.current?.focus({ preventScroll: true });
  }, [contentPath]);
  return <WorkspaceShell sidebarState={sidebarState} className="admin-workspace" skip={{ href: '#admin-content', label: 'Ir al contenido' }}
    navigationId="admin-navigation" navigationLabel="Navegación administrativa" account={{ name: account.name, role: 'Administrativo' }} accountActions={<AccountProfileLink to="/administracion/perfil" onClick={follow} />} logout={logout}
    brand={<NavLink to="/administracion" onClick={follow} className="workspace-brand" aria-label="Cenit, inicio administrativo">Cenit<span>Espacio administrativo</span></NavLink>}
    navigation={<nav className="workspace-nav" aria-label="Sistemas administrativos">
      <p className="workspace-eyebrow">Administración</p>
      {navigation.map(link => navItem(link))}
    </nav>}
    toolbarStart={<nav className="admin-breadcrumb" aria-label="Ubicación"><NavLink to="/administracion" onClick={follow}>Administración</NavLink><CaretRightIcon size={12} aria-hidden="true" />{parent && <><NavLink to={parent.to} onClick={follow}>{parent.label}</NavLink><CaretRightIcon size={12} aria-hidden="true" /></>}<span aria-current="page" data-confirm-fallback tabIndex={-1}>{page}</span></nav>}>
    <main className={`admin-content${location.pathname === '/administracion/personal' ? ' admin-content--fill' : ''}`} id="admin-content" ref={main} tabIndex={-1} onFocusCapture={event => revealFocus(event.target)}>
      <SessionWarning expiresAt={expiresAt} logout={logout} />
      <div key={bienesLists.has(location.pathname) ? 'bienes' : contentPath} className="cenit-page-enter">{children}</div>
    </main>
  </WorkspaceShell>;
}
