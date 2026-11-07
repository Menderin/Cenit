import { amountLabel } from '../../purchases/model/fields.js';

const shortMonth = new Intl.DateTimeFormat('es-CL', { month: 'short', timeZone: 'UTC' });
const longMonth = new Intl.DateTimeFormat('es-CL', { month: 'long', timeZone: 'UTC' });
const compact = new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 });
const label = (month: string, format: Intl.DateTimeFormat) => format.format(new Date(`${month}-01T12:00:00Z`)).replace('.', '');

/** Twelve bars of documented amount by sent month. The visual is decorative; the same figures live in a table for assistive technology. */
export function MonthlyChart({ months, current }: { months: { month: string; count: number; amount: string }[]; current: string }) {
  const max = months.reduce((top, month) => BigInt(month.amount) > top ? BigInt(month.amount) : top, 0n);
  const peak = months.find(month => max > 0n && BigInt(month.amount) === max)?.month;
  return <div className="dashboard-monthly">
    <div className="dashboard-monthly__bars" aria-hidden="true">{months.map(month => {
      const amount = BigInt(month.amount), future = month.month > current;
      const height = max ? Math.max(amount ? 3 : 0, Number(amount * 1000n / max) / 10) : 0;
      const tone = month.month === peak ? ' dashboard-monthly__bar--peak' : month.month === current ? ' dashboard-monthly__bar--current' : '';
      return <div key={month.month} className={`dashboard-monthly__column${future ? ' dashboard-monthly__column--future' : ''}`} title={`${label(month.month, longMonth)}: ${amountLabel(month.amount)} · ${month.count} ${month.count === 1 ? 'compra' : 'compras'}`}>
        <span className="dashboard-monthly__value">{amount ? `$${compact.format(Number(amount))}` : ''}</span>
        <span className={`dashboard-monthly__bar${tone}`} style={{ height: `${height}%` }} />
        <span className={`dashboard-monthly__month${month.month === current ? ' dashboard-monthly__month--current' : ''}`}>{label(month.month, shortMonth)}</span>
      </div>;
    })}</div>
    <table className="purchase-sr-only"><caption>Monto documental por mes de envío</caption><thead><tr><th scope="col">Mes</th><th scope="col">Compras</th><th scope="col">Monto</th></tr></thead>
      <tbody>{months.filter(month => month.month <= current).map(month => <tr key={month.month}><th scope="row">{label(month.month, longMonth)}</th><td>{month.count}</td><td>{amountLabel(month.amount)}</td></tr>)}</tbody></table>
  </div>;
}
