// Formatos que se aplican mientras se escribe, sin cambiar lo que valida el servidor.

/** RUT con puntos y guion: «154829032» → «15.482.903-2». El último carácter es el dígito verificador. */
export function formatRut(input: string) {
  const clean = input.replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length <= 1) return clean;
  const body = clean.slice(0, -1).replace(/K/g, '').slice(0, 8), dv = clean.slice(-1);
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
}

/** Importe con puntos de miles y coma decimal (hasta dos decimales): «186000» → «186.000». */
export function formatAmount(input: string) {
  const [integer = '', ...rest] = input.replace(/[^\d,]/g, '').split(',');
  const digits = integer.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return rest.length ? `${digits},${rest.join('').slice(0, 2)}` : digits;
}
