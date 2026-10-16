import { sql } from 'drizzle-orm';
import { boolean, check, index, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { cenit } from './academic.js';

export const accounts = cenit.table('accounts', {
  id: uuid('id').primaryKey(), email: text('email').notNull().unique(), name: text('name').notNull(),
  role: text('role').notNull(), active: boolean('active').notNull().default(true), passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  check('account_email', sql`length(${t.email}) BETWEEN 3 AND 254 AND ${t.email} = lower(btrim(${t.email})) AND ${t.email} ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'`),
  check('account_name', sql`length(${t.name}) BETWEEN 1 AND 200 AND length(btrim(${t.name})) > 0`),
  check('account_role', sql`${t.role} IN ('docente','estudiante','administrativo')`),
  check('account_password_hash', sql`${t.passwordHash} ~ '^scrypt-v1\\$131072\\$8\\$1\\$[0-9a-f]{32}\\$[0-9a-f]{128}$'`),
  check('account_dates', sql`${t.updatedAt} >= ${t.createdAt}`),
]);
export const sessions = cenit.table('sessions', {
  tokenHash: text('token_hash').primaryKey(), accountId: uuid('account_id').notNull().references(() => accounts.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, t => [index('session_account').on(t.accountId), index('session_expiration').on(t.expiresAt),
  check('session_hash', sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
  check('session_duration', sql`${t.expiresAt} = ${t.createdAt} + interval '2 hours'`),
  check('session_revocation', sql`${t.revokedAt} IS NULL OR ${t.revokedAt} >= ${t.createdAt}`),
]);
