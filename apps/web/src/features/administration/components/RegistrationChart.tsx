import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { dateLabel } from '../../purchases/model/fields.js';

const margin = { top: 8, right: 4, bottom: 24, left: 28 };

// Daily bars in plain SVG: focus and arrow keys move the tooltip; the hidden list carries the same data for screen readers.
export function RegistrationChart({ days }: { days: { date: string; count: number }[] }) {
  const frame = useRef<HTMLDivElement>(null), focused = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry!.contentRect.width, height: entry!.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const upper = Math.max(5, Math.ceil(Math.max(0, ...days.map(day => day.count)) / 5) * 5);
  const step = upper / 5 + 1 <= 9 ? 5 : Math.ceil(upper / 8);
  const ticks = Array.from({ length: Math.floor(upper / step) + 1 }, (_, index) => index * step);
  const plot = { width: Math.max(0, size.width - margin.left - margin.right), height: Math.max(0, size.height - margin.top - margin.bottom) };
  const band = days.length ? plot.width / days.length : 0, bar = Math.min(24, band * .8);
  const x = (index: number) => margin.left + band * (index + .5), y = (value: number) => margin.top + plot.height * (1 - value / upper);
  const labelEvery = Math.max(1, Math.ceil(58 / (band || 1)));
  const move = (index: number) => setActive(Math.min(days.length - 1, Math.max(0, index)));
  function pointer(event: PointerEvent<SVGSVGElement>) {
    if (!band) return;
    move(Math.floor((event.clientX - event.currentTarget.getBoundingClientRect().left - margin.left) / band));
  }
  function keyboard(event: KeyboardEvent<SVGSVGElement>) {
    const next = { ArrowRight: (active ?? -1) + 1, ArrowLeft: (active ?? 1) - 1, Home: 0, End: days.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault(); move(next);
  }
  const day = active === null ? undefined : days[active];
  return <>
    <div className="dashboard-chart">
      <div ref={frame} className="dashboard-chart-canvas">
        {size.width > 0 && <svg width={size.width} height={size.height} tabIndex={0} role="img" aria-label="Compras incorporadas por día"
          onPointerMove={pointer} onPointerLeave={() => { if (!focused.current) setActive(null); }}
          onFocus={() => { focused.current = true; setActive(current => current ?? 0); }} onBlur={() => { focused.current = false; setActive(null); }} onKeyDown={keyboard}>
          {ticks.map(tick => <g key={tick}>
            <line className="dashboard-chart-grid" x1={margin.left} x2={size.width - margin.right} y1={y(tick)} y2={y(tick)} />
            <text className="dashboard-chart-tick" x={margin.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">{tick}</text>
          </g>)}
          {active !== null && <rect className="dashboard-chart-cursor" x={margin.left + band * active} y={margin.top} width={band} height={plot.height} />}
          {days.map((entry, index) => <g key={entry.date}>
            {entry.count > 0 && <path className="dashboard-chart-bar" d={barPath(x(index) - bar / 2, y(entry.count), bar, y(0) - y(entry.count))} />}
            {index % labelEvery === 0 && <text className="dashboard-chart-tick" x={x(index)} y={size.height - 6} textAnchor="middle">{dateLabel(entry.date).slice(0, 5)}</text>}
          </g>)}
        </svg>}
        {day && <div className="dashboard-chart-tooltip" role="status" aria-live="polite" style={{ left: Math.min(Math.max(x(active!), 90), size.width - 90) }}>
          <span>{dateLabel(day.date)}</span>
          <strong>{day.count} {day.count === 1 ? 'compra incorporada' : 'compras incorporadas'}</strong>
        </div>}
      </div>
    </div>
    <ul className="purchase-sr-only" aria-label="Detalle de compras incorporadas por día">
      {days.map(entry => <li key={entry.date}>{dateLabel(entry.date)}: {entry.count} {entry.count === 1 ? 'compra' : 'compras'}</li>)}
    </ul>
  </>;
}

function barPath(left: number, top: number, width: number, height: number) {
  const radius = Math.min(3, width / 2, height);
  return `M${left},${top + height}V${top + radius}Q${left},${top} ${left + radius},${top}H${left + width - radius}Q${left + width},${top} ${left + width},${top + radius}V${top + height}Z`;
}
