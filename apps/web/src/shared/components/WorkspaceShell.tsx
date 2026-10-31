import type { HTMLAttributes, ReactNode } from 'react';
import { SidebarSimpleIcon } from '@phosphor-icons/react/dist/csr/SidebarSimple';
import { SignOutIcon } from '@phosphor-icons/react/dist/csr/SignOut';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import type { useSidebar } from '../lib/use-sidebar.js';
import './workspace.css';

// Shared frame for the administrative and academic workspaces; each page keeps its own navigation, toolbar and main content.
export function WorkspaceShell({ sidebarState, className, rootProps, skip, navigationId, navigationLabel, brand, navigation, account, logout, toolbarStart, toolbarEnd, toolbarClassName = '', children }: {
  sidebarState: ReturnType<typeof useSidebar>; className: string; rootProps?: HTMLAttributes<HTMLDivElement>;
  skip: { href: string; label: string }; navigationId: string; navigationLabel: string; brand: ReactNode; navigation: ReactNode;
  account: { name: string; role: string }; logout: (origin?: HTMLElement) => Promise<void>;
  toolbarStart: ReactNode; toolbarEnd?: ReactNode; toolbarClassName?: string; children: ReactNode;
}) {
  const { collapsed, setCollapsed, mobile, sidebar, panel, toggle, mounted, closing } = sidebarState;
  const signOut = (origin: HTMLElement) => { origin.focus({ preventScroll: true }); void logout(origin); };
  return <div className={`workspace ${className}`} {...rootProps}>
    <a className="workspace-skip" href={skip.href}>{skip.label}</a>
    <div className={`workspace-shell${collapsed ? ' workspace-shell--collapsed' : ''}`}>
      {mobile && mounted && <div className={`workspace-nav-overlay${closing ? ' workspace-nav-overlay--closing' : ''}`} aria-hidden="true" onClick={() => setCollapsed(true)} />}
      <aside ref={sidebar} className="workspace-sidebar" id={navigationId} inert={collapsed} aria-hidden={collapsed} role={mobile ? 'dialog' : undefined} aria-modal={mobile && !collapsed ? true : undefined} aria-label={navigationLabel}>
        <div className="workspace-sidebar-content">
          <button type="button" className="workspace-nav-close cenit-button cenit-button--icon" aria-label="Cerrar navegación" onClick={() => setCollapsed(true)}><XIcon size={20} aria-hidden="true" /></button>
          {brand}
          {navigation}
          <div className="workspace-sidebar__bottom">
            <button type="button" className="workspace-nav-item" onClick={event => signOut(event.currentTarget)}><SignOutIcon size={18} aria-hidden="true" />Cerrar sesión</button>
            <div className="workspace-account"><span className="workspace-avatar" aria-hidden="true">{account.name.trim().charAt(0)}</span><div><strong>{account.name}</strong><span>{account.role}</span></div></div>
          </div>
        </div>
      </aside>
      <div ref={panel} className="workspace-main">
        <header className={`workspace-toolbar ${toolbarClassName}`.trim()}>
          <div className="workspace-toolbar__start">
            <button ref={toggle} type="button" className="cenit-button cenit-button--icon" aria-label={collapsed ? 'Mostrar navegación' : 'Ocultar navegación'} aria-expanded={!collapsed} aria-controls={navigationId} onClick={() => setCollapsed(!collapsed)}><SidebarSimpleIcon size={20} aria-hidden="true" /></button>
            {toolbarStart}
          </div>
          <div className="workspace-toolbar__end">
            {toolbarEnd}
            {collapsed && <button type="button" className="cenit-button cenit-button--icon" aria-label="Cerrar sesión" onClick={event => signOut(event.currentTarget)}><SignOutIcon size={18} aria-hidden="true" /></button>}
          </div>
        </header>
        {children}
      </div>
    </div>
  </div>;
}
