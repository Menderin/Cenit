// Valores con los que Cenit llena el «Registro de gastos» mientras el cliente no los confirme.
// Cada supuesto está anotado en Docs/PENDIENTES-CLIENTE.md; cambiar uno es editar esta lista, no migrar la base.

/** Columna «Documento»: hasta ahora todas las filas del cliente dicen lo mismo. */
export const DEFAULT_DOCUMENT = 'SISTEMA DE COMPRAS';
export const PAYMENT_SITUATIONS = ['PENDIENTE', 'PAGADO'] as const;
export const DEFAULT_PAYMENT_SITUATION = 'PENDIENTE';
export const DOCUMENT_TYPES = ['COTIZACIÓN', 'HONORARIOS'] as const;
/** Columna UNIDAD: área a la que corresponde el gasto, distinta del código de unidad de la cuenta. */
export const AREAS = ['FAMED', 'CLINICA', 'CIENCIAS BIOMEDICAS', 'SALUD PUBLICA'] as const;
/** Prefijo de las unidades de la Facultad de Medicina en el Plan de Unidades. */
export const FAMED_UNIT_PREFIX = '27';

/** Cuentas que se ofrecen primero (las vistas en muestras del cliente y las habituales de una facultad), con su ITEM supuesto. */
export const FAMED_ACCOUNTS: ReadonlyArray<{ code: string; item: string }> = [
  { code: '410102', item: 'HONORARIOS' }, { code: '410103', item: 'HONORARIOS' }, { code: '410104', item: 'HONORARIOS' },
  { code: '420151', item: 'HONORARIOS' }, { code: '420101', item: 'MATERIALES' }, { code: '420102', item: 'MATERIALES' },
  { code: '420104', item: 'MATERIALES' }, { code: '420105', item: 'IMPRESIONES' }, { code: '420106', item: 'MATERIALES' },
  { code: '420107', item: 'MATERIALES' }, { code: '420354', item: 'MANTENCIÓN' }, { code: '420356', item: 'MANTENCIÓN' },
  { code: '420401', item: 'PASAJES' }, { code: '420402', item: 'VIÁTICOS' }, { code: '420403', item: 'VIÁTICOS' },
  { code: '420404', item: 'ENVÍOS' }, { code: '420405', item: 'ALIMENTACIÓN' }, { code: '420406', item: 'ALOJAMIENTO' },
  { code: '420501', item: 'DIFUSIÓN' }, { code: '420631', item: 'ARRIENDOS' }, { code: '420632', item: 'ARRIENDOS' },
  { code: '420801', item: 'INSCRIPCIONES' }, { code: '420803', item: 'REPRESENTACIÓN' }, { code: '420804', item: 'REPRESENTACIÓN' },
];
