import type { PoolClient } from 'pg';
import type { PurchaseBreakdown, PurchaseProjectOption, PurchaseProjectSummary } from '@cenit/contracts/purchases';

type Db = Pick<PoolClient, 'query'>;
type Row = { code: string | null; catalog_name: string | null; cost_center: string | null; count: number; amount: string };

// Año pedido o el actual de America/Santiago; los límites son fechas civiles inclusivas/exclusivas.
export const selectedYear = (parameter: string) => `(SELECT coalesce(${parameter}::int, extract(year FROM now() AT TIME ZONE 'America/Santiago')::int) AS year) y`;

// Oracle muestra «unidad-nombre / proyecto-nombre / cuenta-nombre». Si el código no está en el catálogo oficial,
// se usa el nombre que acompañaba a ese mismo código en la compra; nunca se deduce uno distinto.
export function costCenterName(text: string | null, position: 0 | 1 | 2, code: string | null): string | null {
  if (!text || !code) return null;
  const parts = text.split('/').map(part => part.trim().match(/^([0-9]+)\s*-\s*(.+)$/));
  const match = parts.length === 3 ? parts[position] : parts.find(part => part?.[1] === code);
  const name = match && match[1] === code ? match[2]!.trim() : '';
  return name ? name.slice(0, 1000) : null;
}
const breakdown = (rows: Row[], position: 0 | 1 | 2): PurchaseBreakdown[] => rows.map(row => ({
  code: row.code, name: row.catalog_name ?? costCenterName(row.cost_center, position, row.code), count: row.count, amount: row.amount,
}));

const projectName = (column: string) => `(SELECT min(c.name) FROM cenit.purchase_catalog_projects c WHERE c.code=${column})`;
const accountName = (column: string) => `(SELECT c.name FROM cenit.purchase_catalog_accounts c WHERE c.code=${column})`;
const unitName = (column: string) => `(SELECT c.name FROM cenit.purchase_catalog_units c WHERE c.code=${column})`;

/** Gasto del año por proyecto y por cuenta: suma el importe de cada ítem una sola vez. */
export async function yearBreakdowns(db: Db, year: number | null) {
  const scope = `FROM cenit.purchase_request_lines l JOIN cenit.purchase_requests p ON p.id=l.request_id, ${selectedYear('$1')}
    WHERE p.sent_date >= make_date(y.year, 1, 1) AND p.sent_date < make_date(y.year + 1, 1, 1)`;
  const group = (code: string, name: (column: string) => string, limit: number) => db.query<Row>(`SELECT ${code} AS code, ${name(code)} AS catalog_name, min(l.cost_center) AS cost_center,
      count(DISTINCT p.id)::int AS count, coalesce(sum(l.amount), 0)::text AS amount ${scope}
      GROUP BY ${code} ORDER BY coalesce(sum(l.amount), 0) DESC, count(DISTINCT p.id) DESC, ${code} NULLS LAST LIMIT ${limit}`, [year]);
  const projects = await group('l.project_code', projectName, 40);
  const accounts = await group('l.accounting_code', accountName, 8);
  // Each project's spending month by month, so Inicio can show when it spends without leaving the page.
  const monthly = await db.query<{ code: string | null; month: number; amount: string }>(`SELECT l.project_code AS code, extract(month FROM p.sent_date)::int AS month,
      coalesce(sum(l.amount), 0)::text AS amount ${scope} GROUP BY 1, 2`, [year]);
  const months = new Map<string | null, string[]>();
  for (const row of monthly.rows) {
    const list = months.get(row.code) ?? Array.from({ length: 12 }, () => '0');
    list[row.month - 1] = row.amount; months.set(row.code, list);
  }
  const { rows: [totals] } = await db.query<{ amount: string; projects: number }>(`SELECT coalesce(sum(l.amount), 0)::text AS amount,
      count(DISTINCT l.project_code)::int AS projects ${scope}`, [year]);
  return { lineTotal: totals!.amount, projectCount: totals!.projects, accounts: breakdown(accounts.rows, 2),
    projects: breakdown(projects.rows, 1).map(project => ({ ...project, months: months.get(project.code) ?? Array.from({ length: 12 }, () => '0') })) };
}

/** Proyectos que se pueden elegir: los del catálogo oficial y los que aparecen en alguna compra, con su gasto del año. */
export async function projectOptions(db: Db, year: number | null): Promise<{ year: string; projects: PurchaseProjectOption[] }> {
  const { rows } = await db.query<{ year: number; code: string; catalog_name: string | null; cost_center: string | null; in_catalog: boolean; units: string[]; count: number; amount: string }>(`
    WITH used AS (
      SELECT l.project_code AS code, min(l.cost_center) AS cost_center, array_agg(DISTINCT l.unit_code) FILTER (WHERE l.unit_code IS NOT NULL) AS units,
        (count(DISTINCT p.id) FILTER (WHERE p.sent_date >= make_date(y.year, 1, 1) AND p.sent_date < make_date(y.year + 1, 1, 1)))::int AS count,
        coalesce(sum(l.amount) FILTER (WHERE p.sent_date >= make_date(y.year, 1, 1) AND p.sent_date < make_date(y.year + 1, 1, 1)), 0) AS amount
      FROM cenit.purchase_request_lines l JOIN cenit.purchase_requests p ON p.id=l.request_id, ${selectedYear('$1')}
      WHERE l.project_code IS NOT NULL GROUP BY l.project_code
    ), catalog AS (SELECT code, min(name) AS name, array_agg(unit_code ORDER BY unit_code) AS units FROM cenit.purchase_catalog_projects GROUP BY code)
    SELECT ${selectedYear('$1').replace(/ y$/, '')} AS year, coalesce(u.code, c.code) AS code, c.name AS catalog_name, u.cost_center, c.code IS NOT NULL AS in_catalog,
      ARRAY(SELECT DISTINCT unit FROM unnest(coalesce(c.units, '{}') || coalesce(u.units, '{}')) AS unit ORDER BY unit) AS units,
      coalesce(u.count, 0) AS count, coalesce(u.amount, 0)::text AS amount
    FROM used u FULL JOIN catalog c ON c.code=u.code
    ORDER BY coalesce(u.amount, 0) DESC, coalesce(u.count, 0) DESC, 2`, [year]);
  const resolved = rows[0]?.year ?? (await db.query<{ year: number }>(`SELECT year FROM ${selectedYear('$1')}`, [year])).rows[0]!.year;
  return { year: String(resolved).padStart(4, '0'), projects: rows.map(row => ({
    code: row.code, name: row.catalog_name ?? costCenterName(row.cost_center, 1, row.code), units: row.units, inCatalog: row.in_catalog, count: row.count, amount: row.amount,
  })) };
}

/** Resumen de un proyecto en un año. `null` cuando el código no está en el catálogo ni en ninguna compra. */
export async function projectSummary(db: Db, code: string, year: number | null): Promise<PurchaseProjectSummary | null> {
  const { rows: [identity] } = await db.query<{ year: number; catalog_name: string | null; in_catalog: boolean; cost_center: string | null; used: boolean; years: number[] }>(`
    SELECT y.year, ${projectName('$1')} AS catalog_name, EXISTS (SELECT 1 FROM cenit.purchase_catalog_projects c WHERE c.code=$1) AS in_catalog,
      (SELECT min(l.cost_center) FROM cenit.purchase_request_lines l WHERE l.project_code=$1) AS cost_center,
      EXISTS (SELECT 1 FROM cenit.purchase_request_lines l WHERE l.project_code=$1) AS used,
      ARRAY(SELECT DISTINCT extract(year FROM p.sent_date)::int FROM cenit.purchase_request_lines l JOIN cenit.purchase_requests p ON p.id=l.request_id
        WHERE l.project_code=$1 ORDER BY 1 DESC) AS years
    FROM ${selectedYear('$2')}`, [code, year]);
  if (!identity || (!identity.in_catalog && !identity.used)) return null;
  const lines = `cenit.purchase_request_lines l JOIN cenit.purchase_requests p ON p.id=l.request_id, ${selectedYear('$2')}
    WHERE l.project_code=$1 AND p.sent_date >= make_date(y.year, 1, 1) AND p.sent_date < make_date(y.year + 1, 1, 1)`;
  const { rows: [totals] } = await db.query<{ count: number; amount: string; line_count: number; without_amount: number; providers: number; last: string | null; year_total: string }>(`
    SELECT count(DISTINCT p.id)::int AS count, coalesce(sum(l.amount), 0)::text AS amount, count(*)::int AS line_count,
      (count(*) FILTER (WHERE l.amount IS NULL))::int AS without_amount, count(DISTINCT l.provider_search)::int AS providers, max(p.sent_date)::text AS last,
      (SELECT coalesce(sum(a.amount), 0) FROM cenit.purchase_request_lines a JOIN cenit.purchase_requests b ON b.id=a.request_id
        WHERE b.sent_date >= make_date(y.year, 1, 1) AND b.sent_date < make_date(y.year + 1, 1, 1))::text AS year_total
    FROM ${lines} GROUP BY y.year`, [code, year]);
  const group = (column: string, name: (column: string) => string, limit = 500) => db.query<Row>(`SELECT ${column} AS code, ${name(column)} AS catalog_name, min(l.cost_center) AS cost_center,
      count(DISTINCT p.id)::int AS count, coalesce(sum(l.amount), 0)::text AS amount FROM ${lines}
      GROUP BY ${column} ORDER BY coalesce(sum(l.amount), 0) DESC, count(DISTINCT p.id) DESC, ${column} NULLS LAST LIMIT ${limit}`, [code, year]);
  const units = await group('l.unit_code', unitName), accounts = await group('l.accounting_code', accountName);
  // Las unidades del catálogo se muestran aunque el proyecto aún no tenga compras ese año.
  const catalogUnits = await db.query<{ code: string; name: string }>(`SELECT c.unit_code AS code, u.name FROM cenit.purchase_catalog_projects c
    JOIN cenit.purchase_catalog_units u ON u.code=c.unit_code WHERE c.code=$1 ORDER BY 1`, [code]);
  const unitRows = breakdown(units.rows, 0);
  for (const unit of catalogUnits.rows) if (!unitRows.some(row => row.code === unit.code)) unitRows.push({ code: unit.code, name: unit.name, count: 0, amount: '0' });
  const providers = await db.query<{ name: string | null; count: number; amount: string }>(`SELECT min(l.provider) AS name, count(DISTINCT p.id)::int AS count,
      coalesce(sum(l.amount), 0)::text AS amount FROM ${lines} GROUP BY l.provider_search ORDER BY coalesce(sum(l.amount), 0) DESC, 2 DESC, 1 NULLS LAST LIMIT 8`, [code, year]);
  const months = await db.query<{ month: string; count: number; amount: string }>(`WITH months AS (
      SELECT generate_series(make_date(y.year, 1, 1), make_date(y.year, 12, 1), '1 month')::date AS start FROM ${selectedYear('$2')}
    ) SELECT to_char(m.start, 'YYYY-MM') AS month, count(DISTINCT p.id)::int AS count, coalesce(sum(l.amount), 0)::text AS amount
      FROM months m LEFT JOIN cenit.purchase_requests p ON p.sent_date >= m.start AND p.sent_date < (m.start + interval '1 month')::date
        AND EXISTS (SELECT 1 FROM cenit.purchase_request_lines x WHERE x.request_id=p.id AND x.project_code=$1)
      LEFT JOIN cenit.purchase_request_lines l ON l.request_id=p.id AND l.project_code=$1
      GROUP BY m.start ORDER BY m.start`, [code, year]);
  const purchases = await db.query<{ id: string; requestNumber: string; sentDate: string; description: string; provider: string | null; accountingCode: string | null;
    accountName: string | null; cost_center: string | null; documentType: string | null; amount: string | null }>(`SELECT p.id, p.request_number AS "requestNumber", p.sent_date::text AS "sentDate",
      p.description, min(l.provider) AS provider, min(l.accounting_code) AS "accountingCode", ${accountName('min(l.accounting_code)')} AS "accountName",
      min(l.cost_center) AS cost_center, p.document_type AS "documentType", sum(l.amount)::text AS amount
    FROM ${lines} GROUP BY p.id ORDER BY p.sent_date DESC, p.id DESC LIMIT 10`, [code, year]);
  return {
    code, name: identity.catalog_name ?? costCenterName(identity.cost_center, 1, code), inCatalog: identity.in_catalog,
    year: String(identity.year).padStart(4, '0'), availableYears: [...new Set([identity.year, ...identity.years])].sort((a, b) => b - a),
    count: totals?.count ?? 0, amount: totals?.amount ?? '0', lineCount: totals?.line_count ?? 0, linesWithoutAmount: totals?.without_amount ?? 0,
    yearLineTotal: totals?.year_total ?? (await db.query<{ total: string }>(`SELECT coalesce(sum(l.amount), 0)::text AS total FROM cenit.purchase_request_lines l
      JOIN cenit.purchase_requests p ON p.id=l.request_id, ${selectedYear('$1')} WHERE p.sent_date >= make_date(y.year, 1, 1) AND p.sent_date < make_date(y.year + 1, 1, 1)`, [year])).rows[0]!.total,
    providerCount: totals?.providers ?? 0,
    units: unitRows, accounts: breakdown(accounts.rows, 2), providers: providers.rows, monthlyTotals: months.rows,
    purchases: purchases.rows.map(({ cost_center, ...row }) => ({ ...row, accountName: row.accountName ?? costCenterName(cost_center, 2, row.accountingCode) })),
    lastSentDate: totals?.last ?? null,
  };
}
