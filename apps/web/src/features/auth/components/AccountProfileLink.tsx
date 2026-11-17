import type { MouseEvent } from 'react';
import { NavLink } from 'react-router';
import { GearIcon } from '@phosphor-icons/react/dist/csr/Gear';
import { useAuth } from '../model/session.js';
import { useProfile } from '../model/profile.js';
import { ProfileAvatar } from './ProfileAvatar.js';

const roleLabels = { administrativo: 'Administrativo', docente: 'Docente', estudiante: 'Estudiante' };
export function AccountProfileLink({ to, onClick }: { to: string; onClick?: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  const account = useAuth().session!.account;
  const profile = useProfile();
  return <NavLink to={to} onClick={onClick} className="workspace-account" aria-label="Mi perfil" title="Mi perfil">
    <ProfileAvatar name={account.name} pictureUrl={profile.data?.google.pictureUrl} className="workspace-avatar" decorative />
    <div><strong>{account.name}</strong><span>{roleLabels[account.role]}</span></div>
    <GearIcon className="workspace-account__settings" size={18} aria-hidden="true" />
  </NavLink>;
}
