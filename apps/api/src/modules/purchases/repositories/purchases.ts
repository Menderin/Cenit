import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { CreatePurchase, PurchaseRecord, PurchaseListQuery, PurchaseListResponse } from '@cenit/contracts/purchases';
import { headerFields, lineFields, administrativeFields } from '@cenit/contracts/purchases';
import { ApiError } from '../../../infrastructure/errors.js';

// Column names come exclusively from the versioned contract, never request keys.
const column = (key: string) => key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
const headerKeys = Object.keys(headerFields), adminKeys = Object.keys(administrativeFields), lineKeys = Object.keys(lineFields);
const canonical = (input: CreatePurchase) => JSON.stringify({
  header: headerKeys.map(key => input.header[key as keyof typeof input.header]),
  administrative: adminKeys.map(key => input.administrative[key as keyof typeof input.administrative]),
  lines: input.lines.map(line => lineKeys.map(key => line[key as keyof typeof line])),
});
type Db = Pick<PoolClient, 'query'>;
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
      return { record: (await this.detail(db, id))!, created: true };
    });
  }
  async list(query: PurchaseListQuery): Promise<PurchaseListResponse> {
    return this.transaction(async db => {
      const values: unknown[] = [query.reviewStatus];
      const parameter = (value: unknown) => { values.push(value); return `$${values.length}`; };
      const predicates = ['p.review_status=$1'];
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
      // EXISTS preserves one row per request. Both statements share this transaction's snapshot.
      const count = await db.query(`SELECT count(*)::int AS total,coalesce(sum(p.total_amount),0)::text AS amount FROM cenit.purchase_requests p WHERE ${where}`, values);
      const { rows } = await db.query(`SELECT p.id,p.request_number AS "requestNumber",p.sent_date::text AS "sentDate",p.description,p.document_type AS "documentType",p.review_status AS "reviewStatus",p.version,p.source,p.example_id AS "exampleId",
        CASE WHEN p.source='image_capture' THEN json_build_object('type','image_capture','extractionId',p.extraction_id,'processorVersion',p.processor_version,'processedAt',to_char(p.processed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ELSE NULL END AS capture
        FROM cenit.purchase_requests p WHERE ${where} ORDER BY p.sent_date DESC,p.id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, query.pageSize, (query.page - 1) * query.pageSize]);
      return { data: rows, pagination: { page: query.page, pageSize: query.pageSize, total: count.rows[0].total }, totals: { currency: 'CLP', documentTotal: count.rows[0].amount } };
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
      return (await this.detail(db, id))!;
    });
  }
}
