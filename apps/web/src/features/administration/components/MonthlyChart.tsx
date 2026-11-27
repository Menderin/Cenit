import type { CSSProperties } from 'react';
import { amountLabel } from '../../purchases/model/fields.js';
import { compactAmount } from './charts.js';

const shortMonth = new Intl.DateTimeFormat('es-CL', { month: 'short', timeZone: 'UTC' });
const longMonth = new Intl.DateTimeFormat('es-CL', { month: 'long', timeZone: 'UTC' });
const label = (month: string, format: Intl.DateTimeFormat) => format.format(new Date(`${month}-01T12:00:00Z`)).replace('.', '');

// Escala «redonda» (1, 2 o 5 por potencia de diez) para dos o tres líneas de referencia bajo el máximo.
function ticks(max: number) {
  if (max <= 0) return [];
  const raw = max / 3, power = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find(factor => factor * power >= raw) ?? 10) * power;
  return Array.from({ length: Math.floor(max / step) }, (_, index) => (index + 1) * step);
}

/**
 * Columnas por mes con su cifra encima. El área de dibujo tiene alto fijo, así que cada barra mide exactamente
 * su proporción del mayor mes; la tabla oculta repite las cifras para lectores de pantalla.
 */
export function MonthlyChart({ months, current }: { months: { month: string; count: number; amount: string }[]; current: string | null }) {
  const max = months.reduce((top, month) => Math.max(top, Number(month.amount)), 0);
  return <figure className="home-chart">
    <div className="home-chart__plot" aria-hidden="true">
      {ticks(max).map(tick => <span key={tick} className="home-chart__grid" style={{ '--t': tick / max } as CSSProperties}><small>{compactAmount(tick)}</small></span>)}
      <div className="home-chart__columns">{months.map(month => {
        const amount = Number(month.amount), future = current !== null && month.month > current;
        return <div key={month.month} className={`home-chart__column${month.month === current ? ' is-current' : ''}${future ? ' is-future' : ''}`} style={{ '--r': max ? amount / max : 0 } as CSSProperties}>
          <span className="home-chart__value">{amount ? compactAmount(amount) : ''}</span>
          <span className="home-chart__bar" />
        </div>;
      })}</div>
    </div>
    <div className="home-chart__months" aria-hidden="true">{months.map(month => <span key={month.month} className={month.month === current ? 'is-current' : current !== null && month.month > current ? 'is-future' : undefined}>{label(month.month, shortMonth)}</span>)}</div>
    <table className="purchase-sr-only"><caption>Monto por mes</caption><thead><tr><th scope="col">Mes</th><th scope="col">Compras</th><th scope="col">Monto</th></tr></thead>
      <tbody>{months.filter(month => current === null || month.month <= current).map(month => <tr key={month.month}><th scope="row">{label(month.month, longMonth)}</th><td>{month.count}</td><td>{amountLabel(month.amount)}</td></tr>)}</tbody></table>
  </figure>;
}
