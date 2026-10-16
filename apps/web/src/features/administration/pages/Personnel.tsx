import { Link } from 'react-router';
import { UsersIcon } from '@phosphor-icons/react/dist/csr/Users';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
export function Personnel() {
  return <section className="admin-empty"><span className="admin-empty__icon"><UsersIcon size={28} aria-hidden="true" /></span><p className="admin-section-label">Administración</p><h1>Sistema de personal</h1><p>Módulo no disponible</p><Link className="admin-button" to="/administracion"><ArrowLeftIcon size={15} aria-hidden="true" />Volver a Inicio</Link></section>;
}
