import type { MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { FolderSimpleIcon } from '@phosphor-icons/react/dist/csr/FolderSimple';
import type { PurchaseProjectSummary } from '@cenit/contracts/purchases';
import { amountLabel, dateLabel, sentenceCase } from '../../purchases/model/fields.js';
import { daysFromToday } from '../../assets/model/labels.js';
import { periodRange } from '../../purchases/model/list.js';
import { MonthlyChart } from './MonthlyChart.js';
import { BarList, largestOf, percent, relativeLength, share } from './charts.js';
import { AccountsSection, purchasesLabel } from './GeneralOverview.js';
import { useWholeRows } from './useWholeRows.js';

export const projectPurchasesPath = (code: string, year: string) => `/administracion/compras?${new URLSearchParams({ ...periodRange(year), projectCode: code })}`;
const ago = (date: string) => {
  const days = -daysFromToday(date);
  return days <= 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`;
};

/** Inicio filtrado por proyecto, con la misma gramática que la vista general: el gasto y su evolución, sus compras, y al costado en qué y a quién. */
export function ProjectOverview({ data, currentMonth, onYear, onClear }: { data: PurchaseProjectSummary; currentMonth: string; onYear: (year: string) => void; onClear: () => void }) {
  const current = data.year === currentMonth.slice(0, 4);
  if (!data.count) {
    const others = data.availableYears.filter(year => String(year).padStart(4, '0') !== data.year);
    return <div className="cenit-empty cenit-empty--bordered home-project-empty">
      <span className="cenit-empty__icon"><FolderSimpleIcon size={26} aria-hidden="true" /></span>
      <h3>Sin compras de este proyecto en {data.year}</h3>
      <p>{others.length ? 'Elige otro año con compras registradas.' : 'Cuando se registre una compra con este código aparecerá aquí.'}</p>
      <div className="cenit-empty__actions">{others.map(year => <button key={year} type="button" className="cenit-button" onClick={() => onYear(String(year).padStart(4, '0'))}>{year}</button>)}
        <button type="button" className="cenit-button" onClick={onClear}>Ver todos los proyectos</button></div>
    </div>;
  }
  const part = share(data.amount, data.yearLineTotal), providers = largestOf(data.providers);
  const list = projectPurchasesPath(data.code, data.year);
  return <div className="home-layout">
    <div className="home-main">
      {data.linesWithoutAmount > 0 && <p className="cenit-notice cenit-notice--warning" role="status">{data.linesWithoutAmount} {data.linesWithoutAmount === 1 ? 'ítem no tiene importe y no se suma' : 'ítems no tienen importe y no se suman'} en los montos.</p>}
      <section className="home-spend" aria-labelledby="spend-title">
        <h2 id="spend-title" className="purchase-sr-only">Gasto del proyecto en {data.year}</h2>
        <dl className="home-figures">
          <div className="home-figure home-figure--main"><dt>Gasto del proyecto en {data.year}</dt>
            <dd className="home-figure__value" title={amountLabel(data.amount)}>{amountLabel(data.amount)}</dd>
            <dd className="home-figure__detail">{purchasesLabel(data.count)}{data.lastSentDate && ` · última ${ago(data.lastSentDate)}`}</dd></div>
          <div className="home-figure"><dt>Parte del gasto de {data.year}</dt>
            <dd className="home-figure__value">{percent(part)}</dd>
            <dd className="home-figure__share" aria-hidden="true"><i style={{ width: `${Math.max(part * 100, part > 0 ? 1 : 0)}%` }} /></dd>
            <dd className="home-figure__detail">de {amountLabel(data.yearLineTotal)}</dd></div>
        </dl>
        <MonthlyChart months={data.monthlyTotals} current={current ? currentMonth : null} />
      </section>
      <section className="home-projects" aria-labelledby="ppurchases-title">
        <div className="home-heading"><h2 id="ppurchases-title">Compras del proyecto</h2><Link to={list}>{data.count > data.purchases.length ? `Ver las ${data.count} en Registro de compras` : 'Ver en Registro de compras'}<ArrowRightIcon size={16} aria-hidden="true" /></Link></div>
        <PurchaseRows data={data} />
      </section>
    </div>
    <aside className="home-rail" aria-label="Cuentas y proveedores del proyecto"><div className="home-rail__card">
      <AccountsSection accounts={data.accounts} total={data.amount} label="Gasto del proyecto por cuenta contable" />
      <section className="home-rail__section" aria-labelledby="providers-title">
        <div className="home-heading"><h2 id="providers-title">Proveedores</h2><span>{data.providerCount}</span></div>
        <BarList label="Proveedores con más gasto" items={data.providers.map((provider, position) => ({ key: `${position}-${provider.name ?? ''}`, label: provider.name ?? 'Sin proveedor informado', amount: provider.amount,
          length: relativeLength(provider.amount, providers), detail: `${percent(share(provider.amount, data.amount))} · ${purchasesLabel(provider.count)}` }))} />
      </section>
    </div></aside>
  </div>;
}

/** Compras recientes del proyecto: muestra las filas que caben completas y desplaza el resto dentro de la tabla.
 *  Toda la fila abre la compra; el número es el enlace para teclado y lectores de pantalla. */
function PurchaseRows({ data }: { data: PurchaseProjectSummary }) {
  const [box, list] = useWholeRows<HTMLDivElement, HTMLDivElement>(data.purchases.length);
  const navigate = useNavigate();
  const open = (event: MouseEvent<HTMLTableRowElement>, path: string) => {
    if ((event.target as HTMLElement).closest('a, button') || window.getSelection()?.toString()) return;
    if (event.metaKey || event.ctrlKey) window.open(path, '_blank', 'noopener'); else navigate(path);
  };
  return <div ref={box} className="home-fit"><div ref={list} className="home-fit__scroll home-fit__scroll--table"><table className="home-table home-table--purchases">
          <thead><tr><th scope="col">Nº Documento</th><th scope="col">Proveedor y detalle</th><th scope="col">Cuenta</th><th scope="col" className="home-table__num">Monto</th><th scope="col"><span className="purchase-sr-only">Abrir</span></th></tr></thead>
          <tbody>{data.purchases.map(purchase => { const path = `/administracion/compras/${purchase.id}`; return <tr key={purchase.id} data-row className="is-link" onClick={event => open(event, path)}>
            <th scope="row" className="home-num"><Link to={path} aria-label={`Abrir la compra ${purchase.requestNumber}${purchase.provider ? ` de ${purchase.provider}` : ''}`}><strong>{purchase.requestNumber}</strong></Link><small>{dateLabel(purchase.sentDate)}</small></th>
            <td title={purchase.description}><strong>{purchase.provider ?? 'Sin proveedor'}</strong><small>{purchase.documentType ? `${sentenceCase(purchase.documentType)} · ` : ''}{purchase.description}</small></td>
            <td title={purchase.accountName ?? undefined}><strong className="home-num">{purchase.accountingCode ?? '—'}</strong>{purchase.accountName && <small>{purchase.accountName}</small>}</td>
            <td className="home-table__num"><b>{amountLabel(purchase.amount)}</b></td>
            <td className="home-table__go" aria-hidden="true"><CaretRightIcon size={18} /></td>
          </tr>; })}</tbody>
        </table></div></div>;
}
