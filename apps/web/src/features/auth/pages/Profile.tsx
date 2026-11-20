import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router';
import { useProfile } from '../model/profile.js';
import { ProfileAvatar } from '../components/ProfileAvatar.js';
import { AccountProfileLink } from '../components/AccountProfileLink.js';
import { useAuth } from '../model/session.js';
import { GoogleAccess, useGoogleAvailability } from '../components/GoogleAccess.js';
import { WorkspaceShell } from '../../../shared/components/WorkspaceShell.js';
import { LoadingLabel, Skeleton } from '../../../shared/components/Skeleton.js';
import { useSidebar } from '../../../shared/lib/use-sidebar.js';
import '../profile.css';

const roleLabels = { administrativo: 'Administrativo', docente: 'Docente', estudiante: 'Estudiante' };
export function Profile() {
  const account = useAuth().session!.account;
  const availability = useGoogleAvailability();
  const profile = useProfile();
  const google = profile.data?.google;
  const picture = google?.pictureUrl;
  return <div className="profile-page">
    <header><h1>Mi perfil</h1><p>Tu cuenta y las opciones de acceso a Cenit.</p></header>
    <section className="profile-card" aria-labelledby="profile-account-title">
      <div className="profile-identity">
        <ProfileAvatar name={account.name} pictureUrl={picture} className="profile-avatar" />
        <div><h2 id="profile-account-title">{account.name}</h2><p>{roleLabels[account.role]}</p></div>
      </div>
      <dl><div><dt>Correo de acceso local</dt><dd>{account.email}</dd></div><div><dt>Rol en Cenit</dt><dd>{roleLabels[account.role]}</dd></div></dl>
      <p className="profile-hint">La foto se actualiza al ingresar con Google. Si no está disponible, se muestra tu inicial.</p>
    </section>
    <section className="profile-card" aria-labelledby="profile-google-title">
      <h2 id="profile-google-title">Acceso con Google</h2>
      {profile.isPending && <><LoadingLabel>Consultando vinculación…</LoadingLabel><div className="profile-loading" aria-hidden="true"><Skeleton width="13rem" /><Skeleton width="19rem" /></div></>}
      {profile.isError && <><p role="alert">{profile.error.message}</p><button className="cenit-button" onClick={() => { void profile.refetch(); }}>Reintentar</button></>}
      {google && <>
        <p role={google.linked ? 'status' : undefined}>{google.linked ? 'Cuenta Google vinculada.' : 'Tu cuenta todavía no está vinculada a Google.'}</p>
        {google.email && <dl><div><dt>Correo Google autorizado</dt><dd>{google.email}</dd></div></dl>}
        {!google.enabled && <p>El acceso con Google está deshabilitado en este entorno.</p>}
        {google.enabled && !google.linked && <><p>Vincula tu cuenta Google autorizada después de entrar con tu contraseña local.</p>
          {availability.data?.enabled && <GoogleAccess purpose="link" clientId={availability.data.clientId} onLinked={() => { void profile.refetch(); }} />}
          {availability.isError && <><p role="alert">No se pudo preparar Google.</p><button className="cenit-button" onClick={() => { void availability.refetch(); }}>Reintentar Google</button></>}
        </>}
      </>}
    </section>
  </div>;
}

export function AcademicProfile() {
  const auth = useAuth(), account = auth.session!.account;
  const sidebar = useSidebar();
  const main = useRef<HTMLElement>(null);
  useEffect(() => { document.title = 'Cenit · Mi perfil'; main.current?.focus(); return () => { document.title = 'Cenit'; }; }, []);
  return <WorkspaceShell sidebarState={sidebar} className="academic-workspace" skip={{ href: '#profile-content', label: 'Ir al perfil' }}
    navigationId="academic-navigation" navigationLabel="Área académica" account={{ name: account.name, role: roleLabels[account.role] }} logout={auth.logout}
    accountActions={<AccountProfileLink to="/academico/perfil" />}
    brand={<div className="workspace-brand">Cenit<span>Consulta académica</span></div>}
    navigation={<nav className="workspace-nav" aria-label="Navegación académica"><NavLink to="/academico" className="workspace-nav-item">Malla curricular</NavLink></nav>}
    toolbarStart={<span>Mi perfil</span>}>
    <main ref={main} id="profile-content" className="profile-content" tabIndex={-1}><Profile /></main>
  </WorkspaceShell>;
}
