import { rutFromDescription } from '@cenit/contracts/purchases';

const abbreviations = new Set(['BOL', 'HRS', 'APS', 'UCN', 'CLP', 'IVA', 'RUT', 'ID']);
const nameParticles = new Set(['de', 'del', 'la', 'las', 'los', 'y']);
const companySuffix = /\s(?:SpA|Ltda\.?|Limitada|S\.?A\.?|E\.?I\.?R\.?L\.?)$/iu;

function matchesProviderName(words: string[], provider: string): boolean {
  const providerWords = provider.trim().normalize('NFC').toLocaleLowerCase('es').split(/\s+/u);
  if (words.length > providerWords.length || words[0] !== providerWords[0]) return false;
  let index = 0;
  return words.slice(1).every(word => (index = providerWords.indexOf(word, index + 1)) !== -1);
}

function providerNamesWithRut(text: string, providers: string[]) {
  const names: { start: number; end: number; company: boolean }[] = [];
  // Oracle puede abreviar el nombre antes del sufijo con el RUT.
  for (const match of text.matchAll(/(?:^|[,;]| \/ )\s*([\p{L}\p{M}]+(?:[ \t]+[\p{L}\p{M}]+)+)_\d{7,8}[0-9Kk](?=\s*(?:[,;]| \/ |$))/gmu)) {
    const name = match[1]!;
    const words = name.normalize('NFC').toLocaleLowerCase('es').split(/\s+/u);
    const matches = providers.filter(provider => matchesProviderName(words, provider));
    if (!matches.length || !rutFromDescription(match[0])) continue;
    const start = match.index + match[0].indexOf(name);
    names.push({ start, end: start + name.length, company: matches.some(provider => companySuffix.test(provider.trim())) });
  }
  return names;
}

export function formatProviderNames(text: string, providers: string[]): string {
  return providerNamesWithRut(text, providers).reduceRight((result, { start, end, company }) => {
    if (company) return result;
    const name = text.slice(start, end).replace(/\p{L}[\p{L}\p{M}]*/gu, (word, offset: number) => {
      const lower = word.toLocaleLowerCase('es');
      if (abbreviations.has(word.toLocaleUpperCase('es'))) return word;
      return offset > 0 && nameParticles.has(lower) ? lower : lower.replace(/^\p{L}/u, letter => letter.toLocaleUpperCase('es'));
    });
    return result.slice(0, start) + name + result.slice(end);
  }, text);
}

// La propuesta conserva el texto fuente y queda sujeta a revisión.
export function suggestDescriptionFormat(text: string, providers: string[] = []): string {
  const spans: { start: number; end: number }[] = providerNamesWithRut(text, providers);
  for (const match of text.matchAll(/(?:https?:\/\/|www\.)\S+|[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+/giu)) {
    spans.push({ start: match.index, end: match.index + match[0].length });
  }
  for (const provider of providers) {
    const name = provider.trim();
    if (!name) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const match of text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}])`, 'giu'))) {
      spans.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  const firstLetter = text.search(/\p{L}/u);
  const formatted = text.replace(/[\p{L}\p{N}_]+(?:[./@:-][\p{L}\p{N}_]+)*/gu, (token: string, offset: number) => {
    if (/[\d_/@:-]/u.test(token) || abbreviations.has(token.toLocaleUpperCase('es')) ||
      spans.some(span => offset < span.end && offset + token.length > span.start)) return token;
    const lower = token.toLocaleLowerCase('es');
    return offset <= firstLetter && firstLetter < offset + token.length
      ? lower.replace(/\p{L}/u, letter => letter.toLocaleUpperCase('es')) : lower;
  });
  return formatProviderNames(formatted, providers);
}
