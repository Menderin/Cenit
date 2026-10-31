import { Link } from 'react-router';
import { UsersIcon } from '@phosphor-icons/react/dist/csr/Users';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
export function Personnel() {
  return <section className="admin-empty"><span className="admin-empty__icon"><UsersIcon size={28} aria-hidden="true" /></span><p className="admin-section-label">En preparación</p><h1>Sistema de personal</h1><p>Este módulo estará disponible en una próxima entrega.</p><Link className="cenit-button cenit-button--primary" to="/administracion/compras">Ir a Compras</Link><Link className="purchase-back-link" to="/administracion"><ArrowLeftIcon size={16} aria-hidden="true" />Volver a Inicio</Link></section>;
}
