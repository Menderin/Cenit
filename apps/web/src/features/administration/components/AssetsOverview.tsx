import { Link } from 'react-router';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle';
import { ClockIcon } from '@phosphor-icons/react/dist/csr/Clock';
import { ListBulletsIcon } from '@phosphor-icons/react/dist/csr/ListBullets';
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { useQuery } from '@tanstack/react-query';
import { getAssetSummary, listLoans } from '../../assets/api/assets.js';
import { relativeDue } from '../../assets/model/labels.js';
import { Skeleton } from '../../../shared/components/Skeleton.js';
import { useWholeRows } from './useWholeRows.js';

// Bienes en Inicio muestra sólo lo que pide una acción: los préstamos vencidos, uno por fila, y lo que vence pronto.
const SHOWN = 5;

export function AssetsSection() {
  const summary = useQuery({ queryKey: ['assets', 'home', 'summary'], queryFn: ({ signal }) => getAssetSummary(signal), refetchOnMount: 'always' });
  const loans = useQuery({ queryKey: ['assets', 'home', 'overdue'], queryFn: ({ signal }) => listLoans({ status: 'vencido', page: 1, pageSize: SHOWN }, signal), refetchOnMount: 'always' });
  const data = summary.data, overdue = loans.data?.pagination.total ?? data?.overdue ?? 0;
  const [box, list] = useWholeRows<HTMLDivElement, HTMLDivElement>(loans.data?.data.length ?? 0);
  const fetched = loans.data?.data.length ?? 0;
  return <section className="home-rail__section home-assets" aria-labelledby="assets-title">
    <div className="home-heading"><h2 id="assets-title">Bienes</h2><Link to="/administracion/bienes">Ir a Bienes<ArrowRightIcon size={16} aria-hidden="true" /></Link></div>
    {loans.isPending ? <div className="home-loading-lines"><Skeleton width="70%" height="24px" /><Skeleton width="90%" /><Skeleton width="80%" /></div>
      : loans.isError ? <p className="home-muted">No se pudieron cargar los préstamos.</p>
      : overdue ? <>
        <p className="home-assets__headline">{overdue} {overdue === 1 ? 'préstamo vencido' : 'préstamos vencidos'}</p>
        <div ref={box} className="home-fit"><div ref={list} className="home-fit__scroll"><ul className="home-assets__list">{loans.data.data.map(loan => <li key={loan.id} data-row><Link to={`/administracion/bienes/prestamos/${loan.id}`}>
          <span><strong>{loan.items[0]?.description ?? `Préstamo ${loan.number}`}{loan.items.length > 1 && ` y ${loan.items.length - 1} más`}</strong><small>{loan.borrowerName}</small></span>
          {/* El titular ya dice «vencidos»: cada fila sólo dice cuánto lleva de atraso. */}
          <em>{relativeDue(loan.dueOn).replace(/^Vencido /, '')}</em>
        </Link></li>)}</ul></div></div>
      </> : <p className="home-assets__clear"><CheckCircleIcon size={22} aria-hidden="true" />Sin préstamos vencidos</p>}
    {(overdue > fetched || (data && (data.dueSoon || data.review))) ? <div className="home-assets__more">
      {overdue > fetched && <Link className="home-chip" to="/administracion/bienes/prestamos?estado=vencido"><ListBulletsIcon size={16} aria-hidden="true" />Ver los {overdue} vencidos<ArrowRightIcon size={14} aria-hidden="true" /></Link>}
      {!!data?.dueSoon && <Link className="home-chip home-chip--warning" to="/administracion/bienes/prestamos"><ClockIcon size={16} aria-hidden="true" />{data.dueSoon} {data.dueSoon === 1 ? 'vence' : 'vencen'} esta semana<ArrowRightIcon size={14} aria-hidden="true" /></Link>}
      {!!data?.review && <Link className="home-chip" to="/administracion/bienes?estado=revisar"><WarningCircleIcon size={16} aria-hidden="true" />{data.review} {data.review === 1 ? 'bien por revisar' : 'bienes por revisar'}<ArrowRightIcon size={14} aria-hidden="true" /></Link>}
    </div> : null}
  </section>;
}
