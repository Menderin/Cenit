import { useState } from 'react';
import { amountLabel, sentenceCase } from '../../purchases/model/fields.js';

const colors = ['var(--color-focus)', 'var(--color-chart-bar)', ...[60, 40, 25, 15].map(share => `color-mix(in srgb, var(--color-chart-bar) ${share}%, var(--color-surface))`)];
const name = (documentType: string | null) => documentType ? sentenceCase(documentType) : 'Sin tipo';

export function DocumentTypeChart({ types }: { types: { documentType: string | null; count: number; amount: string }[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const total = types.reduce((sum, type) => sum + type.count, 0);
  const active = hovered ?? focused ?? selected;
  const selectedType = active === null ? undefined : types[active];
  let offset = 0;
  return <div className="dashboard-types-body">
    <div className="dashboard-donut">
      <svg viewBox="0 0 100 100" aria-hidden="true">{types.map((type, index) => {
        const share = type.count / total * 100, start = offset; offset += share;
        return <circle key={type.documentType ?? 'none'} cx="50" cy="50" r="40" pathLength="100" fill="none" stroke={colors[index]} strokeWidth={active === index ? 19 : 16} strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-start}
          onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(index); }} onPointerLeave={() => setHovered(null)} onClick={() => setSelected(index)} />;
      })}</svg>
      <div aria-hidden="true"><strong>{selectedType ? `${Math.round(selectedType.count / total * 100)}%` : total}</strong><span>{selectedType ? 'del total' : 'compras'}</span></div>
    </div>
    <ul className="dashboard-legend">{types.map((type, index) => <li key={type.documentType ?? 'none'}><button type="button" aria-label={`${name(type.documentType)}: ${type.count} ${type.count === 1 ? 'compra' : 'compras'}, ${Math.round(type.count / total * 100)}%, ${amountLabel(type.amount)} CLP`} aria-pressed={selected === index} onFocus={() => setFocused(index)} onBlur={() => setFocused(null)} onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(index); }} onPointerLeave={() => setHovered(null)} onClick={() => setSelected(previous => previous === index ? null : index)}>
      <i style={{ background: colors[index] }} aria-hidden="true" /><span>{name(type.documentType)}</span><small>{type.count}</small><b>{amountLabel(type.amount)}</b>
    </button></li>)}</ul>
    {selectedType && <p className="dashboard-types-detail"><strong>{name(selectedType.documentType)}</strong><span>{selectedType.count} {selectedType.count === 1 ? 'compra' : 'compras'} · {Math.round(selectedType.count / total * 100)}% · {amountLabel(selectedType.amount)} CLP</span></p>}
  </div>;
}
