import { LoadingLabel, Skeleton } from '../../../shared/components/Skeleton.js';

export function PurchaseDetailSkeleton() {
  return <>
    <LoadingLabel>Cargando detalle…</LoadingLabel>
    <div className="purchase-detail-section purchase-detail-summary" aria-hidden="true">
      <div className="purchase-detail-heading__amount"><Skeleton width="7rem" /><strong><Skeleton width="8rem" height="1em" /></strong></div>
      <div className="purchase-detail-facts">{[0, 1, 2].map(index => <div key={index}><Skeleton width="6rem" /><Skeleton className="purchase-loading__value" width="8rem" /></div>)}</div>
    </div>
    <div className="purchase-detail-section" aria-hidden="true"><div className="purchase-list-heading"><Skeleton width="9rem" height="22px" /></div>
      <div className="purchase-detail-items">{[0, 1, 2].map(index => <div className="purchase-item purchase-loading__item" key={index}><Skeleton width="40%" /><Skeleton width="5rem" /></div>)}</div>
    </div>
    <div className="purchase-detail-columns" aria-hidden="true">{[0, 1].map(index => <div className="purchase-detail-box purchase-loading__panel" key={index}>
      <Skeleton width="60%" height="22px" /><Skeleton width="80%" /><Skeleton width="65%" />
    </div>)}</div>
  </>;
}

export function PurchaseEditSkeleton() {
  return <>
    <LoadingLabel>Cargando detalle…</LoadingLabel>
    <div className="purchase-form-layout" aria-hidden="true">
      <div className="purchase-loading__panel"><Skeleton width="9rem" height="22px" />
        <div className="purchase-input-grid purchase-main-grid">{[0, 1, 2, 3].map(index => <div className={`purchase-loading__panel${index === 3 ? ' purchase-input--wide' : ''}`} key={index}><Skeleton width="7rem" /><Skeleton height={index === 3 ? '72px' : '42px'} /></div>)}</div>
        <Skeleton width="10rem" height="22px" /><div className="purchase-item purchase-loading__item"><Skeleton width="48%" /></div>
      </div>
      <div className="purchase-form-summary purchase-detail-box purchase-loading__panel"><Skeleton width="8rem" height="22px" /><Skeleton /><Skeleton width="64%" /></div>
    </div>
  </>;
}
