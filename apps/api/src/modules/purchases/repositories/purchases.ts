import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { CreatePurchase, PurchaseCatalog, PurchasePayload, PurchaseProviderSuggestion, PurchaseRecord, PurchaseListQuery, PurchaseListResponse, PurchaseSummaryResponse } from '@cenit/contracts/purchases';
import { FAMED_ACCOUNTS, FAMED_UNIT_PREFIX, PAYMENT_SITUATIONS, lineFields, oracleFields, recordFields } from '@cenit/contracts/purchases';
import { ApiError } from '../../../infrastructure/errors.js';
import { enqueuePurchaseSheets } from './sheets.js';
import type { PurchaseExportBatch, PurchaseExportRow } from '../services/export.js';
import { projectOptions, projectSummary, selectedYear, yearBreakdowns } from './insights.js';

// Los nombres de columna salen sólo del contrato versionado, nunca de claves de la solicitud.
const column = (key: string) => key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
export const recordKeys = Object.keys(recordFields), oracleKeys = Object.keys(oracleFields), lineKeys = Object.keys(lineFields);
const headerKeys = [...recordKeys, ...oracleKeys];
const dateKeys = new Set(['recordDate', 'sentDate']);
const select = (key: string, alias = 'p') => dateKeys.has(key) ? `${alias}.${column(key)}::text AS "${key}"` : `${alias}.${column(key)} AS "${key}"`;
const canonical = (input: PurchasePayload) => JSON.stringify({
  record: recordKeys.map(key => input.record[key as keyof typeof input.record]),
  oracle: oracleKeys.map(key => input.oracle[key as keyof typeof input.oracle]),
  lines: input.lines.map(line => lineKeys.map(key => line[key as keyof typeof line])),
});
const headerValues = (input: PurchasePayload) => [...recordKeys.map(key => input.record[key as keyof typeof input.record]), ...oracleKeys.map(key => input.oracle[key as keyof typeof input.oracle])];
type Db = Pick<PoolClient, 'query'>;
const [PENDING, PAID] = PAYMENT_SITUATIONS;

function purchaseFilters(query: PurchaseListQuery, options: { payment?: boolean } = {}) {
  const values: unknown[] = [];
  const parameter = (value: unknown) => { values.push(value); return `$${values.length}`; };
  const predicates = ['TRUE'];
  if (query.dateFrom) predicates.push(`p.record_date >= ${parameter(query.dateFrom)}::date`);
  if (query.dateTo) predicates.push(`p.record_date <= ${parameter(query.dateTo)}::date`);
  if (query.q) {
    const escaped = query.q.replace(/[\\%_]/g, '\\$&');
    const pattern = `('%' || cenit.normalize_purchase_search(${parameter(escaped)}) || '%')`;
    const text = [`p.request_number_search LIKE ${pattern} ESCAPE chr(92)`, `p.description_search LIKE ${pattern} ESCAPE chr(92)`, `p.provider_search LIKE ${pattern} ESCAPE chr(92)`];
    // El RUT se busca por sus dígitos: «16.482.379», «16482379-2» y «164823792» encuentran lo mismo.
    const rut = query.q.toUpperCase().replace(/[^0-9K]/g, '');
    if (rut.length >= 4 && /^[0-9]+K?$/.test(rut)) text.push(`p.rut_search LIKE ${parameter(`%${rut}%`)}`);
    predicates.push(`(${text.join(' OR ')})`);
  }
  for (const key of ['unitCode', 'projectCode', 'accountingCode'] as const) if (query[key]) predicates.push(`p.${column(key)}=${parameter(query[key])}`);
  // «Pendientes» es todo lo que no está PAGADO, también un valor anotado antes (p. ej. «En revisión»); así Todas = Pendientes + Pagadas.
  if (options.payment !== false && query.paymentSituation) predicates.push(query.paymentSituation === PENDING ? `p.payment_situation<>${parameter(PAID)}` : `p.payment_situation=${parameter(query.paymentSituation)}`);
  return { where: predicates.join(' AND '), values };
}
const order = (query: PurchaseListQuery) => query.sort === 'dateAsc' ? 'p.record_date ASC,p.id ASC' : 'p.record_date DESC,p.id DESC';

export class PurchaseRepository {
  constructor(private readonly pool: Pool) {}
  private async transaction<T>(run: (db: PoolClient) => Promise<T>, readOnly = false): Promise<T> {
    const db = await this.pool.connect();
    try { await db.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
      const result = await run(db); await db.query('COMMIT'); return result;
    } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  }
  private async detail(db: Db, id: string): Promise<PurchaseRecord | null> {
    const { rows } = await db.query(`SELECT ${headerKeys.map(key => select(key)).join(',')},p.id,p.source,p.example_id,p.extraction_id,p.processor_version,p.processed_at,
      p.version,p.created_at,p.created_by,c.name AS creator_name FROM cenit.purchase_requests p JOIN cenit.accounts c ON c.id=p.created_by WHERE p.id=$1`, [id]);
    const row = rows[0]; if (!row) return null;
    const lines = await db.query(`SELECT ${lineKeys.map(key => select(key, 'l')).join(',')} FROM cenit.purchase_request_lines l WHERE l.request_id=$1 ORDER BY l.position`, [id]);
    const pick = (keys: string[]) => Object.fromEntries(keys.map(key => [key, row[key]]));
    return {
      record: pick(recordKeys), oracle: pick(oracleKeys), lines: lines.rows, id: row.id, source: row.source, exampleId: row.example_id,
      capture: row.source === 'image_capture' ? { type: 'image_capture', extractionId: row.extraction_id, processorVersion: row.processor_version, processedAt: row.processed_at.toISOString() } : null,
      version: row.version, createdAt: row.created_at.toISOString(), createdBy: { id: row.created_by, name: row.creator_name },
    } as PurchaseRecord;
  }
  private async insertLines(db: Db, id: string, lines: PurchasePayload['lines']) {
    for (const [position, line] of lines.entries()) {
      const values = [randomUUID(), id, position + 1, ...lineKeys.map(key => line[key as keyof typeof line])];
      await db.query(`INSERT INTO cenit.purchase_request_lines(id,request_id,position,${lineKeys.map(column).join(',')}) VALUES(${values.map((_, i) => `$${i + 1}`).join(',')})`, values);
    }
  }
  private async lockEditable(db: Db, id: string) {
    const { rows: [row] } = await db.query<{ version: number; source: string }>('SELECT version,source FROM cenit.purchase_requests WHERE id=$1 FOR UPDATE', [id]);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Solicitud inexistente.');
    if (row.source === 'contract_example') throw new ApiError(409, 'EXAMPLE_READ_ONLY', 'Los ejemplos de demostración no se pueden editar.');
    return row;
  }
  async get(id: string) { return this.transaction(db => this.detail(db, id), true); }
  async summary(year: number | null = null): Promise<PurchaseSummaryResponse> {
    return this.transaction(async db => {
    // «Por pagar»: las compras que todavía no están PAGADO (PENDIENTE o un valor anotado antes).
    const { rows } = await db.query<{ date: string; requests: number; pending: number; amount: string }>(`SELECT record_date::text AS date,
      count(*)::int AS requests, (count(*) FILTER (WHERE payment_situation<>$1))::int AS pending,
      coalesce(sum(total_amount) FILTER (WHERE payment_situation<>$1),0)::text AS amount
      FROM cenit.purchase_requests GROUP BY record_date ORDER BY record_date`, [PAID]);
    // Las cifras anuales siguen al año pedido (por defecto, el actual); las del mes siempre describen el mes en curso.
    const metrics = (await db.query(`WITH period AS (
      SELECT date_trunc('month',now() AT TIME ZONE 'America/Santiago')::date AS month_start,
        make_date(y.year,1,1) AS year_start, y.year,
        to_char(now() AT TIME ZONE 'America/Santiago','YYYY-MM') AS registration_month FROM ${selectedYear('$1')}
    ) SELECT period.year AS selected_year, coalesce(sum(total_amount),0)::text AS amount,
      coalesce(sum(total_amount) FILTER (WHERE record_date >= period.year_start AND record_date < (period.year_start + interval '1 year')::date),0)::text AS year_amount,
      coalesce(sum(total_amount) FILTER (WHERE record_date >= period.month_start AND record_date < (period.month_start + interval '1 month')::date),0)::text AS month_amount,
      period.registration_month,
      (count(*) FILTER (WHERE record_date >= period.year_start AND record_date < (period.year_start + interval '1 year')::date))::int AS year,
      (count(*) FILTER (WHERE record_date >= period.month_start AND record_date < (period.month_start + interval '1 month')::date))::int AS month,
      (count(*) FILTER (WHERE source='manual'))::int AS manual,
      (count(*) FILTER (WHERE source='image_capture'))::int AS image_capture,
      (count(*) FILTER (WHERE source='contract_example'))::int AS contract_example
      FROM period LEFT JOIN cenit.purchase_requests ON TRUE
      GROUP BY period.month_start,period.year_start,period.year,period.registration_month`, [year])).rows[0];
    const activity = await db.query<{ date: string; count: number }>(`WITH dates AS (
      SELECT generate_series((now() AT TIME ZONE 'America/Santiago')::date-29,(now() AT TIME ZONE 'America/Santiago')::date,'1 day')::date AS day
    ), counts AS (SELECT (created_at AT TIME ZONE 'America/Santiago')::date AS day,count(*)::int AS count FROM cenit.purchase_requests
      WHERE created_at >= (((now() AT TIME ZONE 'America/Santiago')::date-29)::timestamp AT TIME ZONE 'America/Santiago') GROUP BY 1)
      SELECT dates.day::text AS date,coalesce(counts.count,0)::int AS count FROM dates LEFT JOIN counts USING(day) ORDER BY dates.day`);
    const months = await db.query<{ month: string; count: number; amount: string }>(`WITH months AS (
      SELECT generate_series(make_date(y.year,1,1),make_date(y.year,12,1),'1 month')::date AS start FROM ${selectedYear('$1')}
    ) SELECT to_char(months.start,'YYYY-MM') AS month,count(requests.id)::int AS count,coalesce(sum(requests.total_amount),0)::text AS amount
      FROM months LEFT JOIN cenit.purchase_requests requests ON requests.record_date >= months.start AND requests.record_date < (months.start + interval '1 month')::date
      GROUP BY months.start ORDER BY months.start`, [year]);
    // Los tipos se agrupan sin distinguir mayúsculas: «COTIZACIÓN» y «Cotización» cuentan una vez; se muestra la escritura guardada.
    const types = await db.query<{ documentType: string | null; count: number; amount: string }>(`WITH period AS (SELECT make_date(y.year,1,1) AS year_start FROM ${selectedYear('$1')})
      SELECT min(document_type) AS "documentType",count(*)::int AS count,sum(total_amount)::text AS amount
      FROM cenit.purchase_requests,period WHERE record_date >= period.year_start AND record_date < (period.year_start + interval '1 year')::date
      GROUP BY upper(document_type) ORDER BY sum(total_amount) DESC,2 DESC LIMIT 6`, [year]);
    const recent = await db.query(`SELECT id,request_number AS "requestNumber",description,record_date::text AS "sentDate",total_amount AS "totalAmount",created_at AS "createdAt",source,
      project_code AS "projectCode" FROM cenit.purchase_requests ORDER BY created_at DESC,id DESC LIMIT 8`);
    const years = await db.query<{ year: number }>('SELECT DISTINCT extract(year FROM record_date)::int AS year FROM cenit.purchase_requests ORDER BY 1 DESC');
    const spending = await yearBreakdowns(db, year);
    return { data: {
      requests: rows.reduce((total, row) => total + row.requests, 0), pending: rows.reduce((total, row) => total + row.pending, 0),
      currency: 'CLP', pendingAmount: rows.reduce((total, row) => total + BigInt(row.amount), 0n).toString(),
      days: rows.map(row => ({ date: row.date, count: row.pending })),
      overview: { documentTotal: metrics.amount, documentTotalThisMonth: metrics.month_amount, registrationMonth: metrics.registration_month,
        registeredThisYear: metrics.year, registeredThisMonth: metrics.month,
        documentTotalThisYear: metrics.year_amount, monthlyTotals: months.rows, documentTypes: types.rows,
        year: String(metrics.selected_year).padStart(4, '0'), availableYears: years.rows.map(row => row.year), ...spending,
        sourceCounts: { manual: metrics.manual, image_capture: metrics.image_capture, contract_example: metrics.contract_example },
        registrationDays: activity.rows, recentRecords: recent.rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })),
      },
    } };
    }, true);
  }
  async projects(year: number | null = null) { return this.transaction(db => projectOptions(db, year), true); }
  async project(code: string, year: number | null = null) { return this.transaction(db => projectSummary(db, code, year), true); }
  /** Unidades de FAMED y cuentas vigentes para elegir; también las que ya aparecen en compras, aunque no sean de la Facultad. */
  async catalog(): Promise<PurchaseCatalog> {
    return this.transaction(async db => {
      const units = await db.query<{ code: string; name: string; famed: boolean }>(`SELECT code,name,code LIKE $1 AS famed FROM cenit.purchase_catalog_units
        WHERE code LIKE $1 OR code IN (SELECT unit_code FROM cenit.purchase_requests WHERE unit_code IS NOT NULL) ORDER BY code`, [`${FAMED_UNIT_PREFIX}%`]);
      const projects = await db.query<{ unitCode: string; code: string; name: string }>('SELECT unit_code AS "unitCode",code,name FROM cenit.purchase_catalog_projects ORDER BY unit_code,code');
      const accounts = await db.query<{ code: string; name: string }>(`SELECT code,name FROM cenit.purchase_catalog_accounts
        WHERE (plan='vigente' AND NOT is_group) OR code IN (SELECT accounting_code FROM cenit.purchase_requests WHERE accounting_code IS NOT NULL) ORDER BY code`);
      const famed = new Map(FAMED_ACCOUNTS.map(account => [account.code, account.item]));
      return { units: units.rows, projects: projects.rows,
        accounts: accounts.rows.map(account => ({ ...account, famed: famed.has(account.code), item: famed.get(account.code) ?? null })) };
    }, true);
  }
  /** Lo último registrado para los proveedores que coinciden: sirve para sugerir su RUT y los mismos códigos. */
  async providers(q: string): Promise<PurchaseProviderSuggestion[]> {
    const escaped = q.trim().replace(/[\\%_]/g, '\\$&');
    const { rows } = await this.pool.query<PurchaseProviderSuggestion>(`SELECT * FROM (
      SELECT DISTINCT ON (p.provider_search) p.provider, p.unit_code AS "unitCode", p.project_code AS "projectCode", p.accounting_code AS "accountingCode",
        p.request_number AS "requestNumber", p.record_date::text AS "recordDate",
        (SELECT r.rut FROM cenit.purchase_requests r WHERE r.provider_search=p.provider_search AND r.rut ~ '^[1-9][0-9]{0,8}-[0-9K]$' ORDER BY r.record_date DESC,r.created_at DESC LIMIT 1) AS rut,
        (SELECT count(*) FROM cenit.purchase_requests r WHERE r.provider_search=p.provider_search)::int AS count
      FROM cenit.purchase_requests p WHERE p.provider_search LIKE ('%' || cenit.normalize_purchase_search($1) || '%') ESCAPE chr(92)
      ORDER BY p.provider_search, p.record_date DESC, p.created_at DESC) s ORDER BY (cenit.normalize_purchase_search(s.provider) LIKE cenit.normalize_purchase_search($1) || '%') DESC, s.count DESC, s.provider LIMIT 10`, [escaped]);
    return rows;
  }
  async delete(id: string, expectedVersion: number) {
    return this.transaction(async db => {
      const result = await db.query('SELECT version FROM cenit.purchase_requests WHERE id=$1 FOR UPDATE', [id]);
      if (!result.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Solicitud inexistente.');
      if (result.rows[0].version !== expectedVersion) throw new ApiError(409, 'VERSION_CONFLICT', 'El registro cambió. Actualiza los datos antes de eliminarlo.');
      await db.query('DELETE FROM cenit.purchase_request_lines WHERE request_id=$1', [id]);
      await db.query('DELETE FROM cenit.purchase_requests WHERE id=$1', [id]);
      await enqueuePurchaseSheets(db, id);
      return { data: { id } };
    });
  }
  async update(id: string, input: PurchasePayload, expectedVersion: number): Promise<{ data: PurchaseRecord }> {
    return this.transaction(async db => {
      const row = await this.lockEditable(db, id);
      if (row.version !== expectedVersion) {
        if (row.version > expectedVersion) {
          const latest = await this.detail(db, id);
          if (latest && canonical(latest) === canonical(input)) return { data: latest };
        }
        throw new ApiError(409, 'VERSION_CONFLICT', 'El registro cambió. Actualiza los datos antes de guardar.');
      }
      const values = headerValues(input);
      const assignments = headerKeys.map((key, index) => `${column(key)}=$${index + 2}`);
      const changed = await db.query(`UPDATE cenit.purchase_requests SET ${assignments.join(',')},version=version+1
        WHERE id=$1 AND version=$${values.length + 2} RETURNING id`, [id, ...values, expectedVersion]);
      if (!changed.rowCount) throw new ApiError(409, 'VERSION_CONFLICT', 'El registro cambió. Actualiza los datos antes de guardar.');
      await db.query('DELETE FROM cenit.purchase_request_lines WHERE request_id=$1', [id]);
      await this.insertLines(db, id, input.lines);
      await enqueuePurchaseSheets(db, id);
      return { data: (await this.detail(db, id))! };
    });
  }
  /** Cambia sólo la situación de pago; repetir el mismo cambio ya aplicado devuelve la compra vigente. */
  async setPaymentSituation(id: string, expectedVersion: number, paymentSituation: string): Promise<{ data: PurchaseRecord }> {
    return this.transaction(async db => {
      const row = await this.lockEditable(db, id);
      if (row.version !== expectedVersion) {
        const latest = await this.detail(db, id);
        if (row.version > expectedVersion && latest?.record.paymentSituation === paymentSituation) return { data: latest };
        throw new ApiError(409, 'VERSION_CONFLICT', 'La compra cambió. Actualiza los datos antes de cambiar su situación de pago.');
      }
      await db.query('UPDATE cenit.purchase_requests SET payment_situation=$2,version=version+1 WHERE id=$1', [id, paymentSituation]);
      await enqueuePurchaseSheets(db, id);
      return { data: (await this.detail(db, id))! };
    });
  }
  async create(input: CreatePurchase, accountId: string, authorizeNew: () => void = () => {}): Promise<{ record: PurchaseRecord; created: boolean }> {
    const content = canonical(input);
    const hash = createHash('sha256').update(input.origin?.type === 'contract_example'
      ? JSON.stringify({ content, source: 'contract_example', exampleId: input.origin.exampleId }) : input.origin?.type === 'image_capture'
        ? JSON.stringify({ content, source: 'image_capture', extractionId: input.origin.extractionId, processorVersion: input.origin.processorVersion, processedAt: input.origin.processedAt }) : content).digest('hex');
    return this.transaction(async db => {
      // Los reintentos simultáneos esperan la restricción única de la operación y luego leen su resultado confirmado.
      const capture = input.origin?.type === 'image_capture' ? input.origin : null;
      const keys = [...headerKeys, 'source', 'exampleId', 'extractionId', 'processorVersion', 'processedAt'];
      const values = [...headerValues(input), input.origin?.type ?? 'manual', input.origin?.type === 'contract_example' ? input.origin.exampleId : null, capture?.extractionId ?? null, capture?.processorVersion ?? null, capture?.processedAt ?? null];
      const id = randomUUID();
      const inserted = await db.query(`INSERT INTO cenit.purchase_requests(id,operation_id,payload_hash,created_by,${keys.map(column).join(',')})
        VALUES(${[id, input.operationId, hash, accountId, ...values].map((_, i) => `$${i + 1}`).join(',')}) ON CONFLICT(created_by,operation_id) DO NOTHING RETURNING id`, [id, input.operationId, hash, accountId, ...values]);
      if (!inserted.rowCount) {
        const existing = await db.query('SELECT id,payload_hash FROM cenit.purchase_requests WHERE created_by=$1 AND operation_id=$2', [accountId, input.operationId]);
        if (existing.rows[0]?.payload_hash !== hash) throw new ApiError(409, 'OPERATION_CONFLICT', 'Esta operación ya se utilizó con otros datos.');
        return { record: (await this.detail(db, existing.rows[0].id))!, created: false };
      }
      authorizeNew();
      await this.insertLines(db, id, input.lines);
      await enqueuePurchaseSheets(db, id);
      return { record: (await this.detail(db, id))!, created: true };
    });
  }
  async list(query: PurchaseListQuery): Promise<PurchaseListResponse> {
    return this.transaction(async db => {
      const { where, values } = purchaseFilters(query);
      const unpaid = purchaseFilters(query, { payment: false });
      // Todo se lee en la misma instantánea de la transacción.
      const count = await db.query(`SELECT count(*)::int AS total,coalesce(sum(p.total_amount),0)::text AS amount,
        ARRAY(SELECT DISTINCT extract(year FROM record_date)::int FROM cenit.purchase_requests ORDER BY 1 DESC) AS years
        FROM cenit.purchase_requests p WHERE ${where}`, values);
      const counts = await db.query<{ all: number; pending: number; paid: number }>(`SELECT count(*)::int AS "all",
        (count(*) FILTER (WHERE p.payment_situation<>$${unpaid.values.length + 1}))::int AS pending,
        (count(*) FILTER (WHERE p.payment_situation=$${unpaid.values.length + 1}))::int AS paid
        FROM cenit.purchase_requests p WHERE ${unpaid.where}`, [...unpaid.values, PAID]);
      const { rows } = await db.query(`SELECT p.id,p.record_date::text AS "recordDate",p.request_number AS "requestNumber",p.provider,p.description,p.total_amount AS "totalAmount",
        p.document_type AS "documentType",p.unit_code AS "unitCode",p.payment_situation AS "paymentSituation",p.version,p.source,p.example_id AS "exampleId"
        FROM cenit.purchase_requests p WHERE ${where} ORDER BY ${order(query)} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, query.pageSize, (query.page - 1) * query.pageSize]);
      return { data: rows, pagination: { page: query.page, pageSize: query.pageSize, total: count.rows[0].total }, availableYears: count.rows[0].years,
        paymentCounts: counts.rows[0]!, totals: { currency: 'CLP', documentTotal: count.rows[0].amount } };
    }, true);
  }
  async export(query: PurchaseListQuery, consume: (batch: PurchaseExportBatch) => Promise<void>, signal: AbortSignal) {
    return this.transaction(async db => {
      const { where, values } = purchaseFilters(query);
      signal.throwIfAborted();
      const count = await db.query<{ total: number; amount: string }>(`SELECT count(*)::int AS total,coalesce(sum(p.total_amount),0)::text AS amount FROM cenit.purchase_requests p WHERE ${where}`, values);
      if (count.rows[0]!.total > 10_000) throw new ApiError(413, 'EXPORT_LIMIT', 'La exportación supera el límite de 10.000 compras.');
      const items = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM cenit.purchase_request_lines l JOIN cenit.purchase_requests p ON p.id=l.request_id WHERE ${where}`, values);
      await consume({ kind: 'summary', purchaseCount: count.rows[0]!.total, itemCount: items.rows[0]!.total, documentTotal: count.rows[0]!.amount });
      for (let offset = 0; offset < count.rows[0]!.total; offset += 100) {
        signal.throwIfAborted();
        const batch = await db.query<Omit<PurchaseExportRow, 'line'>>(`SELECT p.id,${headerKeys.map(key => select(key)).join(',')}
          FROM cenit.purchase_requests p WHERE ${where} ORDER BY ${order(query)} LIMIT 100 OFFSET $${values.length + 1}`, [...values, offset]);
        await consume({ kind: 'purchases', rows: batch.rows });
      }
      await consume({ kind: 'purchasesComplete' });
      // Un cursor limita los lotes de líneas sin importar cuántas tenga cada compra.
      await db.query(`DECLARE purchase_export_items NO SCROLL CURSOR FOR SELECT l.request_id AS "requestId",l.position,${lineKeys.map(key => `l.${column(key)} AS "${key}"`).join(',')}
        FROM cenit.purchase_request_lines l JOIN cenit.purchase_requests p ON p.id=l.request_id WHERE ${where}
        ORDER BY ${order(query)},l.position`, values);
      while (true) {
        signal.throwIfAborted();
        const batch = await db.query<NonNullable<PurchaseExportRow['line']> & { requestId: string }>('FETCH FORWARD 100 FROM purchase_export_items');
        if (!batch.rows.length) break;
        await consume({ kind: 'items', rows: batch.rows });
      }
      await db.query('CLOSE purchase_export_items');
      signal.throwIfAborted();
    }, true);
  }
}
