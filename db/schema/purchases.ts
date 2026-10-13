import { sql } from 'drizzle-orm';
import { check, date, index, integer, numeric, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { cenit } from './academic.js';
import { accounts } from './auth.js';

export const purchaseRequests = cenit.table('purchase_requests', {
  id: uuid('id').primaryKey(), operationId: uuid('operation_id').notNull(), payloadHash: text('payload_hash').notNull(),
  requestNumber: text('request_number').notNull(), oracleId: text('oracle_id'), sender: text('sender'), recipient: text('recipient'),
  requestNumberSearch: text('request_number_search').generatedAlwaysAs(sql`cenit.normalize_purchase_search(request_number)`),
  descriptionSearch: text('description_search').generatedAlwaysAs(sql`cenit.normalize_purchase_search(description)`),
  sentDate: date('sent_date').notNull(), sentTime: text('sent_time'), description: text('description').notNull(),
  totalAmount: numeric('total_amount', { precision: 255, scale: 0 }).notNull(), taxAmount: numeric('tax_amount', { precision: 255, scale: 0 }), attachmentReference: text('attachment_reference'),
  document: text('document'), documentType: text('document_type'), bi: text('bi'), rut: text('rut'), unitName: text('unit_name'), item: text('item'), paymentSituation: text('payment_situation'),
  source: text('source').notNull().default('manual'), exampleId: text('example_id'), reviewStatus: text('review_status').notNull().default('pending'), version: integer('version').notNull().default(1),
  createdBy: uuid('created_by').notNull().references(() => accounts.id), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedBy: uuid('reviewed_by').references(() => accounts.id), reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
}, t => [unique('purchase_operation').on(t.createdBy, t.operationId), index('purchase_list').on(t.reviewStatus, t.sentDate, t.id),
  check('purchase_source', sql`(${t.source} = 'manual' AND ${t.exampleId} IS NULL) OR (${t.source} = 'contract_example' AND ${t.exampleId} IS NOT NULL AND ${t.exampleId} IN ('recovered', 'partial', 'ambiguous'))`), check('purchase_version', sql`${t.version} > 0`),
  check('purchase_hash', sql`${t.payloadHash} ~ '^[0-9a-f]{64}$'`),
  check('purchase_review', sql`(${t.reviewStatus} = 'pending' AND ${t.reviewedBy} IS NULL AND ${t.reviewedAt} IS NULL) OR (${t.reviewStatus} = 'reviewed' AND ${t.reviewedBy} IS NOT NULL AND ${t.reviewedAt} IS NOT NULL AND ${t.reviewedAt} >= ${t.createdAt})`),
  check('purchase_amounts', sql`${t.totalAmount} >= 0 AND (${t.taxAmount} IS NULL OR ${t.taxAmount} >= 0)`),
  check('purchase_finite_amounts', sql`${t.totalAmount} <> 'NaN'::numeric AND (${t.taxAmount} IS NULL OR ${t.taxAmount} <> 'NaN'::numeric)`),
  check('purchase_date', sql`${t.sentDate} BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'`),
  check('purchase_time', sql`${t.sentTime} IS NULL OR ${t.sentTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$'`),
  ...[t.requestNumber, t.oracleId, t.sender, t.recipient, t.attachmentReference, t.document, t.documentType, t.bi, t.rut, t.unitName, t.item, t.paymentSituation].map((column, i) => check(`purchase_text_${i}`, sql`${column} IS NULL OR (length(${column}) BETWEEN 1 AND 255 AND ${column} ~ '[^[:space:]]')`)),
  check('purchase_description', sql`length(${t.description}) BETWEEN 1 AND 1000 AND ${t.description} ~ '[^[:space:]]'`),
]);
export const purchaseRequestLines = cenit.table('purchase_request_lines', {
  id: uuid('id').primaryKey(), requestId: uuid('request_id').notNull().references(() => purchaseRequests.id), position: integer('position').notNull(),
  description: text('description'), provider: text('provider'), costCenter: text('cost_center'), lineUnit: text('line_unit'), quantity: text('quantity'),
  providerSearch: text('provider_search').generatedAlwaysAs(sql`cenit.normalize_purchase_search(provider)`),
  price: numeric('price', { precision: 255, scale: 0 }), amount: numeric('amount', { precision: 255, scale: 0 }), chargeAccount: text('charge_account'),
  universityCode: text('university_code'), campusCode: text('campus_code'), unitCode: text('unit_code'), projectCode: text('project_code'), accountingCode: text('accounting_code'),
}, t => [unique('purchase_line_position').on(t.requestId, t.position), check('purchase_line_range', sql`${t.position} BETWEEN 1 AND 100`),
  check('purchase_line_amounts', sql`(${t.price} IS NULL OR ${t.price} >= 0) AND (${t.amount} IS NULL OR ${t.amount} >= 0)`),
  check('purchase_line_finite_amounts', sql`(${t.price} IS NULL OR ${t.price} <> 'NaN'::numeric) AND (${t.amount} IS NULL OR ${t.amount} <> 'NaN'::numeric)`),
  check('purchase_line_description', sql`${t.description} IS NULL OR (length(${t.description}) BETWEEN 1 AND 1000 AND ${t.description} ~ '[^[:space:]]')`),
  ...[t.provider, t.costCenter, t.lineUnit, t.quantity, t.chargeAccount, t.universityCode, t.campusCode, t.unitCode, t.projectCode, t.accountingCode].map((column, i) => check(`purchase_line_text_${i}`, sql`${column} IS NULL OR (length(${column}) BETWEEN 1 AND 255 AND ${column} ~ '[^[:space:]]')`)),
]);
