import type { ComponentType } from 'react';
import { Link } from 'react-router';

export function UpcomingModule({ name, icon: Icon }: { name: string; icon: ComponentType<{ size?: number; 'aria-hidden'?: 'true' }> }) {
  return <section className="cenit-empty cenit-empty--page admin-upcoming">
    <span className="cenit-empty__icon"><Icon size={28} aria-hidden="true" /></span>
    <span className="admin-upcoming__badge">Próximamente</span>
    <h1>{name} todavía no está disponible</h1>
    <p>Este módulo se definirá con la Facultad antes de construirlo. Por ahora puedes trabajar en Compras.</p>
    <Link className="cenit-button cenit-button--primary" to="/administracion/compras">Ir a Registro de compras</Link>
  </section>;
}
