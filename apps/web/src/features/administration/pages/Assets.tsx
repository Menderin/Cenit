import { Link } from 'react-router';
import { PackageIcon } from '@phosphor-icons/react/dist/csr/Package';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
export function Assets() {
  return <section className="admin-empty"><span className="admin-empty__icon"><PackageIcon size={28} aria-hidden="true" /></span><p className="admin-section-label">Administración</p><h1>Sistema de bienes</h1><p>Módulo no disponible</p><Link className="admin-button" to="/administracion"><ArrowLeftIcon size={15} aria-hidden="true" />Volver a Inicio</Link></section>;
}
