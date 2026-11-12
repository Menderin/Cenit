import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { CreatePurchase, PurchasePayload, PurchaseRecord, PurchaseListQuery, PurchaseListResponse, PurchaseSummaryResponse } from '@cenit/contracts/purchases';
import { headerFields, lineFields, administrativeFields } from '@cenit/contracts/purchases';
import { ApiError } from '../../../infrastructure/errors.js';
import { enqueuePurchaseSheets } from './sheets.js';
import type { PurchaseExportRow, PurchaseExportBatch } from '../services/export.js';

// Column names come exclusively from the versioned contract, never request keys.
const column = (key: string) => key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
const headerKeys = Object.keys(headerFields), adminKeys = Object.keys(administrativeFields), lineKeys = Object.keys(lineFields);
const canonical = (input: PurchasePayload) => JSON.stringify({
  header: headerKeys.map(key => input.header[key as keyof typeof input.header]),
  administrative: adminKeys.map(key => input.administrative[key as keyof typeof input.administrative]),
  lines: input.lines.map(line => lineKeys.map(key => line[key as keyof typeof line])),
});
type Db = Pick<PoolClient, 'query'>;

function purchaseFilters(query: PurchaseListQuery) {
  const values: unknown[] = [];
  const parameter = (value: unknown) => { values.push(value); return `$${values.length}`; };
  const predicates = [query.reviewStatus === 'all' ? 'TRUE' : `p.review_status=${parameter(query.reviewStatus)}`];
  if (query.dateFrom) predicates.push(`p.sent_date >= ${parameter(query.dateFrom)}::date`);
  if (query.dateTo) predicates.push(`p.sent_date <= ${parameter(query.dateTo)}::date`);
  if (query.q) {
    const escaped = query.q.replace(/[\\%_]/g, '\\$&');
    const pattern = `('%' || cenit.normalize_purchase_search(${parameter(escaped)}) || '%')`;
    predicates.push(`(p.request_number_search LIKE ${pattern} ESCAPE chr(92) OR p.description_search LIKE ${pattern} ESCAPE chr(92)
      OR EXISTS (SELECT 1 FROM cenit.purchase_request_lines s WHERE s.request_id=p.id AND s.provider_search LIKE ${pattern} ESCAPE chr(92)))`);
  }
  const codes: string[] = [];
  if (query.unitCode) codes.push(`l.unit_code=${parameter(query.unitCode)}`);
  if (query.projectCode) codes.push(`l.project_code=${parameter(query.projectCode)}`);
  if (codes.length) predicates.push(`EXISTS (SELECT 1 FROM cenit.purchase_request_lines l WHERE l.request_id=p.id AND ${codes.join(' AND ')})`);
  const where = predicates.join(' AND ');
  return { where, values };
}

export class PurchaseRepository {
  constructor(private readonly pool: Pool) {}
  private async transaction<T>(run: (db: PoolClient) => Promise<T>, readOnly = false): Promise<T> {
    const db = await this.pool.connect();
    try { await db.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
      const result = await run(db); await db.query('COMMIT'); return result;
    } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  }
  private async detail(db: Db, id: string): Promise<PurchaseRecord | null> {
    const { rows } = await db.query(`SELECT p.*,c.name AS creator_name,r.name AS reviewer_name,p.sent_date::text AS date_text
      FROM cenit.purchase_requests p JOIN cenit.accounts c ON c.id=p.created_by LEFT JOIN cenit.accounts r ON r.id=p.reviewed_by WHERE p.id=$1`, [id]);
    const row = rows[0]; if (!row) return null;
    const lines = await db.query('SELECT * FROM cenit.purchase_request_lines WHERE request_id=$1 ORDER BY position', [id]);
    const fields = (keys: string[], source: Record<string, unknown>) => Object.fromEntries(keys.map(key => [key, source[column(key)]]));
    return {
      header: { ...fields(headerKeys, row), sentDate: row.date_text }, administrative: fields(adminKeys, row),
      lines: lines.rows.map(line => fields(lineKeys, line)), id: row.id, source: row.source, exampleId: row.example_id,
      capture: row.source === 'image_capture' ? { type: 'image_capture', extractionId: row.extraction_id, processorVersion: row.processor_version, processedAt: row.processed_at.toISOString() } : null,
      reviewStatus: row.review_status, version: row.version,
      createdAt: row.created_at.toISOString(), createdBy: { id: row.created_by, name: row.creator_name },
      reviewedAt: row.reviewed_at?.toISOString() ?? null, reviewedBy: row.reviewed_by ? { id: row.reviewed_by, name: row.reviewer_name } : null,
    } as PurchaseRecord;
  }
  async get(id: string) { return this.transaction(db => this.detail(db, id), true); }
  async summary(): Promise<PurchaseSummaryResponse> {
    return this.transaction(async db => {
    const { rows } = await db.query<{ date: string; requests: number; pending: number; amount: string }>(`SELECT sent_date::text AS date,
      count(*)::int AS requests, (count(*) FILTER (WHERE review_status='pending'))::int AS pending,
      coalesce(sum(total_amount) FILTER (WHERE review_status='pending'),0)::text AS amount
      FROM cenit.purchase_requests GROUP BY sent_date ORDER BY sent_date`);
    const metrics = (await db.query(`WITH period AS (
      SELECT date_trunc('month',now() AT TIME ZONE 'America/Santiago')::date AS month_start,
        date_trunc('year',now() AT TIME ZONE 'America/Santiago')::date AS year_start,
        to_char(now() AT TIME ZONE 'America/Santiago','YYYY-MM') AS registration_month
    ) SELECT coalesce(sum(total_amount),0)::text AS amount,
      coalesce(sum(total_amount) FILTER (WHERE sent_date >= period.year_start AND sent_date < (period.year_start + interval '1 year')::date),0)::text AS year_amount,
      coalesce(sum(total_amount) FILTER (WHERE sent_date >= period.month_start AND sent_date < (period.month_start + interval '1 month')::date),0)::text AS month_amount,
      period.registration_month,
      (count(*) FILTER (WHERE sent_date >= period.year_start AND sent_date < (period.year_start + interval '1 year')::date))::int AS year,
      (count(*) FILTER (WHERE sent_date >= period.month_start AND sent_date < (period.month_start + interval '1 month')::date))::int AS month,
      (count(*) FILTER (WHERE source='manual'))::int AS manual,
      (count(*) FILTER (WHERE source='image_capture'))::int AS image_capture,
      (count(*) FILTER (WHERE source='contract_example'))::int AS contract_example
      FROM period LEFT JOIN cenit.purchase_requests ON TRUE
      GROUP BY period.month_start,period.year_start,period.registration_month`)).rows[0];
    const activity = await db.query<{ date: string; count: number }>(`WITH dates AS (
      SELECT generate_series((now() AT TIME ZONE 'America/Santiago')::date-29,(now() AT TIME ZONE 'America/Santiago')::date,'1 day')::date AS day
    ), counts AS (SELECT (created_at AT TIME ZONE 'America/Santiago')::date AS day,count(*)::int AS count FROM cenit.purchase_requests
      WHERE created_at >= (((now() AT TIME ZONE 'America/Santiago')::date-29)::timestamp AT TIME ZONE 'America/Santiago') GROUP BY 1)
      SELECT dates.day::text AS date,coalesce(counts.count,0)::int AS count FROM dates LEFT JOIN counts USING(day) ORDER BY dates.day`);
    const months = await db.query<{ month: string; count: number; amount: string }>(`WITH months AS (
      SELECT generate_series(date_trunc('year',now() AT TIME ZONE 'America/Santiago')::date,date_trunc('year',now() AT TIME ZONE 'America/Santiago')::date + interval '11 month','1 month')::date AS start
    ) SELECT to_char(months.start,'YYYY-MM') AS month,count(requests.id)::int AS count,coalesce(sum(requests.total_amount),0)::text AS amount
      FROM months LEFT JOIN cenit.purchase_requests requests ON requests.sent_date >= months.start AND requests.sent_date < (months.start + interval '1 month')::date
      GROUP BY months.start ORDER BY months.start`);
    // Types are grouped without case so «COTIZACIÓN» and «Cotización» count once; the stored spelling is shown as written.
    const types = await db.query<{ documentType: string | null; count: number; amount: string }>(`WITH period AS (SELECT date_trunc('year',now() AT TIME ZONE 'America/Santiago')::date AS year_start)
      SELECT min(document_type) AS "documentType",count(*)::int AS count,sum(total_amount)::text AS amount
      FROM cenit.purchase_requests,period WHERE sent_date >= period.year_start AND sent_date < (period.year_start + interval '1 year')::date
      GROUP BY upper(document_type) ORDER BY sum(total_amount) DESC,2 DESC LIMIT 6`);
    const recent = await db.query(`SELECT id,request_number AS "requestNumber",description,sent_date::text AS "sentDate",total_amount AS "totalAmount",created_at AS "createdAt",source
      FROM cenit.purchase_requests ORDER BY created_at DESC,id DESC LIMIT 6`);
    return { data: {
      requests: rows.reduce((total, row) => total + row.requests, 0), pending: rows.reduce((total, row) => total + row.pending, 0),
      currency: 'CLP', pendingAmount: rows.reduce((total, row) => total + BigInt(row.amount), 0n).toString(),
      days: rows.map(row => ({ date: row.date, count: row.pending })),
      overview: { documentTotal: metrics.amount, documentTotalThisMonth: metrics.month_amount, registrationMonth: metrics.registration_month,
        registeredThisYear: metrics.year, registeredThisMonth: metrics.month,
        documentTotalThisYear: metrics.year_amount, monthlyTotals: months.rows, documentTypes: types.rows,
        sourceCounts: { manual: metrics.manual, image_capture: metrics.image_capture, contract_example: metrics.contract_example },
        registrationDays: activity.rows, recentRecords: recent.rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })),
      },
    } };
    }, true);
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
      const current = await db.query('SELECT version,source FROM cenit.purchase_requests WHERE id=$1 FOR UPDATE', [id]);
      const row = current.rows[0];
      if (!row) throw new ApiError(404, 'NOT_FOUND', 'Solicitud inexistente.');
      if (row.source === 'contract_example') throw new ApiError(409, 'EXAMPLE_READ_ONLY', 'Los ejemplos de demostración no se pueden editar.');
      if (row.version !== expectedVersion) {
        if (row.version > expectedVersion) {
          const latest = await this.detail(db, id);
          if (latest && canonical(latest) === canonical(input)) return { data: latest };
        }
        throw new ApiError(409, 'VERSION_CONFLICT', 'El registro cambió. Actualiza los datos antes de guardar.');
      }

      const values = [...headerKeys.map(key => input.header[key as keyof typeof input.header]), ...adminKeys.map(key => input.administrative[key as keyof typeof input.administrative])];
      const fields = [...headerKeys, ...adminKeys];
      const assignments = fields.map((key, index) => `${column(key)}=$${index + 2}`);
      const expectedVersionParam = values.length + 2;
      const changed = await db.query(`UPDATE cenit.purchase_requests SET ${assignments.join(',')},review_status='pending',reviewed_by=NULL,reviewed_at=NULL,version=version+1
        WHERE id=$1 AND version=$${expectedVersionParam} RETURNING id`, [id, ...values, expectedVersion]);
      if (!changed.rowCount) throw new ApiError(409, 'VERSION_CONFLICT', 'El registro cambió. Actualiza los datos antes de guardar.');

      await db.query('DELETE FROM cenit.purchase_request_lines WHERE request_id=$1', [id]);
      for (const [position, line] of input.lines.entries()) {
        const lineValues = [randomUUID(), id, position + 1, ...lineKeys.map(key => line[key as keyof typeof line])];
        await db.query(`INSERT INTO cenit.purchase_request_lines(id,request_id,position,${lineKeys.map(column).join(',')}) VALUES(${lineValues.map((_, i) => `$${i + 1}`).join(',')})`, lineValues);
      }
      await enqueuePurchaseSheets(db, id);
      return { data: (await this.detail(db, id))! };
    });
  }
  async create(input: CreatePurchase, accountId: string, authorizeNew: () => void = () => {}): Promise<{ record: PurchaseRecord; created: boolean }> {
    // Preserve the exact historical serialization for omitted/explicit manual origins.
    const content = canonical(input);
    const hash = createHash('sha256').update(input.origin?.type === 'contract_example'
      ? JSON.stringify({ content, source: 'contract_example', exampleId: input.origin.exampleId }) : input.origin?.type === 'image_capture'
        ? JSON.stringify({ content, source: 'image_capture', extractionId: input.origin.extractionId, processorVersion: input.origin.processorVersion, processedAt: input.origin.processedAt }) : content).digest('hex');
    return this.transaction(async db => {
      // Concurrent retries wait on the unique operation constraint, then read its committed result.
      const capture = input.origin?.type === 'image_capture' ? input.origin : null;
      const keys = [...headerKeys, ...adminKeys, 'source', 'exampleId', 'extractionId', 'processorVersion', 'processedAt'];
      const values = [...headerKeys.map(key => input.header[key as keyof typeof input.header]), ...adminKeys.map(key => input.administrative[key as keyof typeof input.administrative]), input.origin?.type ?? 'manual', input.origin?.type === 'contract_example' ? input.origin.exampleId : null, capture?.extractionId ?? null, capture?.processorVersion ?? null, capture?.processedAt ?? null];
      const id = randomUUID();
      const inserted = await db.query(`INSERT INTO cenit.purchase_requests(id,operation_id,payload_hash,created_by,${keys.map(column).join(',')})
        VALUES(${[id, input.operationId, hash, accountId, ...values].map((_, i) => `$${i + 1}`).join(',')}) ON CONFLICT(created_by,operation_id) DO NOTHING RETURNING id`, [id, input.operationId, hash, accountId, ...values]);
      if (!inserted.rowCount) {
        const existing = await db.query('SELECT id,payload_hash FROM cenit.purchase_requests WHERE created_by=$1 AND operation_id=$2', [accountId, input.operationId]);
        if (existing.rows[0]?.payload_hash !== hash) throw new ApiError(409, 'OPERATION_CONFLICT', 'Esta operación ya se utilizó con otros datos.');
        return { record: (await this.detail(db, existing.rows[0].id))!, created: false };
      }
      authorizeNew();
      for (const [position, line] of input.lines.entries()) {
        const fields = [randomUUID(), id, position + 1, ...lineKeys.map(key => line[key as keyof typeof line])];
        await db.query(`INSERT INTO cenit.purchase_request_lines(id,request_id,position,${lineKeys.map(column).join(',')}) VALUES(${fields.map((_, i) => `$${i + 1}`).join(',')})`, fields);
      }
      await enqueuePurchaseSheets(db, id);
      return { record: (await this.detail(db, id))!, created: true };
    });
  }
  async list(query: PurchaseListQuery): Promise<PurchaseListResponse> {
    return this.transaction(async db => {
      const { where, values } = purchaseFilters(query);
      // EXISTS preserves one row per request. Both statements share this transaction's snapshot.
      const count = await db.query(`SELECT count(*)::int AS total,coalesce(sum(p.total_amount),0)::text AS amount,
        ARRAY(SELECT DISTINCT extract(year FROM sent_date)::int FROM cenit.purchase_requests ORDER BY 1 DESC) AS years
        FROM cenit.purchase_requests p WHERE ${where}`, values);
      const direction = query.sort === 'sentDateAsc' ? 'ASC' : 'DESC';
      const { rows } = await db.query(`SELECT p.id,p.request_number AS "requestNumber",p.sent_date::text AS "sentDate",p.description,p.total_amount AS "totalAmount",p.document_type AS "documentType",p.review_status AS "reviewStatus",p.version,p.source,p.example_id AS "exampleId",
        CASE WHEN p.source='image_capture' THEN json_build_object('type','image_capture','extractionId',p.extraction_id,'processorVersion',p.processor_version,'processedAt',to_char(p.processed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ELSE NULL END AS capture
        FROM cenit.purchase_requests p WHERE ${where} ORDER BY p.sent_date ${direction},p.id ${direction} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, query.pageSize, (query.page - 1) * query.pageSize]);
      return { data: rows, pagination: { page: query.page, pageSize: query.pageSize, total: count.rows[0].total }, availableYears: count.rows[0].years, totals: { currency: 'CLP', documentTotal: count.rows[0].amount } };
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
      const direction = query.sort === 'sentDateAsc' ? 'ASC' : 'DESC';
      for (let offset = 0; offset < count.rows[0]!.total; offset += 100) {
        signal.throwIfAborted();
        const batch = await db.query<Omit<PurchaseExportRow, 'line'>>(`SELECT p.id,p.request_number AS "requestNumber",p.sent_date::text AS "sentDate",p.description,p.total_amount AS "totalAmount",p.document_type AS "documentType",p.review_status AS "reviewStatus"
          FROM cenit.purchase_requests p WHERE ${where} ORDER BY p.sent_date ${direction},p.id ${direction} LIMIT 100 OFFSET $${values.length + 1}`, [...values, offset]);
        await consume({ kind: 'purchases', rows: batch.rows });
      }
      await consume({ kind: 'purchasesComplete' });
      // A cursor bounds item batches independently of the number of lines in each purchase.
      await db.query(`DECLARE purchase_export_items NO SCROLL CURSOR FOR SELECT l.request_id AS "requestId",l.position,${lineKeys.map(key => `l.${column(key)} AS "${key}"`).join(',')}
        FROM cenit.purchase_request_lines l JOIN cenit.purchase_requests p ON p.id=l.request_id WHERE ${where}
        ORDER BY p.sent_date ${direction},p.id ${direction},l.position`, values);
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
  async validate(id: string, expectedVersion: number, accountId: string): Promise<PurchaseRecord> {
    return this.transaction(async db => {
      const result = await db.query('SELECT review_status,version FROM cenit.purchase_requests WHERE id=$1 FOR UPDATE', [id]);
      const row = result.rows[0];
      if (!row) throw new ApiError(404, 'NOT_FOUND', 'Solicitud inexistente.');
      if (row.review_status === 'reviewed') return (await this.detail(db, id))!;
      if (row.version !== expectedVersion) throw new ApiError(409, 'VERSION_CONFLICT', 'El registro cambió. Vuelve a consultar sus detalles.');
      await db.query("UPDATE cenit.purchase_requests SET review_status='reviewed',reviewed_by=$2,reviewed_at=clock_timestamp(),version=version+1 WHERE id=$1", [id, accountId]);
      await enqueuePurchaseSheets(db, id);
      return (await this.detail(db, id))!;
    });
  }
}
