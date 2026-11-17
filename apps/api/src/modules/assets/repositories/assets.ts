import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type {
  AssetDetail, AssetEvent, AssetListItem, AssetListQuery, AssetListResponse, AssetLocation, AssetSummary, CreateAsset, CreateDelivery, CreateLoan,
  Delivery, DeliveryListResponse, DocumentItem, DocumentListQuery, Loan, LoanListResponse, PeopleQuery, Person, PersonInput, ReturnLoan, UpdateAsset,
} from '@cenit/contracts/assets';
import { ApiError } from '../../../infrastructure/errors.js';

type Db = Pick<PoolClient, 'query'>;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const today = `(now() AT TIME ZONE 'America/Santiago')::date`;
const code = (alias: string) => `('BN-' || lpad(${alias}.number::text, 4, '0'))`;
const folio = (alias: string) => `(lpad(${alias}.number::text, 3, '0') || '/' || ${alias}.year)`;
const dataColumns = ['kind', 'quantity', 'description', 'inventory_number', 'brand', 'model', 'serial_number', 'furniture_type', 'material', 'dimensions', 'area', 'system_part', 'wall_mounted', 'assembled', 'notes', 'purchase_id'] as const;
const dataValues = (input: CreateAsset | UpdateAsset) => [input.kind, input.quantity, input.description, input.inventoryNumber, input.brand, input.model, input.serialNumber,
  input.furnitureType, input.material, input.dimensions, input.area, input.systemPart, input.wallMounted, input.assembled, input.notes, input.purchaseId];

// Un bien con su responsable y préstamo vigente; el estado se calcula, nunca se guarda.
const assetRows = `SELECT a.*, ${code('a')} AS code, a.registered_on::text AS registered_text,
  p.id AS person_id, p.name AS person_name, p.unit AS person_unit, p.active AS person_active,
  l.id AS loan_id, ${folio('l')} AS loan_number, b.name AS borrower_name, l.loaned_on::text AS loaned_text, l.due_on::text AS due_text,
  CASE WHEN l.id IS NOT NULL AND l.due_on < ${today} THEN 'vencido' WHEN l.id IS NOT NULL THEN 'prestamo'
    WHEN p.id IS NOT NULL AND NOT p.active THEN 'revisar' WHEN p.id IS NOT NULL THEN 'asignado' ELSE 'sin_responsable' END AS status,
  a.search_text || ' ' || lower(${code('a')}) || ' ' || coalesce(cenit.normalize_purchase_search(p.name || ' ' || coalesce(p.unit, '')), '') AS haystack
  FROM cenit.assets a LEFT JOIN cenit.asset_people p ON p.id = a.custodian_id
  LEFT JOIN cenit.asset_loan_items li ON li.asset_id = a.id AND EXISTS (SELECT 1 FROM cenit.asset_loans x WHERE x.id = li.loan_id AND x.returned_on IS NULL)
  LEFT JOIN cenit.asset_loans l ON l.id = li.loan_id LEFT JOIN cenit.asset_people b ON b.id = l.borrower_id`;

const listItem = (row: Row): AssetListItem => ({
  id: row.id, code: row.code, inventoryNumber: row.inventory_number, kind: row.kind, description: row.description, brand: row.brand, model: row.model,
  serialNumber: row.serial_number, material: row.material, dimensions: row.dimensions, quantity: row.quantity, location: row.location,
  custodian: row.person_id ? { id: row.person_id, name: row.person_name, unit: row.person_unit, active: row.person_active } : null,
  status: row.status, loan: row.loan_id ? { id: row.loan_id, number: row.loan_number, borrowerName: row.borrower_name, loanedOn: row.loaned_text, dueOn: row.due_text } : null,
});
const person = (row: Row, prefix = ''): Person => ({
  id: row[`${prefix}id`], name: row[`${prefix}name`], rut: row[`${prefix}rut`], unit: row[`${prefix}unit`], position: row[`${prefix}position`],
  active: row[`${prefix}active`], inactiveSince: row[`${prefix}inactive_text`] ?? null, assetCount: Number(row[`${prefix}asset_count`] ?? 0),
});
const personColumns = (alias: string, prefix: string) => `${alias}.id AS ${prefix}id, ${alias}.name AS ${prefix}name, ${alias}.rut AS ${prefix}rut, ${alias}.unit AS ${prefix}unit,
  ${alias}.position AS ${prefix}position, ${alias}.active AS ${prefix}active, ${alias}.inactive_since::text AS ${prefix}inactive_text,
  (SELECT count(*)::int FROM cenit.assets c WHERE c.custodian_id = ${alias}.id) AS ${prefix}asset_count`;
const documentItem = (row: Row): DocumentItem => ({
  assetId: row.id, code: row.code, quantity: row.quantity, kind: row.kind, description: row.description, brand: row.brand, model: row.model,
  serialNumber: row.serial_number, material: row.material, dimensions: row.dimensions,
});
function words(q?: string) {
  return (q ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es').split(/\s+/).filter(Boolean).slice(0, 8)
    .map(word => `%${word.replace(/[\\%_]/g, '\\$&')}%`);
}

export class AssetRepository {
  constructor(private readonly pool: Pool) {}
  private async transaction<T>(run: (db: PoolClient) => Promise<T>, readOnly = false): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
      const result = await run(db); await db.query('COMMIT'); return result;
    } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  }

  async summary(): Promise<AssetSummary> {
    return this.transaction(async db => {
      const { rows: [counts] } = await db.query(`SELECT count(*)::int AS total, (count(*) FILTER (WHERE status IN ('prestamo','vencido')))::int AS on_loan,
        (count(*) FILTER (WHERE status = 'vencido'))::int AS overdue, (count(*) FILTER (WHERE status = 'revisar'))::int AS review,
        (count(*) FILTER (WHERE status = 'sin_responsable'))::int AS unassigned FROM (${assetRows}) s`);
      const { rows: [other] } = await db.query(`SELECT (SELECT count(*)::int FROM cenit.asset_deliveries) AS deliveries,
        (SELECT count(*)::int FROM cenit.asset_loans WHERE returned_on IS NULL) AS loans, (SELECT count(*)::int FROM cenit.asset_people) AS people,
        (SELECT count(*)::int FROM cenit.asset_people p WHERE NOT p.active AND EXISTS (SELECT 1 FROM cenit.assets a WHERE a.custodian_id = p.id)) AS people_review`);
      const { rows: locations } = await db.query(`SELECT location FROM cenit.assets GROUP BY location ORDER BY count(*) DESC, location LIMIT 200`);
      return { total: counts.total, onLoan: counts.on_loan, overdue: counts.overdue, review: counts.review, unassigned: counts.unassigned,
        deliveries: other.deliveries, loans: other.loans, people: other.people, peopleReview: other.people_review, locations: locations.map(row => row.location) };
    }, true);
  }

  async list(query: AssetListQuery): Promise<AssetListResponse> {
    const values: unknown[] = [];
    const parameter = (value: unknown) => { values.push(value); return `$${values.length}`; };
    const predicates = words(query.q).map(word => `s.haystack LIKE ${parameter(word)} ESCAPE chr(92)`);
    if (query.kind) predicates.push(`s.kind = ${parameter(query.kind)}`);
    if (query.status) predicates.push(`s.status = ${parameter(query.status)}`);
    if (query.custodianId) predicates.push(`s.custodian_id = ${parameter(query.custodianId)}`);
    if (query.available === 'loan') predicates.push(`s.loan_id IS NULL`);
    const where = predicates.length ? `WHERE ${predicates.join(' AND ')}` : '';
    return this.transaction(async db => {
      const { rows: [{ total }] } = await db.query(`SELECT count(*)::int AS total FROM (${assetRows}) s ${where}`, values);
      const { rows } = await db.query(`SELECT * FROM (${assetRows}) s ${where} ORDER BY s.number DESC
        LIMIT ${parameter(query.pageSize)} OFFSET ${parameter((query.page - 1) * query.pageSize)}`, values);
      return { data: rows.map(listItem), pagination: { page: query.page, pageSize: query.pageSize, total } };
    }, true);
  }

  private async detail(db: Db, id: string): Promise<AssetDetail | null> {
    const { rows: [row] } = await db.query(`SELECT s.*, s.created_at AS asset_created_at, ${personColumns('p', 'c_')}, r.request_number, r.description AS purchase_description
      FROM (${assetRows}) s LEFT JOIN cenit.asset_people p ON p.id = s.custodian_id LEFT JOIN cenit.purchase_requests r ON r.id = s.purchase_id WHERE s.id = $1`, [id]);
    if (!row) return null;
    const { rows: events } = await db.query(`SELECT e.*, e.occurred_on::text AS occurred_text, p.name AS person_name, u.name AS creator_name,
      d.id AS d_id, ${folio('d')} AS d_number, l.id AS l_id, ${folio('l')} AS l_number
      FROM cenit.asset_events e JOIN cenit.accounts u ON u.id = e.created_by LEFT JOIN cenit.asset_people p ON p.id = e.person_id
      LEFT JOIN cenit.asset_deliveries d ON d.id = e.delivery_id LEFT JOIN cenit.asset_loans l ON l.id = e.loan_id
      WHERE e.asset_id = $1 ORDER BY e.occurred_on DESC, e.created_at DESC`, [id]);
    return {
      ...listItem(row), kind: row.kind, quantity: row.quantity, description: row.description, furnitureType: row.furniture_type, area: row.area,
      systemPart: row.system_part, wallMounted: row.wall_mounted, assembled: row.assembled, notes: row.notes, purchaseId: row.purchase_id,
      registeredOn: row.registered_text, version: row.version, createdAt: row.asset_created_at.toISOString(),
      custodian: row.c_id ? person(row, 'c_') : null,
      purchase: row.purchase_id ? { id: row.purchase_id, requestNumber: row.request_number, description: row.purchase_description } : null,
      events: events.map((event): AssetEvent => ({
        id: event.id, kind: event.kind, occurredOn: event.occurred_text, createdAt: event.created_at.toISOString(), createdBy: event.creator_name,
        person: event.person_name, locationFrom: event.location_from, locationTo: event.location_to, note: event.note,
        document: event.d_id ? { type: 'delivery', id: event.d_id, number: event.d_number } : event.l_id ? { type: 'loan', id: event.l_id, number: event.l_number } : null,
      })),
    };
  }
  async get(id: string) { return this.transaction(db => this.detail(db, id), true); }

  private async checkReferences(db: Db, input: { purchaseId: string | null; custodianId?: string | null }) {
    if (input.purchaseId && !(await db.query('SELECT 1 FROM cenit.purchase_requests WHERE id = $1', [input.purchaseId])).rowCount)
      throw new ApiError(422, 'VALIDATION_ERROR', 'La compra asociada ya no existe en Cenit.');
    if (input.custodianId && !(await db.query('SELECT 1 FROM cenit.asset_people WHERE id = $1', [input.custodianId])).rowCount)
      throw new ApiError(422, 'VALIDATION_ERROR', 'El responsable indicado no existe.');
  }
  private async event(db: Db, actor: string, event: { assetId: string; kind: AssetEvent['kind']; occurredOn: string; personId?: string | null; locationFrom?: string | null; locationTo?: string | null; note?: string | null; deliveryId?: string; loanId?: string }) {
    await db.query(`INSERT INTO cenit.asset_events (id, asset_id, kind, occurred_on, person_id, location_from, location_to, note, delivery_id, loan_id, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [randomUUID(), event.assetId, event.kind, event.occurredOn, event.personId ?? null,
      event.locationFrom ?? null, event.locationTo ?? null, event.note ?? null, event.deliveryId ?? null, event.loanId ?? null, actor]);
  }
  private async insertAsset(db: Db, actor: string, input: CreateAsset): Promise<string> {
    const id = randomUUID();
    await db.query(`INSERT INTO cenit.assets (id, operation_id, ${dataColumns.join(', ')}, location, custodian_id, registered_on, created_by)
      VALUES ($1, $2, ${dataColumns.map((_, i) => `$${i + 3}`).join(', ')}, $19, $20, $21, $22)`,
    [id, input.operationId, ...dataValues(input), input.location, input.custodianId, input.registeredOn, actor]);
    await this.event(db, actor, { assetId: id, kind: 'alta', occurredOn: input.registeredOn, personId: input.custodianId, locationTo: input.location });
    return id;
  }

  async create(input: CreateAsset, actor: string): Promise<{ created: boolean; record: AssetDetail }> {
    return this.transaction(async db => {
      const existing = await db.query('SELECT id FROM cenit.assets WHERE created_by = $1 AND operation_id = $2', [actor, input.operationId]);
      if (existing.rows[0]) return { created: false, record: (await this.detail(db, existing.rows[0].id))! };
      await this.checkReferences(db, input);
      const id = await this.insertAsset(db, actor, input);
      return { created: true, record: (await this.detail(db, id))! };
    });
  }

  async update(id: string, input: UpdateAsset, actor: string): Promise<AssetDetail> {
    return this.transaction(async db => {
      await this.checkReferences(db, input);
      const { rowCount } = await db.query(`UPDATE cenit.assets SET ${dataColumns.map((column, i) => `${column} = $${i + 3}`).join(', ')}, version = version + 1
        WHERE id = $1 AND version = $2`, [id, input.expectedVersion, ...dataValues(input)]);
      if (!rowCount) await this.conflict(db, id);
      await this.event(db, actor, { assetId: id, kind: 'edicion', occurredOn: (await db.query(`SELECT ${today}::text AS d`)).rows[0].d, note: 'Datos del bien actualizados.' });
      return (await this.detail(db, id))!;
    });
  }
  private async conflict(db: Db, id: string): Promise<never> {
    if (!(await db.query('SELECT 1 FROM cenit.assets WHERE id = $1', [id])).rowCount) throw new ApiError(404, 'NOT_FOUND', 'El bien no existe.');
    throw new ApiError(409, 'VERSION_CONFLICT', 'Otra persona modificó este bien. Recarga la ficha para ver los cambios.');
  }

  async relocate(id: string, input: AssetLocation, actor: string): Promise<AssetDetail> {
    return this.transaction(async db => {
      const { rows: [current] } = await db.query('SELECT location FROM cenit.assets WHERE id = $1 AND version = $2 FOR UPDATE', [id, input.expectedVersion]);
      if (!current) await this.conflict(db, id);
      if (current.location === input.location) throw new ApiError(422, 'VALIDATION_ERROR', 'El bien ya está en esa ubicación.');
      await db.query('UPDATE cenit.assets SET location = $2, version = version + 1 WHERE id = $1', [id, input.location]);
      await this.event(db, actor, { assetId: id, kind: 'ubicacion', occurredOn: input.occurredOn, locationFrom: current.location, locationTo: input.location, note: input.note });
      return (await this.detail(db, id))!;
    });
  }

  async people(query: PeopleQuery): Promise<Person[]> {
    const values: unknown[] = [];
    const predicates = words(query.q).map(word => { values.push(word); return `cenit.normalize_purchase_search(p.name || ' ' || coalesce(p.rut, '') || ' ' || coalesce(p.unit, '') || ' ' || coalesce(p.position, '')) LIKE $${values.length} ESCAPE chr(92)`; });
    if (query.status === 'active') predicates.push('p.active');
    if (query.status === 'inactive') predicates.push('NOT p.active');
    if (query.status === 'review') predicates.push('NOT p.active AND EXISTS (SELECT 1 FROM cenit.assets a WHERE a.custodian_id = p.id)');
    const { rows } = await this.pool.query(`SELECT ${personColumns('p', '')} FROM cenit.asset_people p ${predicates.length ? `WHERE ${predicates.join(' AND ')}` : ''}
      ORDER BY p.active, p.name LIMIT 200`, values);
    return rows.map(row => person(row));
  }
  private async person(db: Db, id: string) {
    const { rows: [row] } = await db.query(`SELECT ${personColumns('p', '')} FROM cenit.asset_people p WHERE p.id = $1`, [id]);
    return row ? person(row) : null;
  }
  async createPerson(input: PersonInput, actor: string): Promise<Person> {
    return this.transaction(async db => {
      const id = randomUUID();
      await db.query('INSERT INTO cenit.asset_people (id, name, rut, unit, position, created_by) VALUES ($1,$2,$3,$4,$5,$6)', [id, input.name.trim(), input.rut, input.unit, input.position, actor]);
      return (await this.person(db, id))!;
    });
  }
  async setPersonStatus(id: string, active: boolean): Promise<Person> {
    return this.transaction(async db => {
      const { rowCount } = await db.query(`UPDATE cenit.asset_people SET active = $2, inactive_since = CASE WHEN $2 THEN NULL ELSE coalesce(inactive_since, ${today}) END WHERE id = $1`, [id, active]);
      if (!rowCount) throw new ApiError(404, 'NOT_FOUND', 'La persona no existe.');
      return (await this.person(db, id))!;
    });
  }

  private async nextNumber(db: Db, table: 'asset_deliveries' | 'asset_loans', year: number) {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1), $2)', [table, year]);
    const { rows: [row] } = await db.query(`SELECT coalesce(max(number), 0) + 1 AS next FROM cenit.${table} WHERE year = $1`, [year]);
    return row.next as number;
  }
  private async lockAssets(db: Db, ids: string[]) {
    const { rows } = await db.query(`SELECT a.id, a.location, a.custodian_id, ${code('a')} AS code,
      EXISTS (SELECT 1 FROM cenit.asset_loan_items i JOIN cenit.asset_loans l ON l.id = i.loan_id WHERE i.asset_id = a.id AND l.returned_on IS NULL) AS on_loan
      FROM cenit.assets a WHERE a.id = ANY($1::uuid[]) FOR UPDATE OF a`, [ids]);
    if (rows.length !== ids.length) throw new ApiError(422, 'VALIDATION_ERROR', 'Uno de los bienes ya no existe en el inventario.');
    return new Map(rows.map(row => [row.id as string, row]));
  }
  private async documentItems(db: Db, table: 'asset_delivery_items' | 'asset_loan_items', key: 'delivery_id' | 'loan_id', id: string) {
    const { rows } = await db.query(`SELECT a.*, ${code('a')} AS code FROM cenit.${table} i JOIN cenit.assets a ON a.id = i.asset_id WHERE i.${key} = $1 ORDER BY i.position`, [id]);
    return rows.map(documentItem);
  }

  async createDelivery(input: CreateDelivery, actor: string): Promise<{ created: boolean; record: Delivery }> {
    return this.transaction(async db => {
      const existing = await db.query('SELECT id FROM cenit.asset_deliveries WHERE created_by = $1 AND operation_id = $2', [actor, input.operationId]);
      if (existing.rows[0]) return { created: false, record: (await this.delivery(db, existing.rows[0].id))! };
      const receiver = await this.person(db, input.receiverId);
      if (!receiver) throw new ApiError(422, 'VALIDATION_ERROR', 'Quien recibe no existe.');
      if (!receiver.active) throw new ApiError(422, 'VALIDATION_ERROR', 'Quien recibe ya no pertenece a la institución. Elige a otra persona.');
      const existingIds = input.items.flatMap(item => 'assetId' in item ? [item.assetId] : []);
      if (new Set(existingIds).size !== existingIds.length) throw new ApiError(422, 'VALIDATION_ERROR', 'Un bien aparece dos veces en la entrega.');
      const locked = await this.lockAssets(db, existingIds);
      const onLoan = [...locked.values()].filter(row => row.on_loan);
      if (onLoan.length) throw new ApiError(409, 'ASSET_ON_LOAN', `${onLoan.map(row => row.code).join(', ')} está en préstamo. Registra la devolución antes de entregarlo.`);
      const id = randomUUID(), year = Number(input.deliveredOn.slice(0, 4));
      await db.query(`INSERT INTO cenit.asset_deliveries (id, operation_id, year, number, delivered_on, receiver_id, reason, destination, giver_name, giver_position, giver_unit, notes, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [id, input.operationId, year, await this.nextNumber(db, 'asset_deliveries', year), input.deliveredOn,
        input.receiverId, input.reason, input.destination, input.giverName, input.giverPosition, input.giverUnit, input.notes, actor]);
      const destination = input.destination;
      for (const [index, item] of input.items.entries()) {
        let assetId: string;
        if ('assetId' in item) {
          assetId = item.assetId;
          const current = locked.get(assetId)!;
          await db.query('UPDATE cenit.assets SET custodian_id = $2, location = coalesce($3, location), version = version + 1 WHERE id = $1', [assetId, input.receiverId, destination]);
          await this.event(db, actor, { assetId, kind: 'entrega', occurredOn: input.deliveredOn, personId: input.receiverId, deliveryId: id,
            locationFrom: destination && destination !== current.location ? current.location : null, locationTo: destination && destination !== current.location ? destination : null, note: input.reason });
        } else {
          const blank = { inventoryNumber: null, model: null, furnitureType: null, material: null, dimensions: null, area: null, systemPart: false, wallMounted: false, assembled: false, notes: null, purchaseId: null };
          assetId = await this.insertAsset(db, actor, { ...blank, ...item.newAsset, operationId: randomUUID(), location: destination ?? receiver.unit ?? 'Sin ubicación informada', custodianId: null, registeredOn: input.deliveredOn });
          await db.query('UPDATE cenit.assets SET custodian_id = $2 WHERE id = $1', [assetId, input.receiverId]);
          await this.event(db, actor, { assetId, kind: 'entrega', occurredOn: input.deliveredOn, personId: input.receiverId, deliveryId: id, note: input.reason });
        }
        await db.query('INSERT INTO cenit.asset_delivery_items (delivery_id, position, asset_id) VALUES ($1,$2,$3)', [id, index + 1, assetId]);
      }
      return { created: true, record: (await this.delivery(db, id))! };
    });
  }
  private async delivery(db: Db, id: string): Promise<Delivery | null> {
    const { rows: [row] } = await db.query(`SELECT d.*, ${folio('d')} AS folio, d.delivered_on::text AS delivered_text, u.name AS creator_name, ${personColumns('p', 'r_')}
      FROM cenit.asset_deliveries d JOIN cenit.asset_people p ON p.id = d.receiver_id JOIN cenit.accounts u ON u.id = d.created_by WHERE d.id = $1`, [id]);
    if (!row) return null;
    return { id: row.id, number: row.folio, deliveredOn: row.delivered_text, receiver: person(row, 'r_'), reason: row.reason, destination: row.destination,
      giverName: row.giver_name, giverPosition: row.giver_position, giverUnit: row.giver_unit, notes: row.notes,
      items: await this.documentItems(db, 'asset_delivery_items', 'delivery_id', id), createdAt: row.created_at.toISOString(), createdBy: row.creator_name };
  }
  async getDelivery(id: string) { return this.transaction(db => this.delivery(db, id), true); }
  async deliveries(query: DocumentListQuery): Promise<DeliveryListResponse> {
    const values: unknown[] = [];
    const parameter = (value: unknown) => { values.push(value); return `$${values.length}`; };
    const predicates = words(query.q).map(word => `cenit.normalize_purchase_search(${folio('d')} || ' ' || p.name || ' ' || coalesce(p.unit, '') || ' ' || d.reason || ' ' ||
      coalesce((SELECT string_agg(a.description || ' ' || ${code('a')}, ' ') FROM cenit.asset_delivery_items i JOIN cenit.assets a ON a.id = i.asset_id WHERE i.delivery_id = d.id), '')) LIKE ${parameter(word)} ESCAPE chr(92)`);
    const where = predicates.length ? `WHERE ${predicates.join(' AND ')}` : '';
    return this.transaction(async db => {
      const { rows: [{ total }] } = await db.query(`SELECT count(*)::int AS total FROM cenit.asset_deliveries d JOIN cenit.asset_people p ON p.id = d.receiver_id ${where}`, values);
      const { rows } = await db.query(`SELECT d.id, ${folio('d')} AS folio, d.delivered_on::text AS delivered_text, d.reason, p.name, p.unit,
        (SELECT count(*)::int FROM cenit.asset_delivery_items i WHERE i.delivery_id = d.id) AS item_count,
        ARRAY(SELECT a.description FROM cenit.asset_delivery_items i JOIN cenit.assets a ON a.id = i.asset_id WHERE i.delivery_id = d.id ORDER BY i.position LIMIT 3) AS items
        FROM cenit.asset_deliveries d JOIN cenit.asset_people p ON p.id = d.receiver_id ${where}
        ORDER BY d.delivered_on DESC, d.year DESC, d.number DESC LIMIT ${parameter(query.pageSize)} OFFSET ${parameter((query.page - 1) * query.pageSize)}`, values);
      return { data: rows.map(row => ({ id: row.id, number: row.folio, deliveredOn: row.delivered_text, receiverName: row.name, receiverUnit: row.unit, reason: row.reason, itemCount: row.item_count, items: row.items })),
        pagination: { page: query.page, pageSize: query.pageSize, total } };
    }, true);
  }

  async createLoan(input: CreateLoan, actor: string): Promise<{ created: boolean; record: Loan }> {
    return this.transaction(async db => {
      const existing = await db.query('SELECT id FROM cenit.asset_loans WHERE created_by = $1 AND operation_id = $2', [actor, input.operationId]);
      if (existing.rows[0]) return { created: false, record: (await this.loan(db, existing.rows[0].id))! };
      const borrower = await this.person(db, input.borrowerId);
      if (!borrower) throw new ApiError(422, 'VALIDATION_ERROR', 'Quien recibe el préstamo no existe.');
      if (!borrower.active) throw new ApiError(422, 'VALIDATION_ERROR', 'Quien recibe ya no pertenece a la institución. Elige a otra persona.');
      if (input.dueOn && input.dueOn < input.loanedOn) throw new ApiError(422, 'VALIDATION_ERROR', 'La devolución esperada no puede ser anterior al préstamo.');
      const locked = await this.lockAssets(db, input.assetIds);
      const onLoan = [...locked.values()].filter(row => row.on_loan);
      if (onLoan.length) throw new ApiError(409, 'ASSET_ON_LOAN', `${onLoan.map(row => row.code).join(', ')} ya está en préstamo.`);
      const id = randomUUID(), year = Number(input.loanedOn.slice(0, 4));
      await db.query(`INSERT INTO cenit.asset_loans (id, operation_id, year, number, loaned_on, due_on, borrower_id, location, authorizer_name, authorizer_unit, notes, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [id, input.operationId, year, await this.nextNumber(db, 'asset_loans', year), input.loanedOn, input.dueOn,
        input.borrowerId, input.location, input.authorizerName, input.authorizerUnit, input.notes, actor]);
      for (const [index, assetId] of input.assetIds.entries()) {
        await db.query('INSERT INTO cenit.asset_loan_items (loan_id, position, asset_id) VALUES ($1,$2,$3)', [id, index + 1, assetId]);
        await db.query('UPDATE cenit.assets SET version = version + 1 WHERE id = $1', [assetId]);
        await this.event(db, actor, { assetId, kind: 'prestamo', occurredOn: input.loanedOn, personId: input.borrowerId, loanId: id, locationTo: input.location, note: input.notes });
      }
      return { created: true, record: (await this.loan(db, id))! };
    });
  }
  async returnLoan(id: string, input: ReturnLoan, actor: string): Promise<Loan> {
    return this.transaction(async db => {
      const { rows: [loan] } = await db.query('SELECT loaned_on::text AS loaned_text, returned_on, borrower_id FROM cenit.asset_loans WHERE id = $1 FOR UPDATE', [id]);
      if (!loan) throw new ApiError(404, 'NOT_FOUND', 'El préstamo no existe.');
      if (loan.returned_on) throw new ApiError(409, 'ALREADY_RETURNED', 'Este préstamo ya tiene su devolución registrada.');
      if (input.returnedOn < loan.loaned_text) throw new ApiError(422, 'VALIDATION_ERROR', 'La devolución no puede ser anterior al préstamo.');
      await db.query('UPDATE cenit.asset_loans SET returned_on = $2, return_note = $3, returned_by = $4 WHERE id = $1', [id, input.returnedOn, input.note, actor]);
      const { rows: items } = await db.query('SELECT asset_id FROM cenit.asset_loan_items WHERE loan_id = $1', [id]);
      for (const { asset_id: assetId } of items) {
        await db.query('UPDATE cenit.assets SET version = version + 1 WHERE id = $1', [assetId]);
        await this.event(db, actor, { assetId, kind: 'devolucion', occurredOn: input.returnedOn, personId: loan.borrower_id, loanId: id, note: input.note });
      }
      return (await this.loan(db, id))!;
    });
  }
  private async loan(db: Db, id: string): Promise<Loan | null> {
    const { rows: [row] } = await db.query(`SELECT l.*, ${folio('l')} AS folio, l.loaned_on::text AS loaned_text, l.due_on::text AS due_text, l.returned_on::text AS returned_text,
      CASE WHEN l.returned_on IS NOT NULL THEN 'devuelto' WHEN l.due_on < ${today} THEN 'vencido' ELSE 'activo' END AS status, u.name AS creator_name, ${personColumns('p', 'b_')}
      FROM cenit.asset_loans l JOIN cenit.asset_people p ON p.id = l.borrower_id JOIN cenit.accounts u ON u.id = l.created_by WHERE l.id = $1`, [id]);
    if (!row) return null;
    return { id: row.id, number: row.folio, loanedOn: row.loaned_text, dueOn: row.due_text, borrower: person(row, 'b_'), location: row.location,
      authorizerName: row.authorizer_name, authorizerUnit: row.authorizer_unit, notes: row.notes, returnedOn: row.returned_text, returnNote: row.return_note, status: row.status,
      items: await this.documentItems(db, 'asset_loan_items', 'loan_id', id), createdAt: row.created_at.toISOString(), createdBy: row.creator_name };
  }
  async getLoan(id: string) { return this.transaction(db => this.loan(db, id), true); }
  async loans(query: DocumentListQuery): Promise<LoanListResponse> {
    const values: unknown[] = [];
    const parameter = (value: unknown) => { values.push(value); return `$${values.length}`; };
    const status = `CASE WHEN l.returned_on IS NOT NULL THEN 'devuelto' WHEN l.due_on < ${today} THEN 'vencido' ELSE 'activo' END`;
    const predicates = words(query.q).map(word => `cenit.normalize_purchase_search(${folio('l')} || ' ' || p.name || ' ' || coalesce(p.unit, '') || ' ' ||
      coalesce((SELECT string_agg(a.description || ' ' || ${code('a')} || ' ' || coalesce(a.serial_number, ''), ' ') FROM cenit.asset_loan_items i JOIN cenit.assets a ON a.id = i.asset_id WHERE i.loan_id = l.id), '')) LIKE ${parameter(word)} ESCAPE chr(92)`);
    const counted = [...predicates];
    if (query.status === 'abierto') predicates.push('l.returned_on IS NULL');
    else if (query.status && query.status !== 'all') predicates.push(`${status} = ${parameter(query.status)}`);
    const where = (list: string[]) => list.length ? `WHERE ${list.join(' AND ')}` : '';
    return this.transaction(async db => {
      const base = `FROM cenit.asset_loans l JOIN cenit.asset_people p ON p.id = l.borrower_id`;
      const countValues = values.slice(0, counted.length);
      const { rows: [counts] } = await db.query(`SELECT (count(*) FILTER (WHERE ${status} = 'activo'))::int AS activo, (count(*) FILTER (WHERE ${status} = 'vencido'))::int AS vencido,
        (count(*) FILTER (WHERE ${status} = 'devuelto'))::int AS devuelto ${base} ${where(counted)}`, countValues);
      const { rows: [{ total }] } = await db.query(`SELECT count(*)::int AS total ${base} ${where(predicates)}`, values);
      const { rows } = await db.query(`SELECT l.id, ${folio('l')} AS folio, l.loaned_on::text AS loaned_text, l.due_on::text AS due_text, l.returned_on::text AS returned_text, ${status} AS status,
        p.name, p.unit, ARRAY(SELECT json_build_object('assetId', a.id, 'code', ${code('a')}, 'description', a.description, 'brand', a.brand, 'model', a.model)
          FROM cenit.asset_loan_items i JOIN cenit.assets a ON a.id = i.asset_id WHERE i.loan_id = l.id ORDER BY i.position) AS items
        ${base} ${where(predicates)} ORDER BY (l.returned_on IS NOT NULL), l.due_on NULLS LAST, l.loaned_on DESC
        LIMIT ${parameter(query.pageSize)} OFFSET ${parameter((query.page - 1) * query.pageSize)}`, values);
      return { data: rows.map(row => ({ id: row.id, number: row.folio, loanedOn: row.loaned_text, dueOn: row.due_text, returnedOn: row.returned_text, status: row.status,
        borrowerName: row.name, borrowerUnit: row.unit, items: row.items })), pagination: { page: query.page, pageSize: query.pageSize, total }, counts };
    }, true);
  }
}
