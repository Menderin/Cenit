import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import type { AssetKind } from '@cenit/contracts/assets';
import { OfficialForm } from '../../../shared/components/OfficialForm.js';
import { StatusNotice } from '../../../shared/components/StatusNotice.js';

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

/** Vista previa en el formato oficial, con las mismas casillas que el PDF. Avisa qué texto no cabe en el papel. */
export function FormPreview<Cell extends string>({ caption, overflow, ...form }: { caption: string; overflow: string[] } & Parameters<typeof OfficialForm<Cell>>[0]) {
  return <>
    <p>{caption}</p>
    <OfficialForm {...form} />
    {overflow.length > 0 && <StatusNotice kind="warning" title="Hay texto que no cabe en el formulario" message={overflowMessage(overflow)} />}
  </>;
}
export const overflowMessage = (fields: string[]) => `Acorta ${fields.map(field => field.toLocaleLowerCase('es')).join(', ')}: está marcado en rojo en la vista previa y así no se puede imprimir.`;
