import type { MouseEvent } from 'react';
import { Link } from 'react-router';
import { ArrowDownIcon } from '@phosphor-icons/react/dist/csr/ArrowDown';
import { ArrowUpIcon } from '@phosphor-icons/react/dist/csr/ArrowUp';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import type { PurchaseBreakdown, PurchaseSummaryResponse } from '@cenit/contracts/purchases';
import { PurchaseCapabilitiesProvider, usePurchaseCapabilities } from '../../purchases/model/capabilities.js';
import { SheetsSyncStatus } from '../../purchases/components/SheetsSyncStatus.js';
import { amountLabel } from '../../purchases/model/fields.js';
import { MonthlyChart } from './MonthlyChart.js';
import { AssetsSection } from './AssetsOverview.js';
import { BarList, MonthBars, largestOf, percent, relativeLength, share } from './charts.js';
import { useWholeRows } from './useWholeRows.js';

type Summary = PurchaseSummaryResponse['data'];
type Overview = NonNullable<Summary['overview']>;
const monthName = new Intl.DateTimeFormat('es-CL', { month: 'long', timeZone: 'UTC' });
export const monthLabel = (month: string) => monthName.format(new Date(`${month}-01T12:00:00Z`));
export const purchasesLabel = (count: number) => `${count} ${count === 1 ? 'compra' : 'compras'}`;
const capitalized = (text: string) => text.charAt(0).toLocaleUpperCase('es') + text.slice(1);

function Integrations({ data }: { data: Summary }) {
  const { secondReviewEnabled } = usePurchaseCapabilities();
  return <>
    {secondReviewEnabled && <section className="dashboard-review" aria-label="Segunda revisión"><h2 className="purchase-sr-only">Revisión de datos en Cenit</h2><p>{data.pending} {data.pending === 1 ? 'registro por revisar' : 'registros por revisar'}</p><strong title="Monto documental por revisar">{amountLabel(data.pendingAmount)} <small className="purchase-sr-only">documentales por revisar</small></strong><Link to="/administracion/compras">Ver revisión</Link></section>}
    <SheetsSyncStatus />
  </>;
}

/** Ranking por cuenta contable en la columna lateral: las seis mayores y el resto agrupado. */
export function AccountsSection({ accounts, total, label, fill = false }: { accounts: PurchaseBreakdown[]; total: string; label: string; fill?: boolean }) {
  const shown = accounts.slice(0, 6), rest = BigInt(total) - shown.reduce((sum, account) => sum + BigInt(account.amount), 0n);
  const rows = [...shown, ...(rest > 0n ? [{ code: null, name: 'Otras cuentas', count: accounts.slice(6).reduce((sum, account) => sum + account.count, 0), amount: rest.toString() }] : [])];
  const largest = largestOf(rows);
  return <section className={`home-rail__section${fill ? ' home-rail__section--fill' : ''}`} aria-labelledby="accounts-title">
    <div className="home-heading"><h2 id="accounts-title">Por cuenta contable</h2></div>
    {rows.length && BigInt(total) > 0n ? <BarList label={label} items={rows.map(row => ({ key: row.code ?? row.name ?? 'none', code: row.code, label: row.name ?? (row.code ? 'Sin nombre en el catálogo' : 'Sin cuenta contable'),
      amount: row.amount, length: relativeLength(row.amount, largest), muted: !row.code, detail: percent(share(row.amount, total)) }))} />
      : <p className="home-muted">Sin cuentas contables registradas.</p>}
  </section>;
}

/** Cifras del año junto a su gráfico mensual: el número y su evolución se leen como una sola pieza. */
function YearSpending({ overview, year, current }: { overview: Overview; year: string; current: boolean }) {
  const months = overview.monthlyTotals ?? [], index = Number(overview.registrationMonth.slice(5, 7)) - 1;
  const previous = current && index > 0 ? months[index - 1] : undefined;
  const trend = previous && BigInt(previous.amount) > 0n ? Number((BigInt(overview.documentTotalThisMonth) - BigInt(previous.amount)) * 1000n / BigInt(previous.amount)) / 10 : null;
  const peak = months.reduce<(typeof months)[number] | undefined>((top, month) => !top || BigInt(month.amount) > BigInt(top.amount) ? month : top, undefined);
  const empty = !months.some(month => BigInt(month.amount) > 0n);
  return <section className="home-spend" aria-labelledby="spend-title">
    <h2 id="spend-title" className="purchase-sr-only">Gasto de {year}</h2>
    <dl className="home-figures">
      <div className="home-figure home-figure--main"><dt>Gasto en {year}</dt>
        <dd className="home-figure__value" title={overview.documentTotalThisYear ? amountLabel(overview.documentTotalThisYear) : undefined}>{overview.documentTotalThisYear ? amountLabel(overview.documentTotalThisYear) : '—'}</dd>
        <dd className="home-figure__detail">{purchasesLabel(overview.registeredThisYear)}{overview.projectCount ? ` · ${overview.projectCount} ${overview.projectCount === 1 ? 'proyecto' : 'proyectos'}` : ''}</dd></div>
      {current ? <div className="home-figure"><dt>{capitalized(monthLabel(overview.registrationMonth))}, a la fecha</dt>
        <dd className="home-figure__value" title={amountLabel(overview.documentTotalThisMonth)}>{amountLabel(overview.documentTotalThisMonth)}</dd>
        <dd className="home-figure__detail">{purchasesLabel(overview.registeredThisMonth)}</dd>
        {trend !== null && previous && <dd className="home-figure__trend">{trend > 0 ? <ArrowUpIcon size={15} aria-hidden="true" /> : trend < 0 ? <ArrowDownIcon size={15} aria-hidden="true" /> : null}
          <span className="purchase-sr-only">{trend > 0 ? 'Sube' : trend < 0 ? 'Baja' : 'Igual'} </span>{Math.abs(Math.round(trend))}% frente a {monthLabel(previous.month)}</dd>}</div>
        : <div className="home-figure"><dt>Mes de mayor gasto</dt><dd className="home-figure__value">{peak && BigInt(peak.amount) ? amountLabel(peak.amount) : '—'}</dd>
          <dd className="home-figure__detail">{peak && BigInt(peak.amount) ? `${capitalized(monthLabel(peak.month))} · ${purchasesLabel(peak.count)}` : 'Sin compras ese año'}</dd></div>}
    </dl>
    {empty ? <p className="home-muted home-spend__empty">Aún no hay compras con fecha de envío en {year}.</p>
      : <MonthlyChart months={months} current={current ? overview.registrationMonth : null} />}
  </section>;
}

/** La pregunta del cliente: cuánto gasta cada proyecto, qué parte del gasto del año es (la barra, con su porcentaje) y en
 *  qué meses. Cada fila abre su resumen. */
function ProjectTable({ overview, year, current, onProject }: { overview: Overview; year: string; current: boolean; onProject: (code: string) => void }) {
  const projects = overview.projects ?? [], lineTotal = overview.lineTotal ?? '0';
  const [box, list] = useWholeRows<HTMLDivElement, HTMLDivElement>(projects.length);
  const index = current ? Number(overview.registrationMonth.slice(5, 7)) - 1 : undefined;
  const open = (event: MouseEvent<HTMLTableRowElement>, code: string | null) => {
    if (!code || (event.target as HTMLElement).closest('button, a') || window.getSelection()?.toString()) return;
    onProject(code);
  };
  return <section className="home-projects" aria-labelledby="projects-title">
    <div className="home-heading"><h2 id="projects-title">Gasto por proyecto</h2><span>{overview.projectCount ?? 0} {overview.projectCount === 1 ? 'proyecto' : 'proyectos'} en {year}</span></div>
    {projects.length ? <div ref={box} className="home-fit"><div ref={list} className="home-fit__scroll home-fit__scroll--table"><table className="home-table">
      <thead><tr><th scope="col">Proyecto</th><th scope="col">Parte del año</th><th scope="col" className="home-table__num">Monto</th><th scope="col">Gasto por mes</th><th scope="col"><span className="purchase-sr-only">Abrir</span></th></tr></thead>
      <tbody>{projects.map(project => {
        const name = project.name ?? (project.code ? 'Sin nombre en el catálogo' : 'Sin código de proyecto'), part = share(project.amount, lineTotal);
        return <tr key={project.code ?? 'none'} data-row className={project.code ? 'is-link' : 'is-muted'} onClick={event => open(event, project.code)}>
          <th scope="row">{project.code
            ? <button type="button" onClick={() => onProject(project.code!)} aria-label={`Ver el resumen del proyecto ${project.code} ${name}`} title={name}><strong>{name}</strong><small>{project.code} · {purchasesLabel(project.count)}</small></button>
            : <span title={name}><strong>{name}</strong><small>{purchasesLabel(project.count)}</small></span>}</th>
          <td className="home-table__bar"><span><span aria-hidden="true"><i style={{ width: `${Math.max(part * 100, BigInt(project.amount) > 0n ? 1.5 : 0)}%` }} /></span><b>{percent(part)}</b></span></td>
          <td className="home-table__num"><b>{amountLabel(project.amount)}</b></td>
          <td className="home-table__months">{project.months && <MonthBars values={project.months} current={index} />}</td>
          <td className="home-table__go" aria-hidden="true">{project.code && <CaretRightIcon size={18} />}</td>
        </tr>;
      })}</tbody>
    </table></div></div> : <p className="home-muted">Aún no hay compras con proyecto en {year}.</p>}
  </section>;
}

/** Vista general: en la columna principal el gasto del año y por proyecto; al costado, Bienes y las cuentas contables. */
export function GeneralOverview({ data, onProject }: { data: Summary; onProject: (code: string) => void }) {
  const overview = data.overview;
  if (!overview) return <PurchaseCapabilitiesProvider fallback={null}><Integrations data={data} /></PurchaseCapabilitiesProvider>;
  const year = overview.year ?? overview.registrationMonth.slice(0, 4), current = year === overview.registrationMonth.slice(0, 4);
  return <div className="home-layout">
    <div className="home-main">
      <YearSpending overview={overview} year={year} current={current} />
      <ProjectTable overview={overview} year={year} current={current} onProject={onProject} />
    </div>
    <aside className="home-rail" aria-label="Bienes y cuentas contables">
      <AssetsSection />
      <AccountsSection accounts={overview.accounts ?? []} total={overview.lineTotal ?? '0'} label="Gasto por cuenta contable" fill />
      <PurchaseCapabilitiesProvider fallback={null}><div className="home-rail__section home-rail__status"><Integrations data={data} /></div></PurchaseCapabilitiesProvider>
    </aside>
  </div>;
}
