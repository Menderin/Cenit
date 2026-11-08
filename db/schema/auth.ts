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
  authenticationMethod: text('authentication_method').notNull().default('local'),
}, t => [index('session_account').on(t.accountId), index('session_expiration').on(t.expiresAt),
  check('session_hash', sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
  check('session_duration', sql`${t.expiresAt} = ${t.createdAt} + interval '2 hours'`),
  check('session_revocation', sql`${t.revokedAt} IS NULL OR ${t.revokedAt} >= ${t.createdAt}`),
  check('session_authentication_method', sql`${t.authenticationMethod} IN ('local','google')`),
]);

export const googleAuthorizations = cenit.table('google_authorizations', {
  accountId: uuid('account_id').primaryKey().references(() => accounts.id),
  email: text('email').notNull().unique(),
}, t => [check('google_authorization_email', sql`length(${t.email}) BETWEEN 3 AND 254 AND ${t.email} = lower(btrim(${t.email})) AND ${t.email} ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'`)]);
export const googleIdentities = cenit.table('google_identities', {
  accountId: uuid('account_id').primaryKey().references(() => accounts.id),
  subject: text('subject').notNull().unique(),
  linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [check('google_identity_subject', sql`${t.subject} ~ '^[A-Za-z0-9_-]{1,255}$'`)]);
export const googleChallenges = cenit.table('google_challenges', {
  tokenHash: text('token_hash').primaryKey(), nonceHash: text('nonce_hash').notNull(), purpose: text('purpose').notNull(),
  accountId: uuid('account_id').references(() => accounts.id), sessionHash: text('session_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, t => [index('google_challenge_expiration').on(t.expiresAt),
  check('google_challenge_hashes', sql`${t.tokenHash} ~ '^[0-9a-f]{64}$' AND ${t.nonceHash} ~ '^[0-9a-f]{64}$' AND (${t.sessionHash} IS NULL OR ${t.sessionHash} ~ '^[0-9a-f]{64}$')`),
  check('google_challenge_purpose', sql`(${t.purpose} = 'login' AND ${t.accountId} IS NULL) OR (${t.purpose} = 'link' AND ${t.accountId} IS NOT NULL AND ${t.sessionHash} IS NOT NULL)`),
  check('google_challenge_duration', sql`${t.expiresAt} = ${t.createdAt} + interval '5 minutes'`),
]);
