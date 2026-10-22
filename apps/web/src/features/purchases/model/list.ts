import type { PurchaseFilters } from '@cenit/contracts/purchases';

export function periodRange(year: string, month = '') {
  if (!year) return { dateFrom: '', dateTo: '' };
  if (!month) return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
  const date = new Date(0);
  date.setFullYear(Number(year), Number(month), 0);
  return { dateFrom: `${year}-${month}-01`, dateTo: `${year}-${month}-${date.getDate()}` };
}

export function selectedPeriod({ dateFrom, dateTo }: PurchaseFilters) {
  if (!dateFrom && !dateTo) return { year: '', month: '' };
  if (dateFrom && dateTo && /^\d{4}-\d{2}-01$/.test(dateFrom)) {
    const year = dateFrom.slice(0, 4), month = dateFrom.slice(5, 7);
    if (dateFrom === `${year}-01-01` && dateTo === `${year}-12-31`) return { year, month: '' };
    if (dateTo === periodRange(year, month).dateTo) return { year, month };
  }
  return { year: 'custom', month: '' };
}

export function paginationPages(page: number, totalPages: number): (number | 'ellipsis')[] {
  const pages = [...new Set([1, totalPages, page - 1, page, page + 1])].filter(value => value >= 1 && value <= totalPages).sort((a, b) => a - b);
  const result: (number | 'ellipsis')[] = [];
  for (const [index, value] of pages.entries()) {
    const previous = pages[index - 1];
    if (previous !== undefined && value - previous > 1) result.push(value - previous === 2 ? previous + 1 : 'ellipsis');
    result.push(value);
  }
  return result;
}
