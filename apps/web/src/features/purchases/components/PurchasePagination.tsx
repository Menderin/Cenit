import { CaretLeftIcon } from '@phosphor-icons/react/dist/csr/CaretLeft';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { paginationPages } from '../model/list.js';
import { Select } from '../../../shared/components/Select.js';

export function PurchasePagination({ title, page, pageSize, total, updating, setPage, setPageSize }: {
  title: string; page: number; pageSize: number; total: number; updating: boolean;
  setPage: (page: number) => void; setPageSize: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="purchase-pagination">
    <div className="purchase-pagination-summary">
      {total > 0 && <span role="status" aria-atomic="true">{Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} de {total} registros</span>}
      <div className="purchase-page-size"><span>Por página</span><Select className="cenit-button purchase-select-trigger" label={`Registros por página: ${title}`} value={String(pageSize)} disabled={updating} onValueChange={value => setPageSize(Number(value))} options={[20, 50, 100].map(size => ({ value: String(size), label: String(size) }))} /></div>
    </div>
    <div className="purchase-pagination-navigation"><span>Página {page} de {totalPages}</span>
      <nav aria-label={`Paginación: ${title}`}><ul>
        <li><button className="cenit-button" type="button" aria-label="Anterior" disabled={page === 1 || updating} onClick={() => setPage(page - 1)}><CaretLeftIcon size={16} aria-hidden="true" /></button></li>
        {paginationPages(page, totalPages).map((value, index) => <li key={value === 'ellipsis' ? `ellipsis-${index}` : value} className={typeof value === 'number' && value !== 1 && value !== page && value !== totalPages ? 'purchase-page-neighbor' : undefined}>
          {value === 'ellipsis' ? <span className="purchase-page-ellipsis" aria-hidden="true">…</span> : <button className="cenit-button" type="button" aria-label={`Página ${value}`} aria-current={value === page ? 'page' : undefined} disabled={updating} onClick={() => { if (value !== page) setPage(value); }}>{value}</button>}
        </li>)}
        <li><button className="cenit-button" type="button" aria-label="Siguiente" disabled={page >= totalPages || updating} onClick={() => setPage(page + 1)}><CaretRightIcon size={16} aria-hidden="true" /></button></li>
      </ul></nav>
    </div>
  </div>;
}
