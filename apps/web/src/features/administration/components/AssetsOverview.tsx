import { Link } from 'react-router';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle';
import type { LoanListResponse } from '@cenit/contracts/assets';
import { useQuery } from '@tanstack/react-query';
import { daysFromToday, relativeDue } from '../../assets/model/labels.js';
import { listLoans } from '../../assets/api/assets.js';
import { Skeleton } from '../../../shared/components/Skeleton.js';
import { useWholeRows } from './useWholeRows.js';

// Bienes en Inicio muestra lo que pide una acción: los préstamos vencidos, uno por fila. Sin vencidos, las próximas
// devoluciones. Trae hasta ocho, como las últimas compras, para que la columna lateral se reparta casi por mitades; lo
// que no cabe desplaza dentro de la lista y el titular abre la lista completa.
const PAGE = 8;
type Loan = LoanListResponse['data'][number];

const loanName = (loan: Loan) => `${loan.items[0]?.description ?? `Préstamo ${loan.number}`}${loan.items.length > 1 ? ` y ${loan.items.length - 1} más` : ''}`;

function LoanRows({ loans, badge }: { loans: Loan[]; badge: (loan: Loan) => { text: string; tone?: 'danger' | 'warning' } }) {
  const [box, list] = useWholeRows<HTMLDivElement, HTMLDivElement>(loans.length);
  return <div ref={box} className="home-fit"><div ref={list} className="home-fit__scroll"><ul className="home-assets__list">{loans.map(loan => {
    const { text, tone } = badge(loan);
    return <li key={loan.id} data-row><Link to={`/administracion/bienes/prestamos/${loan.id}`}>
      <span><strong title={loanName(loan)}>{loanName(loan)}</strong><small>{loan.borrowerName}</small></span>
      <em className={tone ? `is-${tone}` : undefined}>{text}</em>
    </Link></li>;
  })}</ul></div></div>;
}

export function AssetsSection() {
  const overdue = useQuery({ queryKey: ['assets', 'home', 'overdue'], queryFn: ({ signal }) => listLoans({ status: 'vencido', page: 1, pageSize: PAGE }, signal), refetchOnMount: 'always' });
  const total = overdue.data?.pagination.total ?? 0;
  // Las próximas devoluciones sólo se piden cuando no hay vencidos (el servidor las ordena por fecha de devolución).
  const upcoming = useQuery({ queryKey: ['assets', 'home', 'upcoming'], queryFn: ({ signal }) => listLoans({ status: 'activo', page: 1, pageSize: PAGE }, signal),
    refetchOnMount: 'always', enabled: overdue.isSuccess && !total });
  const loading = <div className="home-loading-lines"><Skeleton width="70%" height="24px" /><Skeleton width="90%" /><Skeleton width="80%" /></div>;
  // El estado va junto al título, como etiqueta: así Bienes y las últimas compras tienen encabezados iguales y sus listas
  // reciben el mismo alto. La etiqueta de vencidos abre la lista completa.
  const badge = overdue.isSuccess ? total
    ? <Link className="home-assets__badge is-danger" to="/administracion/bienes/prestamos?estado=vencido" aria-label={`Ver ${total === 1 ? 'el préstamo vencido' : `los ${total} préstamos vencidos`}`}>{total} {total === 1 ? 'vencido' : 'vencidos'}</Link>
    : <span className="home-assets__badge is-success"><CheckCircleIcon size={15} weight="fill" aria-hidden="true" />Sin vencidos</span> : null;
  return <section className="home-rail__section home-assets" aria-labelledby="assets-title">
    <div className="home-heading"><span className="home-heading__title"><h2 id="assets-title">Bienes</h2>{badge}</span><Link to="/administracion/bienes">Ir a Bienes<ArrowRightIcon size={16} aria-hidden="true" /></Link></div>
    {overdue.isPending ? loading
      : overdue.isError ? <p className="home-muted">No se pudieron cargar los préstamos.</p>
      // El encabezado ya dice «vencidos»: cada fila sólo dice cuánto lleva de atraso.
      : total ? <LoanRows loans={overdue.data.data} badge={loan => ({ text: relativeDue(loan.dueOn).replace(/^Vencido /, ''), tone: 'danger' })} />
      : upcoming.isPending ? loading
      : upcoming.isError ? <p className="home-muted">No se pudieron cargar las próximas devoluciones.</p>
      : upcoming.data.pagination.total ? <>
        <h3 className="home-assets__subtitle">Próximas devoluciones <span>{upcoming.data.pagination.total}</span></h3>
        <LoanRows loans={upcoming.data.data} badge={loan => ({ text: relativeDue(loan.dueOn), tone: loan.dueOn && daysFromToday(loan.dueOn) <= 7 ? 'warning' : undefined })} />
      </> : <p className="home-muted">No hay bienes prestados en este momento.</p>}
  </section>;
}
