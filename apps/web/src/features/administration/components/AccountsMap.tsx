import { useLayoutEffect, useRef, useState } from 'react';
import type { PurchaseBreakdown } from '@cenit/contracts/purchases';
import { amountLabel } from '../../purchases/model/fields.js';
import { percent, share } from './charts.js';

type Tile = { key: string; name: string; code: string | null; count: number | null; amount: string; part: number; tone: string };
type Rect = { x: number; y: number; w: number; h: number };

const SHOWN = 6;
const purchases = (count: number) => `${count} ${count === 1 ? 'compra' : 'compras'}`;

/** Peor proporción (lado largo / lado corto) de una franja con estas áreas apoyada sobre un lado de largo `side`. */
const worst = (row: number[], side: number) => {
  const sum = row.reduce((total, area) => total + area, 0), max = Math.max(...row), min = Math.min(...row);
  return Math.max(side * side * max / (sum * sum), sum * sum / (side * side * min));
};

/**
 * Treemap «squarified» (Bruls, Huizing y van Wijk): reparte el rectángulo en franjas y agrega áreas a la franja mientras
 * los bloques sigan acercándose a un cuadrado. Devuelve los bloques en el mismo orden que `values`, en las unidades de
 * `box`.
 */
export function squarify(values: number[], box: Rect): Rect[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total || box.w <= 0 || box.h <= 0) return values.map(() => ({ x: box.x, y: box.y, w: 0, h: 0 }));
  const areas = values.map(value => value * box.w * box.h / total), out: Rect[] = [];
  let free = { ...box }, row: number[] = [];
  const place = () => {
    const sum = row.reduce((total, area) => total + area, 0);
    if (free.w >= free.h) {
      const width = sum / free.h;
      let y = free.y;
      for (const area of row) { out.push({ x: free.x, y, w: width, h: area / width }); y += area / width; }
      free = { x: free.x + width, y: free.y, w: free.w - width, h: free.h };
    } else {
      const height = sum / free.w;
      let x = free.x;
      for (const area of row) { out.push({ x, y: free.y, w: area / height, h: height }); x += area / height; }
      free = { x: free.x, y: free.y + height, w: free.w, h: free.h - height };
    }
    row = [];
  };
  for (let index = 0; index < areas.length;) {
    const side = Math.min(free.w, free.h), area = areas[index]!;
    if (!row.length || worst([...row, area], side) <= worst(row, side)) { row.push(area); index++; } else place();
  }
  if (row.length) place();
  return out;
}

/**
 * «En qué se gasta»: el gasto del año por cuenta contable como bloques cuyo tamaño es su parte del total. Las seis
 * mayores llevan un tono de mayor a menor; el resto se agrupa en «Otras cuentas». El reparto se recalcula con la forma
 * del espacio disponible y cada bloque muestra tanto detalle como le cabe (consultas de contenedor en home.css); la
 * descripción completa queda en el título y para lectores de pantalla.
 */
export function AccountsMap({ accounts, total, year }: { accounts: PurchaseBreakdown[]; total: string; year: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(3);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width > 0 && height > 0) setRatio(previous => Math.abs(previous - width / height) > .01 ? width / height : previous);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const positive = accounts.filter(account => BigInt(account.amount) > 0n);
  const shown = positive.slice(0, SHOWN), rest = BigInt(total) - shown.reduce((sum, account) => sum + BigInt(account.amount), 0n);
  const tiles: Tile[] = shown.map((account, index) => ({ key: account.code ?? 'none', code: account.code, count: account.count, amount: account.amount, part: share(account.amount, total),
    name: account.name ?? (account.code ? 'Sin nombre en el catálogo' : 'Sin cuenta contable'), tone: account.code ? `tone-${index}` : 'is-muted' }));
  // El resumen trae sólo las mayores cuentas: el resto del total se agrupa sin inventar cuántas son.
  if (rest > 0n) tiles.push({ key: 'others', name: 'Otras cuentas', code: null, amount: rest.toString(), part: share(rest, total), tone: 'is-muted', count: null });
  const rects = squarify(tiles.map(tile => Number(tile.amount)), { x: 0, y: 0, w: ratio, h: 1 });

  return <section className="home-map" aria-labelledby="map-title">
    <div className="home-heading"><h2 id="map-title">En qué se gasta</h2><span>Por cuenta contable · el tamaño es su parte de {year}</span></div>
    {tiles.length ? <div ref={box} className="home-map__plot">
      <ul className="home-map__tiles" aria-label="Gasto por cuenta contable">{tiles.map((tile, index) => {
        const rect = rects[index]!, description = `${tile.name}${tile.code ? ` (${tile.code})` : ''}: ${amountLabel(tile.amount)}, ${percent(tile.part)} del año${tile.count === null ? '' : `, ${purchases(tile.count)}`}`;
        return <li key={tile.key} className="home-map__cell" title={description}
          style={{ left: `${rect.x / ratio * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w / ratio * 100}%`, height: `${rect.h * 100}%` }}>
          <div className={`home-map__tile ${tile.tone}`}>
            <span className="purchase-sr-only">{description}</span>
            <span className="home-map__name" aria-hidden="true">{tile.name}</span>
            {tile.code && <small className="home-map__code" aria-hidden="true">{tile.code}</small>}
            <span className="home-map__figures" aria-hidden="true"><b className="home-map__amount">{amountLabel(tile.amount)}</b>
              <small className="home-map__part">{percent(tile.part)}{tile.count !== null && <span className="home-map__count"> · {purchases(tile.count)}</span>}</small></span>
          </div>
        </li>;
      })}</ul>
    </div> : <p className="home-muted">Sin cuentas contables registradas en {year}.</p>}
  </section>;
}
