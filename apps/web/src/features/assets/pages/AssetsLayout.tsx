import type { ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { HandArrowDownIcon } from '@phosphor-icons/react/dist/csr/HandArrowDown';
import { AssetsHeader } from '../components/AssetsUi.js';
import { AddPerson } from './People.js';
import '../assets.css';
import '../../purchases/records.css';

const actions: Record<string, ReactNode> = {
  '/administracion/bienes/entregas': <Link className="cenit-button cenit-button--primary" to="/administracion/bienes/entregas/nueva"><HandArrowDownIcon size={16} aria-hidden="true" />Nueva entrega</Link>,
  '/administracion/bienes/prestamos': <Link className="cenit-button cenit-button--primary" to="/administracion/bienes/prestamos/nuevo"><PlusIcon size={16} aria-hidden="true" />Nuevo préstamo</Link>,
  '/administracion/bienes/responsables': <AddPerson />,
};

/** Marco de los cuatro listados: el encabezado y los resúmenes se montan una vez; al cambiar de pestaña sólo cambia el contenido de abajo. */
export function AssetsLayout() {
  const path = useLocation().pathname;
  return <section className={`assets-page${path.endsWith('/responsables') ? '' : ' purchase-records'}`}>
    <AssetsHeader actions={actions[path]} />
    <Outlet />
  </section>;
}
