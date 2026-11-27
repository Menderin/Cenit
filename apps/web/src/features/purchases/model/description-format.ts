const abbreviations = new Set(['BOL', 'HRS', 'APS', 'UCN', 'CLP', 'IVA', 'RUT', 'ID']);
// A suggestion for human review, not recognition of names or correction of source data.
export function suggestDescriptionFormat(text: string, providers: string[] = []): string {
  const spans: { start: number; end: number }[] = [];
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
  return text.replace(/[\p{L}\p{N}_]+(?:[./@:-][\p{L}\p{N}_]+)*/gu, (token: string, offset: number) => {
    if (/[\d_/@:-]/u.test(token) || abbreviations.has(token.toLocaleUpperCase('es')) ||
      spans.some(span => offset < span.end && offset + token.length > span.start)) return token;
    const lower = token.toLocaleLowerCase('es');
    return offset <= firstLetter && firstLetter < offset + token.length
      ? lower.replace(/\p{L}/u, letter => letter.toLocaleUpperCase('es')) : lower;
  });
}
