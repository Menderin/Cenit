import type { Pool, PoolClient } from 'pg';
import type { PurchaseRecord, PurchaseSheetsResponse } from '@cenit/contracts/purchases';
import type { PurchaseRepository } from './purchases.js';

export async function enqueuePurchaseSheets(db: Pick<PoolClient, 'query'>, id: string) {
  await db.query(`INSERT INTO cenit.purchase_sheets_outbox(purchase_id) VALUES($1)
    ON CONFLICT(purchase_id) DO UPDATE SET generation=purchase_sheets_outbox.generation+1`, [id]);
}

export type SheetsJob = { id: string; generation: number; headerRow: number | null; itemRows: number[]; record: PurchaseRecord | null };
export class PurchaseSheetsRepository {
  constructor(private readonly pool: Pool, private readonly purchases: PurchaseRepository) {}

  async status(spreadsheetId: string, purchaseId?: string): Promise<PurchaseSheetsResponse> {
    const { rows } = await this.pool.query(`SELECT
      (count(*) FILTER (WHERE q.generation > coalesce(d.synced_generation,0)))::int AS pending,
      coalesce(bool_or(q.generation > coalesce(d.synced_generation,0) AND d.last_error IS NOT NULL),false) AS failed,
      max(d.last_synced_at) AS last_synced_at
      FROM cenit.purchase_sheets_outbox q LEFT JOIN cenit.purchase_sheets_delivery d
        ON d.purchase_id=q.purchase_id AND d.spreadsheet_id=$1 WHERE ($2::uuid IS NULL OR q.purchase_id=$2)`, [spreadsheetId, purchaseId ?? null]);
    const row = rows[0]!;
    return { data: { status: row.failed ? 'error' : row.pending ? 'pending' : 'synced', pending: row.pending,
      lastSyncedAt: row.last_synced_at?.toISOString() ?? null, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` } };
  }

  async deliver(spreadsheetId: string, send: (jobs: SheetsJob[]) => Promise<void>) {
    const db = await this.pool.connect();
    let locked = false;
    try {
      locked = (await db.query('SELECT pg_try_advisory_lock(1128615497,2) AS locked')).rows[0].locked;
      if (!locked) return;
      // Also includes copies written by a previous image after the migration.
      await db.query('INSERT INTO cenit.purchase_sheets_outbox(purchase_id) SELECT id FROM cenit.purchase_requests ON CONFLICT DO NOTHING');
      const pending = await db.query(`SELECT q.purchase_id,q.generation,d.header_row,d.item_rows FROM cenit.purchase_sheets_outbox q
        LEFT JOIN cenit.purchase_sheets_delivery d ON d.purchase_id=q.purchase_id AND d.spreadsheet_id=$1
        WHERE q.generation > coalesce(d.synced_generation,0) AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= now())
        ORDER BY q.purchase_id LIMIT 10`, [spreadsheetId]);
      if (!pending.rowCount) return;
      const jobs: SheetsJob[] = [];
      for (const row of pending.rows) jobs.push({ id: row.purchase_id, generation: row.generation,
        headerRow: row.header_row ?? null, itemRows: row.item_rows ?? [], record: await this.purchases.get(row.purchase_id) });
      await db.query('BEGIN');
      try {
        const maxima = (await db.query(`SELECT coalesce(max(header_row),1)::int AS header_row,
          coalesce((SELECT max(r) FROM cenit.purchase_sheets_delivery CROSS JOIN LATERAL unnest(item_rows) r WHERE spreadsheet_id=$1),1)::int AS item_row
          FROM cenit.purchase_sheets_delivery WHERE spreadsheet_id=$1`, [spreadsheetId])).rows[0];
        let header = maxima.header_row, item = maxima.item_row;
        for (const job of jobs) {
          if (job.record && !job.headerRow) job.headerRow = ++header;
          while (job.itemRows.length < (job.record?.lines.length ?? 0)) job.itemRows.push(++item);
          await db.query(`INSERT INTO cenit.purchase_sheets_delivery(spreadsheet_id,purchase_id,header_row,item_rows) VALUES($1,$2,$3,$4)
            ON CONFLICT(spreadsheet_id,purchase_id) DO UPDATE SET header_row=excluded.header_row,item_rows=excluded.item_rows`, [spreadsheetId, job.id, job.headerRow, job.itemRows]);
        }
        await db.query('COMMIT');
      } catch (error) { await db.query('ROLLBACK'); throw error; }
      // Persist row assignments before HTTP. Retries always overwrite the same cells,
      // including when Google applied a request whose response never arrived.
      try {
        await send(jobs);
        for (const job of jobs) await db.query(`UPDATE cenit.purchase_sheets_delivery SET
          synced_generation=greatest(synced_generation,$3),attempts=0,last_error=NULL,last_synced_at=now(),next_attempt_at=now()
          WHERE spreadsheet_id=$1 AND purchase_id=$2`, [spreadsheetId, job.id, job.generation]);
      } catch {
        for (const job of jobs) await db.query(`UPDATE cenit.purchase_sheets_delivery SET
          attempts=least(attempts+1,30),last_error='SHEETS_SYNC_FAILED',
          next_attempt_at=now()+least(300,5*power(2,least(attempts,6)))*(0.8+random()*0.4)*interval '1 second'
          WHERE spreadsheet_id=$1 AND purchase_id=$2`, [spreadsheetId, job.id]);
      }
    } finally {
      try { if (locked) await db.query('SELECT pg_advisory_unlock(1128615497,2)'); } finally { db.release(); }
    }
  }
}
