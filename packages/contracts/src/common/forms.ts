// Formularios oficiales: copia exacta de un documento que entrega la Universidad (la plantilla) y las casillas
// donde Cenit escribe, como se haría en Word o Excel. Una sola definición ubica los valores en la vista previa
// (web) y en el PDF (API); cada módulo aporta su plantilla, sus casillas y cómo llenarlas.

/** Casilla en unidades de la hoja de la plantilla: [x, y, ancho, alto] desde la esquina superior izquierda. */
export type FormBox = readonly [x: number, y: number, width: number, height: number];
/** Letra de los valores: sans ≈ Arial/Helvetica y serif ≈ Times; ambas existen en el PDF sin incrustar fuentes. */
export type FormFont = 'sans' | 'sans-bold' | 'serif' | 'serif-bold';
export type FormCellStyle = {
  align?: 'left' | 'center'; valign?: 'top' | 'middle'; font?: FormFont;
  /** Tamaño máximo de la letra, en unidades de la hoja; el texto se achica hasta caber. */
  size?: number; upper?: boolean;
};
export type FormCell = FormCellStyle & { box: FormBox };
export type FormLayout<Cell extends string = string> = {
  sheet: { width: number; height: number };
  /** `fit`: la hoja (p. ej. un XLSX) se centra en una carta con márgenes; `page`: la plantilla ya es la página carta completa. */
  placement: 'fit' | 'page';
  style: Required<FormCellStyle>;
  cells: Record<Cell, FormCell>;
};
/** Valor de una casilla: casilla, campo que lo origina (para indicar el error) y texto. */
export type FormEntry<Cell extends string = string> = readonly [cell: Cell, field: string, value: string];

export const letterPage = { width: 612, height: 792 } as const;
/** Menor tamaño de letra admitido, en puntos; por debajo el texto no cabe. */
export const formMinSize = 4.5;
export const formLineHeight = 1.1;

/** Posición de la hoja en la página carta, en puntos desde arriba a la izquierda. Igual en la vista previa y en el PDF. */
export function formFrame(layout: Pick<FormLayout, 'sheet' | 'placement'>) {
  if (layout.placement === 'page') return { x: 0, y: 0, scale: letterPage.width / layout.sheet.width, mark: 24 };
  const top = 36, scale = Math.min(540 / layout.sheet.width, (letterPage.height - 2 * top - 14) / layout.sheet.height);
  return { x: (letterPage.width - layout.sheet.width * scale) / 2, y: top, scale, mark: 36 };
}

export function cellStyle<Cell extends string>(layout: FormLayout<Cell>, cell: Cell): Required<FormCell> {
  return { ...layout.style, ...layout.cells[cell] };
}

/** Casillas a partir de sus cajas, con los estilos que difieren del estilo por omisión. */
export function formCells<Boxes extends Record<string, FormBox>>(boxes: Boxes, styles: Partial<Record<keyof Boxes & string, FormCellStyle>> = {}) {
  type Cell = keyof Boxes & string;
  return Object.fromEntries(Object.entries(boxes).map(([cell, box]) => [cell, { box, ...styles[cell as Cell] }])) as Record<Cell, FormCell>;
}
/** Mismo estilo para varias casillas. */
export const styleCells = <Cell extends string>(cells: readonly Cell[], style: FormCellStyle) =>
  Object.fromEntries(cells.map(cell => [cell, style])) as Partial<Record<Cell, FormCellStyle>>;

/** Día, mes y año de una fecha AAAA-MM-DD válida; vacíos mientras la fecha esté incompleta. */
export function formDateParts(value: string, shortYear = false): [string, string, string] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return ['', '', ''];
  const [, year, month, day] = match as unknown as [string, string, string, string];
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return ['', '', ''];
  return [String(Number(day)), String(Number(month)), shortYear ? year.slice(-2) : year];
}
