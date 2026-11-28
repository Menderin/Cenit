import { sql } from 'drizzle-orm';
import { boolean, check, date, index, integer, numeric, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { cenit } from './academic.js';
import { accounts } from './auth.js';

// Una fila del «Registro de gastos» del cliente: los datos de la planilla y, aparte, lo que sólo muestra Oracle.
export const purchaseRequests = cenit.table('purchase_requests', {
  id: uuid('id').primaryKey(), operationId: uuid('operation_id').notNull(), payloadHash: text('payload_hash').notNull(),
  recordDate: date('record_date').notNull(), document: text('document').notNull().default('SISTEMA DE COMPRAS'),
  requestNumber: text('request_number').notNull(), provider: text('provider'), description: text('description').notNull(),
  totalAmount: numeric('total_amount', { precision: 255, scale: 0 }).notNull(), documentType: text('document_type'), bi: text('bi'),
  unitCode: text('unit_code'), projectCode: text('project_code'), accountingCode: text('accounting_code'), rut: text('rut'),
  area: text('area'), item: text('item'), paymentSituation: text('payment_situation').notNull().default('PENDIENTE'),
  oracleId: text('oracle_id'), sender: text('sender'), recipient: text('recipient'),
  sentDate: date('sent_date'), sentTime: text('sent_time'), taxAmount: numeric('tax_amount', { precision: 255, scale: 0 }), attachmentReference: text('attachment_reference'),
  requestNumberSearch: text('request_number_search').generatedAlwaysAs(sql`cenit.normalize_purchase_search(request_number)`),
  descriptionSearch: text('description_search').generatedAlwaysAs(sql`cenit.normalize_purchase_search(description)`),
  providerSearch: text('provider_search').generatedAlwaysAs(sql`cenit.normalize_purchase_search(provider)`),
  rutSearch: text('rut_search').generatedAlwaysAs(sql`replace(rut, '-', '')`),
  extractionId: uuid('extraction_id'), processorVersion: text('processor_version'), processedAt: timestamp('processed_at', { withTimezone: true }),
  source: text('source').notNull().default('manual'), exampleId: text('example_id'), version: integer('version').notNull().default(1),
  createdBy: uuid('created_by').notNull().references(() => accounts.id), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [unique('purchase_operation').on(t.createdBy, t.operationId), index('purchase_record_list').on(t.recordDate, t.id),
  index('purchase_codes').on(t.unitCode, t.projectCode),
  check('purchase_source', sql`((${t.source} = 'manual' AND ${t.exampleId} IS NULL) OR (${t.source} = 'contract_example' AND ${t.exampleId} IS NOT NULL AND ${t.exampleId} IN ('recovered', 'partial', 'ambiguous'))) AND ${t.extractionId} IS NULL AND ${t.processorVersion} IS NULL AND ${t.processedAt} IS NULL OR (${t.source} = 'image_capture' AND ${t.exampleId} IS NULL AND ${t.extractionId} IS NOT NULL AND ${t.processorVersion} IS NOT NULL AND ${t.processorVersion} ~ '^[a-zA-Z0-9._-]{1,100}$' AND ${t.processedAt} IS NOT NULL AND isfinite(${t.processedAt}))`), check('purchase_version', sql`${t.version} > 0`),
  check('purchase_hash', sql`${t.payloadHash} ~ '^[0-9a-f]{64}$'`),
  check('purchase_amounts', sql`${t.totalAmount} >= 0 AND (${t.taxAmount} IS NULL OR ${t.taxAmount} >= 0)`),
  check('purchase_finite_amounts', sql`${t.totalAmount} <> 'NaN'::numeric AND (${t.taxAmount} IS NULL OR ${t.taxAmount} <> 'NaN'::numeric)`),
  check('purchase_date', sql`${t.recordDate} BETWEEN DATE '0001-01-01' AND DATE '9999-12-31' AND (${t.sentDate} IS NULL OR ${t.sentDate} BETWEEN DATE '0001-01-01' AND DATE '9999-12-31')`),
  check('purchase_time', sql`${t.sentTime} IS NULL OR ${t.sentTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$'`),
  ...[t.requestNumber, t.oracleId, t.sender, t.recipient, t.attachmentReference, t.document, t.documentType, t.bi, t.rut, t.area, t.item, t.paymentSituation,
    t.provider, t.unitCode, t.projectCode, t.accountingCode].map((column, i) => check(`purchase_text_${i}`, sql`${column} IS NULL OR (length(${column}) BETWEEN 1 AND 255 AND ${column} ~ '[^[:space:]]')`)),
  check('purchase_description', sql`length(${t.description}) BETWEEN 1 AND 1000 AND ${t.description} ~ '[^[:space:]]'`),
]);
export const purchaseRequestLines = cenit.table('purchase_request_lines', {
  id: uuid('id').primaryKey(), requestId: uuid('request_id').notNull().references(() => purchaseRequests.id), position: integer('position').notNull(),
  description: text('description'), provider: text('provider'), costCenter: text('cost_center'), lineUnit: text('line_unit'), quantity: text('quantity'),
  providerSearch: text('provider_search').generatedAlwaysAs(sql`cenit.normalize_purchase_search(provider)`),
  price: numeric('price', { precision: 255, scale: 0 }), amount: numeric('amount', { precision: 255, scale: 0 }), chargeAccount: text('charge_account'),
  universityCode: text('university_code'), campusCode: text('campus_code'), unitCode: text('unit_code'), projectCode: text('project_code'), accountingCode: text('accounting_code'),
}, t => [unique('purchase_line_position').on(t.requestId, t.position), index('purchase_line_project').on(t.projectCode, t.requestId), check('purchase_line_range', sql`${t.position} BETWEEN 1 AND 100`),
  check('purchase_line_amounts', sql`(${t.price} IS NULL OR ${t.price} >= 0) AND (${t.amount} IS NULL OR ${t.amount} >= 0)`),
  check('purchase_line_finite_amounts', sql`(${t.price} IS NULL OR ${t.price} <> 'NaN'::numeric) AND (${t.amount} IS NULL OR ${t.amount} <> 'NaN'::numeric)`),
  check('purchase_line_description', sql`${t.description} IS NULL OR (length(${t.description}) BETWEEN 1 AND 1000 AND ${t.description} ~ '[^[:space:]]')`),
  ...[t.provider, t.costCenter, t.lineUnit, t.quantity, t.chargeAccount, t.universityCode, t.campusCode, t.unitCode, t.projectCode, t.accountingCode].map((column, i) => check(`purchase_line_text_${i}`, sql`${column} IS NULL OR (length(${column}) BETWEEN 1 AND 255 AND ${column} ~ '[^[:space:]]')`)),
]);

// No FK: a deleted purchase still needs to be removed from its Sheets copy.
export const purchaseSheetsOutbox = cenit.table('purchase_sheets_outbox', {
  purchaseId: uuid('purchase_id').primaryKey(), generation: integer('generation').notNull().default(1),
}, t => [check('purchase_sheets_generation', sql`${t.generation} > 0`)]);

export const purchaseSheetsDelivery = cenit.table('purchase_sheets_delivery', {
  spreadsheetId: text('spreadsheet_id').notNull(), purchaseId: uuid('purchase_id').notNull(),
  headerRow: integer('header_row'), itemRows: integer('item_rows').array().notNull().default(sql`'{}'::integer[]`),
  syncedGeneration: integer('synced_generation').notNull().default(0), attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }), lastError: text('last_error'),
}, t => [primaryKey({ columns: [t.spreadsheetId, t.purchaseId] }), unique('purchase_sheets_header_row').on(t.spreadsheetId, t.headerRow),
  check('purchase_sheets_delivery_values', sql`${t.syncedGeneration} >= 0 AND ${t.attempts} >= 0 AND (${t.headerRow} IS NULL OR ${t.headerRow} >= 2)`),
]);

// Catálogos oficiales de Finanzas UCN (plan de unidades, plan de cuentas de unidades operacionales y proyectos de FAMED).
// Sólo dan nombre a los códigos guardados en cada compra: las compras conservan el código tal como venía, esté o no en el catálogo.
export const purchaseCatalogUnits = cenit.table('purchase_catalog_units', {
  code: text('code').primaryKey(), name: text('name').notNull(), classification: text('classification').notNull(),
}, t => [check('purchase_catalog_unit_code', sql`${t.code} ~ '^[0-9]{6}$'`), check('purchase_catalog_unit_class', sql`${t.classification} IN ('ADM', 'OP', 'mixta')`),
  check('purchase_catalog_unit_name', sql`length(${t.name}) BETWEEN 1 AND 255`)]);

// «vigente» corresponde al plan desde diciembre de 2024; «anterior» conserva los códigos reemplazados y a cuál pasaron.
export const purchaseCatalogAccounts = cenit.table('purchase_catalog_accounts', {
  code: text('code').primaryKey(), name: text('name').notNull(), isGroup: boolean('is_group').notNull(), groupCode: text('group_code'),
  plan: text('plan').notNull(), replacedBy: text('replaced_by'),
}, t => [check('purchase_catalog_account_code', sql`${t.code} ~ '^[0-9]{6}$' AND (${t.groupCode} IS NULL OR ${t.groupCode} ~ '^[0-9]{6}$')`),
  check('purchase_catalog_account_name', sql`length(${t.name}) BETWEEN 1 AND 255`),
  check('purchase_catalog_account_plan', sql`(${t.plan} = 'vigente' AND ${t.replacedBy} IS NULL) OR (${t.plan} = 'anterior' AND ${t.replacedBy} ~ '^[0-9]{6}$')`)]);

export const purchaseCatalogProjects = cenit.table('purchase_catalog_projects', {
  unitCode: text('unit_code').notNull().references(() => purchaseCatalogUnits.code), code: text('code').notNull(), name: text('name').notNull(),
}, t => [primaryKey({ columns: [t.unitCode, t.code] }), index('purchase_catalog_project_code').on(t.code),
  check('purchase_catalog_project_code_format', sql`${t.code} ~ '^[0-9]{8}$'`), check('purchase_catalog_project_name', sql`length(${t.name}) BETWEEN 1 AND 255`)]);
