import { sql } from 'drizzle-orm';
import { boolean, check, date, index, integer, primaryKey, text, timestamp, unique, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { cenit } from './academic.js';
import { accounts } from './auth.js';
import { purchaseRequests } from './purchases.js';

// Bienes: propuesta provisional pendiente de validación. Responsable y ubicación del bien
// cambian sólo mediante movimientos (entrega, cambio de ubicación), que quedan en asset_events.
const optionalText = (column: AnyPgColumn, name: string, max = 255) =>
  check(name, sql`${column} IS NULL OR (length(${column}) BETWEEN 1 AND ${sql.raw(String(max))} AND ${column} ~ '[^[:space:]]')`);
const requiredText = (column: AnyPgColumn, name: string, max = 255) =>
  check(name, sql`length(${column}) BETWEEN 1 AND ${sql.raw(String(max))} AND ${column} ~ '[^[:space:]]'`);

export const assetPeople = cenit.table('asset_people', {
  id: uuid('id').primaryKey(), name: text('name').notNull(), rut: text('rut'), unit: text('unit'), position: text('position'),
  active: boolean('active').notNull().default(true), inactiveSince: date('inactive_since'),
  createdBy: uuid('created_by').notNull().references(() => accounts.id), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [requiredText(t.name, 'asset_person_name', 200), optionalText(t.rut, 'asset_person_rut', 20), optionalText(t.unit, 'asset_person_unit'), optionalText(t.position, 'asset_person_position'),
  check('asset_person_status', sql`(${t.active} AND ${t.inactiveSince} IS NULL) OR (NOT ${t.active} AND ${t.inactiveSince} IS NOT NULL)`)]);

export const assets = cenit.table('assets', {
  id: uuid('id').primaryKey(), number: integer('number').generatedAlwaysAsIdentity().notNull().unique(),
  operationId: uuid('operation_id').notNull(), kind: text('kind').notNull(), quantity: integer('quantity').notNull().default(1),
  description: text('description').notNull(), inventoryNumber: text('inventory_number'), brand: text('brand'), model: text('model'), serialNumber: text('serial_number'),
  furnitureType: text('furniture_type'), material: text('material'), dimensions: text('dimensions'), area: text('area'),
  systemPart: boolean('system_part').notNull().default(false), wallMounted: boolean('wall_mounted').notNull().default(false), assembled: boolean('assembled').notNull().default(false),
  notes: text('notes'), location: text('location').notNull(), custodianId: uuid('custodian_id').references(() => assetPeople.id),
  purchaseId: uuid('purchase_id').references(() => purchaseRequests.id, { onDelete: 'set null' }), registeredOn: date('registered_on').notNull(),
  searchText: text('search_text').generatedAlwaysAs(sql`cenit.normalize_purchase_search(description || ' ' || coalesce(inventory_number, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(model, '') || ' ' || coalesce(serial_number, '') || ' ' || location || ' ' || coalesce(material, '') || ' ' || coalesce(furniture_type, ''))`),
  version: integer('version').notNull().default(1),
  createdBy: uuid('created_by').notNull().references(() => accounts.id), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [unique('asset_operation').on(t.createdBy, t.operationId), index('asset_custodian').on(t.custodianId),
  check('asset_kind', sql`${t.kind} IN ('equipo_computacional','equipo','mueble','maquinaria','construccion','accesorio','otro')`),
  check('asset_quantity', sql`${t.quantity} BETWEEN 1 AND 9999`), check('asset_version', sql`${t.version} > 0`),
  requiredText(t.description, 'asset_description', 500), requiredText(t.location, 'asset_location'), optionalText(t.notes, 'asset_notes', 1000),
  optionalText(t.inventoryNumber, 'asset_inventory_number', 60), optionalText(t.serialNumber, 'asset_serial_number', 120), optionalText(t.area, 'asset_area', 60),
  ...[t.brand, t.model, t.furnitureType, t.material, t.dimensions].map((column, i) => optionalText(column, `asset_text_${i}`)),
]);

export const assetDeliveries = cenit.table('asset_deliveries', {
  id: uuid('id').primaryKey(), operationId: uuid('operation_id').notNull(), year: integer('year').notNull(), number: integer('number').notNull(),
  deliveredOn: date('delivered_on').notNull(), receiverId: uuid('receiver_id').notNull().references(() => assetPeople.id),
  reason: text('reason').notNull(), destination: text('destination'), giverName: text('giver_name').notNull(), giverPosition: text('giver_position'), giverUnit: text('giver_unit'), notes: text('notes'),
  createdBy: uuid('created_by').notNull().references(() => accounts.id), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [unique('asset_delivery_operation').on(t.createdBy, t.operationId), unique('asset_delivery_number').on(t.year, t.number),
  check('asset_delivery_folio', sql`${t.number} > 0 AND ${t.year} = extract(year FROM ${t.deliveredOn})`),
  requiredText(t.reason, 'asset_delivery_reason', 500), requiredText(t.giverName, 'asset_delivery_giver', 200), optionalText(t.notes, 'asset_delivery_notes', 1000),
  ...[t.destination, t.giverPosition, t.giverUnit].map((column, i) => optionalText(column, `asset_delivery_text_${i}`)),
]);
export const assetDeliveryItems = cenit.table('asset_delivery_items', {
  deliveryId: uuid('delivery_id').notNull().references(() => assetDeliveries.id), position: integer('position').notNull(),
  assetId: uuid('asset_id').notNull().references(() => assets.id),
}, t => [primaryKey({ columns: [t.deliveryId, t.position] }), unique('asset_delivery_item').on(t.deliveryId, t.assetId), index('asset_delivery_item_asset').on(t.assetId),
  check('asset_delivery_item_position', sql`${t.position} BETWEEN 1 AND 30`)]);

export const assetLoans = cenit.table('asset_loans', {
  id: uuid('id').primaryKey(), operationId: uuid('operation_id').notNull(), year: integer('year').notNull(), number: integer('number').notNull(),
  loanedOn: date('loaned_on').notNull(), dueOn: date('due_on'), borrowerId: uuid('borrower_id').notNull().references(() => assetPeople.id),
  location: text('location'), authorizerName: text('authorizer_name').notNull(), authorizerUnit: text('authorizer_unit'), notes: text('notes'),
  returnedOn: date('returned_on'), returnNote: text('return_note'), returnedBy: uuid('returned_by').references(() => accounts.id),
  createdBy: uuid('created_by').notNull().references(() => accounts.id), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [unique('asset_loan_operation').on(t.createdBy, t.operationId), unique('asset_loan_number').on(t.year, t.number),
  check('asset_loan_folio', sql`${t.number} > 0 AND ${t.year} = extract(year FROM ${t.loanedOn})`),
  check('asset_loan_dates', sql`(${t.dueOn} IS NULL OR ${t.dueOn} >= ${t.loanedOn}) AND (${t.returnedOn} IS NULL OR ${t.returnedOn} >= ${t.loanedOn})`),
  check('asset_loan_return', sql`(${t.returnedOn} IS NULL AND ${t.returnedBy} IS NULL AND ${t.returnNote} IS NULL) OR (${t.returnedOn} IS NOT NULL AND ${t.returnedBy} IS NOT NULL)`),
  requiredText(t.authorizerName, 'asset_loan_authorizer', 200), optionalText(t.notes, 'asset_loan_notes', 1000), optionalText(t.returnNote, 'asset_loan_return_note', 500),
  ...[t.location, t.authorizerUnit].map((column, i) => optionalText(column, `asset_loan_text_${i}`)),
]);
export const assetLoanItems = cenit.table('asset_loan_items', {
  loanId: uuid('loan_id').notNull().references(() => assetLoans.id), position: integer('position').notNull(),
  assetId: uuid('asset_id').notNull().references(() => assets.id),
}, t => [primaryKey({ columns: [t.loanId, t.position] }), unique('asset_loan_item').on(t.loanId, t.assetId), index('asset_loan_item_asset').on(t.assetId),
  check('asset_loan_item_position', sql`${t.position} BETWEEN 1 AND 10`)]);

export const assetEvents = cenit.table('asset_events', {
  id: uuid('id').primaryKey(), assetId: uuid('asset_id').notNull().references(() => assets.id), kind: text('kind').notNull(), occurredOn: date('occurred_on').notNull(),
  personId: uuid('person_id').references(() => assetPeople.id), locationFrom: text('location_from'), locationTo: text('location_to'), note: text('note'),
  deliveryId: uuid('delivery_id').references(() => assetDeliveries.id), loanId: uuid('loan_id').references(() => assetLoans.id),
  createdBy: uuid('created_by').notNull().references(() => accounts.id), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('asset_event_asset').on(t.assetId, t.occurredOn),
  check('asset_event_kind', sql`${t.kind} IN ('alta','entrega','prestamo','devolucion','ubicacion','edicion')`),
  check('asset_event_links', sql`(${t.kind} = 'entrega') = (${t.deliveryId} IS NOT NULL) AND (${t.kind} IN ('prestamo','devolucion')) = (${t.loanId} IS NOT NULL)`),
  optionalText(t.note, 'asset_event_note', 1000), optionalText(t.locationFrom, 'asset_event_location_from'), optionalText(t.locationTo, 'asset_event_location_to'),
]);
