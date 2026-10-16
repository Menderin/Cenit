// Public Chilean RUT notation; checksum validation does not verify a person's identity.
export const compactRut = (value: string) => value.replace(/[.\s-]/g, '').toUpperCase();

export function isValidRut(value: string): boolean {
  const rut = compactRut(value);
  if (!/^[1-9]\d{6,7}[0-9K]$/.test(rut)) return false;
  let sum = 0;
  for (const [index, digit] of [...rut.slice(0, -1)].reverse().entries()) sum += Number(digit) * (2 + index % 6);
  const verifier = 11 - sum % 11;
  return rut.at(-1) === (verifier === 11 ? '0' : verifier === 10 ? 'K' : String(verifier));
}

export function isValidRutSearch(value: string): boolean {
  const input = value.replace(/[.\s]/g, '').toUpperCase();
  if (!/^(?:[1-9]\d{0,8}|[1-9]\d{6,7}K|[1-9]\d{6,7}-[0-9K])$/.test(input)) return false;
  const complete = input.includes('-') || input.endsWith('K') || input.length === 9;
  return !complete || isValidRut(input);
}

export function formatRutInput(value: string): string {
  const rut = compactRut(value);
  // Preserve invalid characters so an erroneous paste is visible and rejected.
  if (!/^[0-9]{0,9}K?$/.test(rut) || rut.length > 9) return value.toUpperCase();
  const complete = /-\s*[0-9Kk]\s*$/.test(value) || rut.endsWith('K') || rut.length === 9;
  const body = complete ? rut.slice(0, -1) : rut;
  return body.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (complete ? `-${rut.at(-1)}` : '');
}
