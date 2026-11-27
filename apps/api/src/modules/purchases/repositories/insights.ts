import type { PoolClient } from 'pg';
import type { PurchaseBreakdown, PurchaseProjectOption, PurchaseProjectSummary } from '@cenit/contracts/purchases';

type Db = Pick<PoolClient, 'query'>;
type Row = { code: string | null; catalog_name: string | null; cost_center: string | null; count: number; amount: string };

// Año pedido o el actual de America/Santiago; los límites son fechas civiles inclusivas/exclusivas.
export const selectedYear = (parameter: string) => `(SELECT coalesce(${parameter}::int, extract(year FROM now() AT TIME ZONE 'America/Santiago')::int) AS year) y`;
// Cada compra con el centro de costos de su primera línea de Oracle, que sólo sirve para nombrar códigos ausentes del catálogo.
const purchases = `(SELECT r.*, (SELECT l.cost_center FROM cenit.purchase_request_lines l WHERE l.request_id=r.id ORDER BY l.position LIMIT 1) AS cost_center
  FROM cenit.purchase_requests r)`;
const inYear = (alias = 'p') => `${alias}.record_date >= make_date(y.year, 1, 1) AND ${alias}.record_date < make_date(y.year + 1, 1, 1)`;

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

/** Gasto del año por proyecto y por cuenta: el monto de cada compra se cuenta una sola vez, con sus propios códigos. */
export async function yearBreakdowns(db: Db, year: number | null) {
  const scope = `FROM ${purchases} p, ${selectedYear('$1')} WHERE ${inYear()}`;
  const group = (code: string, name: (column: string) => string, limit: number) => db.query<Row>(`SELECT ${code} AS code, ${name(code)} AS catalog_name, min(p.cost_center) AS cost_center,
      count(*)::int AS count, coalesce(sum(p.total_amount), 0)::text AS amount ${scope}
      GROUP BY ${code} ORDER BY coalesce(sum(p.total_amount), 0) DESC, count(*) DESC, ${code} NULLS LAST LIMIT ${limit}`, [year]);
  const projects = await group('p.project_code', projectName, 40);
  const accounts = await group('p.accounting_code', accountName, 8);
  // Gasto mensual de cada proyecto, para que Inicio muestre cuándo gasta sin salir de la página.
  const monthly = await db.query<{ code: string | null; month: number; amount: string }>(`SELECT p.project_code AS code, extract(month FROM p.record_date)::int AS month,
      coalesce(sum(p.total_amount), 0)::text AS amount ${scope} GROUP BY 1, 2`, [year]);
  const months = new Map<string | null, string[]>();
  for (const row of monthly.rows) {
    const list = months.get(row.code) ?? Array.from({ length: 12 }, () => '0');
    list[row.month - 1] = row.amount; months.set(row.code, list);
  }
  const { rows: [totals] } = await db.query<{ amount: string; projects: number }>(`SELECT coalesce(sum(p.total_amount), 0)::text AS amount,
      count(DISTINCT p.project_code)::int AS projects ${scope}`, [year]);
  return { lineTotal: totals!.amount, projectCount: totals!.projects, accounts: breakdown(accounts.rows, 2),
    projects: breakdown(projects.rows, 1).map(project => ({ ...project, months: months.get(project.code) ?? Array.from({ length: 12 }, () => '0') })) };
}

/** Proyectos que se pueden elegir: los del catálogo oficial y los que aparecen en alguna compra, con su gasto del año. */
export async function projectOptions(db: Db, year: number | null): Promise<{ year: string; projects: PurchaseProjectOption[] }> {
  const { rows } = await db.query<{ year: number; code: string; catalog_name: string | null; cost_center: string | null; in_catalog: boolean; units: string[]; count: number; amount: string }>(`
    WITH used AS (
      SELECT p.project_code AS code, min(p.cost_center) AS cost_center, array_agg(DISTINCT p.unit_code) FILTER (WHERE p.unit_code IS NOT NULL) AS units,
        (count(*) FILTER (WHERE ${inYear()}))::int AS count,
        coalesce(sum(p.total_amount) FILTER (WHERE ${inYear()}), 0) AS amount
      FROM ${purchases} p, ${selectedYear('$1')}
      WHERE p.project_code IS NOT NULL GROUP BY p.project_code
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
      (SELECT min(p.cost_center) FROM ${purchases} p WHERE p.project_code=$1) AS cost_center,
      EXISTS (SELECT 1 FROM cenit.purchase_requests p WHERE p.project_code=$1) AS used,
      ARRAY(SELECT DISTINCT extract(year FROM p.record_date)::int FROM cenit.purchase_requests p WHERE p.project_code=$1 ORDER BY 1 DESC) AS years
    FROM ${selectedYear('$2')}`, [code, year]);
  if (!identity || (!identity.in_catalog && !identity.used)) return null;
  const scope = `${purchases} p, ${selectedYear('$2')} WHERE p.project_code=$1 AND ${inYear()}`;
  const { rows: [totals] } = await db.query<{ count: number; amount: string; providers: number; last: string | null; year_total: string }>(`
    SELECT count(*)::int AS count, coalesce(sum(p.total_amount), 0)::text AS amount, count(DISTINCT p.provider_search)::int AS providers, max(p.record_date)::text AS last,
      (SELECT coalesce(sum(b.total_amount), 0) FROM cenit.purchase_requests b WHERE ${inYear('b')})::text AS year_total
    FROM ${scope} GROUP BY y.year`, [code, year]);
  const group = (column: string, name: (column: string) => string, limit = 500) => db.query<Row>(`SELECT ${column} AS code, ${name(column)} AS catalog_name, min(p.cost_center) AS cost_center,
      count(*)::int AS count, coalesce(sum(p.total_amount), 0)::text AS amount FROM ${scope}
      GROUP BY ${column} ORDER BY coalesce(sum(p.total_amount), 0) DESC, count(*) DESC, ${column} NULLS LAST LIMIT ${limit}`, [code, year]);
  const units = await group('p.unit_code', unitName), accounts = await group('p.accounting_code', accountName);
  // Las unidades del catálogo se muestran aunque el proyecto aún no tenga compras ese año.
  const catalogUnits = await db.query<{ code: string; name: string }>(`SELECT c.unit_code AS code, u.name FROM cenit.purchase_catalog_projects c
    JOIN cenit.purchase_catalog_units u ON u.code=c.unit_code WHERE c.code=$1 ORDER BY 1`, [code]);
  const unitRows = breakdown(units.rows, 0);
  for (const unit of catalogUnits.rows) if (!unitRows.some(row => row.code === unit.code)) unitRows.push({ code: unit.code, name: unit.name, count: 0, amount: '0' });
  const providers = await db.query<{ name: string | null; count: number; amount: string }>(`SELECT min(p.provider) AS name, count(*)::int AS count,
      coalesce(sum(p.total_amount), 0)::text AS amount FROM ${scope} GROUP BY p.provider_search ORDER BY coalesce(sum(p.total_amount), 0) DESC, 2 DESC, 1 NULLS LAST LIMIT 8`, [code, year]);
  const months = await db.query<{ month: string; count: number; amount: string }>(`WITH months AS (
      SELECT generate_series(make_date(y.year, 1, 1), make_date(y.year, 12, 1), '1 month')::date AS start FROM ${selectedYear('$2')}
    ) SELECT to_char(m.start, 'YYYY-MM') AS month, count(p.id)::int AS count, coalesce(sum(p.total_amount), 0)::text AS amount
      FROM months m LEFT JOIN cenit.purchase_requests p ON p.project_code=$1 AND p.record_date >= m.start AND p.record_date < (m.start + interval '1 month')::date
      GROUP BY m.start ORDER BY m.start`, [code, year]);
  const recent = await db.query<{ id: string; requestNumber: string; sentDate: string; description: string; provider: string | null; accountingCode: string | null;
    accountName: string | null; cost_center: string | null; documentType: string | null; amount: string | null }>(`SELECT p.id, p.request_number AS "requestNumber", p.record_date::text AS "sentDate",
      p.description, p.provider, p.accounting_code AS "accountingCode", ${accountName('p.accounting_code')} AS "accountName",
      p.cost_center, p.document_type AS "documentType", p.total_amount::text AS amount
    FROM ${scope} ORDER BY p.record_date DESC, p.id DESC LIMIT 10`, [code, year]);
  return {
    code, name: identity.catalog_name ?? costCenterName(identity.cost_center, 1, code), inCatalog: identity.in_catalog,
    year: String(identity.year).padStart(4, '0'), availableYears: [...new Set([identity.year, ...identity.years])].sort((a, b) => b - a),
    count: totals?.count ?? 0, amount: totals?.amount ?? '0', lineCount: totals?.count ?? 0, linesWithoutAmount: 0,
    yearLineTotal: totals?.year_total ?? (await db.query<{ total: string }>(`SELECT coalesce(sum(p.total_amount), 0)::text AS total FROM cenit.purchase_requests p,
      ${selectedYear('$1')} WHERE ${inYear()}`, [year])).rows[0]!.total,
    providerCount: totals?.providers ?? 0,
    units: unitRows, accounts: breakdown(accounts.rows, 2), providers: providers.rows, monthlyTotals: months.rows,
    purchases: recent.rows.map(({ cost_center, ...row }) => ({ ...row, accountName: row.accountName ?? costCenterName(cost_center, 2, row.accountingCode) })),
    lastSentDate: totals?.last ?? null,
  };
}
