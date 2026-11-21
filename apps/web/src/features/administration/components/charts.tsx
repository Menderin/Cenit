import type { CSSProperties } from 'react';
import { amountLabel } from '../../purchases/model/fields.js';
import { useWholeRows } from './useWholeRows.js';

// Rankings de Inicio: montos comparados con longitud sobre una base común. El reparto por cuenta del Inicio general usa
// bloques proporcionales (AccountsMap), que se leen de un vistazo como partes de un todo.

/** Proporción exacta entre montos guardados como cadenas; sólo se redondea al mostrar. */
export function share(part: string | bigint, total: string | bigint) {
  const whole = BigInt(total);
  return whole > 0n ? Number(BigInt(part) * 100000n / whole) / 100000 : 0;
}
export const percent = (value: number) => value > 0 && value < .005 ? '<1%' : `${Math.round(value * 100)}%`;
const compact = new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 });
export const compactAmount = (value: string | number) => `$${compact.format(Number(value))}`;
/** Largo relativo al mayor de la lista, para que la primera barra llene la pista. */
export const relativeLength = (amount: string, largest: bigint) => largest > 0n ? Number(BigInt(amount) * 1000n / largest) / 1000 : 0;
export const largestOf = (rows: { amount: string }[]) => rows.reduce((top, row) => BigInt(row.amount) > top ? BigInt(row.amount) : top, 0n);

export type BarItem = { key: string; code?: string | null; label: string; amount: string; detail: string; length: number; muted?: boolean };
/** Ranking compacto: nombre arriba, barra y monto debajo. Para la columna lateral (cuentas, proveedores). */
export function BarList({ items, label }: { items: BarItem[]; label: string }) {
  const [box, list] = useWholeRows<HTMLDivElement, HTMLDivElement>(items.length, true);
  return <div ref={box} className="home-fit"><div ref={list} className="home-fit__scroll" role="region" aria-label={label}><ul className="home-bars" style={{ '--rows': items.length } as CSSProperties}>{items.map(item => <li key={item.key} data-row title={item.label}>
    <span className="home-bars__name">{item.label}{item.code && <small>{item.code}</small>}</span>
    <span className="home-bars__track" aria-hidden="true"><i className={item.muted ? 'is-muted' : undefined} style={{ width: `${item.length > 0 ? Math.max(item.length * 100, 2) : 0}%` }} /></span>
    <span className="home-bars__value"><b>{amountLabel(item.amount)}</b><small>{item.detail}</small></span>
  </li>)}</ul></div></div>;
}
