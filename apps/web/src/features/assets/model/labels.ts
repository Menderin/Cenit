import type { ComponentType } from 'react';
import type { AssetKind, AssetStatus, LoanStatus } from '@cenit/contracts/assets';
import { DesktopIcon } from '@phosphor-icons/react/dist/csr/Desktop';
import { ProjectorScreenIcon } from '@phosphor-icons/react/dist/csr/ProjectorScreen';
import { ArmchairIcon } from '@phosphor-icons/react/dist/csr/Armchair';
import { GearSixIcon } from '@phosphor-icons/react/dist/csr/GearSix';
import { BuildingsIcon } from '@phosphor-icons/react/dist/csr/Buildings';
import { PlugIcon } from '@phosphor-icons/react/dist/csr/Plug';
import { PackageIcon } from '@phosphor-icons/react/dist/csr/Package';

type Icon = ComponentType<{ size?: number; weight?: 'regular' | 'fill'; 'aria-hidden'?: 'true' }>;
// Tipos de bien de los formularios recibidos; «requiere» resume la Nota 2 de la Sección Registro.
export const kinds: Record<AssetKind, { label: string; short: string; icon: Icon; requires: string }> = {
  equipo_computacional: { label: 'Equipo computacional', short: 'Computacional', icon: DesktopIcon, requires: 'Marca, modelo y N° de serie. Indica si es un equipo armado.' },
  equipo: { label: 'Equipo', short: 'Equipo', icon: ProjectorScreenIcon, requires: 'Marca, modelo y N° de serie. Indica si es parte de un sistema.' },
  mueble: { label: 'Mueble', short: 'Mueble', icon: ArmchairIcon, requires: 'Tipo, material y medidas. Indica si va adosado al piso o a la pared.' },
  maquinaria: { label: 'Maquinaria', short: 'Maquinaria', icon: GearSixIcon, requires: 'Marca, modelo y N° de serie. Indica si es parte de un sistema.' },
  construccion: { label: 'Construcción', short: 'Construcción', icon: BuildingsIcon, requires: 'Medidas en metros cuadrados y materiales.' },
  accesorio: { label: 'Accesorio', short: 'Accesorio', icon: PlugIcon, requires: 'Marca y N° de serie cuando existan.' },
  otro: { label: 'Otro', short: 'Otro', icon: PackageIcon, requires: 'Describe el bien con el mayor detalle posible.' },
};
export const kindOrder = Object.keys(kinds) as AssetKind[];
export const statuses: Record<AssetStatus, { label: string; tone: string; help: string }> = {
  asignado: { label: 'Asignado', tone: 'ok', help: 'Tiene responsable vigente.' },
  prestamo: { label: 'En préstamo', tone: 'loan', help: 'Hay un préstamo sin devolución.' },
  vencido: { label: 'Préstamo vencido', tone: 'late', help: 'Pasó la devolución esperada.' },
  revisar: { label: 'Por revisar', tone: 'review', help: 'Su responsable ya no pertenece a la institución.' },
  sin_responsable: { label: 'Sin responsable', tone: 'none', help: 'Registrado, aún sin entregar.' },
};
export const loanStatuses: Record<LoanStatus, { label: string; tone: string }> = {
  activo: { label: 'Activo', tone: 'loan' }, vencido: { label: 'Vencido', tone: 'late' }, devuelto: { label: 'Devuelto', tone: 'none' },
};
export const usesSerial = (kind: AssetKind) => !['mueble', 'construccion'].includes(kind);

const santiagoDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
export const today = santiagoDay;
const dayNumber = (value: string) => Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10))) / 86_400_000;
export const daysFromToday = (value: string) => dayNumber(value) - dayNumber(santiagoDay());
export function relativeDue(value: string | null, returned = false) {
  if (!value) return 'Sin fecha';
  if (returned) return '';
  const days = daysFromToday(value);
  if (days < 0) return days === -1 ? 'Vencido ayer' : `Vencido hace ${-days} días`;
  if (days === 0) return 'Vence hoy';
  return days === 1 ? 'Vence mañana' : `En ${days} días`;
}
export const brandLine = (item: { kind: AssetKind; brand: string | null; model: string | null; material?: string | null; dimensions?: string | null }) =>
  [kinds[item.kind].label, ...(item.kind === 'mueble' ? [item.material, item.dimensions] : [item.brand, item.model])].filter(Boolean).join(' · ');
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('es');
