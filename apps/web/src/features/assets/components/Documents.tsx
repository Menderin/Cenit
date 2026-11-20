import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import type { AssetKind } from '@cenit/contracts/assets';
import { displayDate } from '../../../shared/lib/dates.js';

export type DocItem = { key: string; assetId?: string; code?: string; quantity: number; description: string; brand: string | null; serialNumber: string | null; kind: AssetKind; detail?: string };

/** Tabla de bienes de una entrega o préstamo. En el formulario permite quitarlos. */
export function ItemsTable({ items, onRemove, empty }: { items: DocItem[]; onRemove?: (key: string) => void; empty?: ReactNode }) {
  if (!items.length) return empty ? <>{empty}</> : null;
  return <div className="assets-table-wrap assets-items"><table className="assets-table">
    <thead><tr><th scope="col">Cant.</th><th scope="col">Bien</th><th scope="col">Marca</th><th scope="col">N° de serie</th>{onRemove && <th scope="col"><span className="assets-sr">Quitar</span></th>}</tr></thead>
    <tbody>{items.map(item => <tr key={item.key}>
      <td className="assets-num">{item.quantity}</td>
      <td>{item.description}<span className="assets-sub">{item.assetId ? <><Link to={`/administracion/bienes/${item.assetId}`}>{item.code}</Link>{item.detail && ` · ${item.detail}`}</> : item.detail ?? 'Bien nuevo: se registra al guardar'}</span></td>
      <td>{item.brand ?? <span className="assets-muted">Sin dato</span>}</td>
      <td className="assets-num">{item.serialNumber ?? <span className="assets-muted">Sin dato</span>}</td>
      {onRemove && <td className="assets-actions-cell"><button type="button" className="cenit-button cenit-button--quiet" onClick={() => onRemove(item.key)} aria-label={`Quitar ${item.description}`}><XIcon size={14} aria-hidden="true" />Quitar</button></td>}
    </tr>)}</tbody>
  </table></div>;
}

const blank = (value: string | null | undefined, fallback = '') => value?.trim() ? value : <span className="assets-blank">{fallback || '—'}</span>;
const upper = (value: string | null | undefined) => value?.trim() ? value.toLocaleUpperCase('es') : null;

/** Vista previa aproximada del documento que se descarga; el PDF final lo genera el servidor. */
export function SheetPreview({ type, number, date, person, items, rows, signs }: {
  type: 'delivery' | 'loan'; number?: string; date: string; person: { name: string; rut: string | null; unit: string | null; position: string | null } | null;
  items: DocItem[]; rows: [string, string | null][]; signs: [string, string];
}) {
  return <div className="assets-sheet" aria-hidden="true">
    <div className="assets-sheet__top"><span><b>Facultad de Medicina</b>Universidad Católica del Norte</span><span>Fecha {/^\d{4}-\d{2}-\d{2}$/.test(date) ? displayDate(date) : '__/__/____'}</span></div>
    {type === 'delivery' ? <><h3>ENTREGA DE EQUIPOS E INSUMOS N° {number ?? '___'}</h3><p className="assets-sheet__sub">(BIENES INVENTARIABLES Y GASTOS CONTROLADOS)</p></>
      : <><h3>INFORMACIÓN REQUERIDA N° {number ?? '___/____'}</h3><p className="assets-sheet__sub" style={{ fontWeight: 700, fontSize: 11 }}>PRÉSTAMO TRANSITORIO DE BIENES</p></>}
    <table><tbody>
      <tr><th>Nombre</th><td>{blank(type === 'delivery' ? upper(person?.name) : person?.name)}</td></tr>
      <tr><th>RUT</th><td>{blank(person?.rut)}</td></tr>
      {type === 'delivery' && <><tr><th>Unidad</th><td>{blank(upper(person?.unit))}</td></tr><tr><th>Cargo</th><td>{blank(upper(person?.position))}</td></tr></>}
    </tbody></table>
    <table>
      <thead><tr><th>Cant.</th><th>Descripción</th><th>Marca</th><th>Serie</th></tr></thead>
      <tbody>{items.length ? items.map(item => <tr key={item.key}><td>{item.quantity}</td><td>{upper(item.description)}</td><td>{upper(item.brand)}</td><td>{item.serialNumber}</td></tr>)
        : <tr><td colSpan={4} className="assets-blank">Agrega al menos un bien</td></tr>}</tbody>
    </table>
    <table><tbody>{rows.map(([label, value]) => <tr key={label}><th>{label}</th><td>{blank(value)}</td></tr>)}</tbody></table>
    <div className="assets-signs"><span>{signs[0]}</span><span>{signs[1]}</span></div>
  </div>;
}
