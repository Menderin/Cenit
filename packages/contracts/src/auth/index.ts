import { Type, type Static } from '@sinclair/typebox';

export const AccountRoleSchema = Type.Union([Type.Literal('docente'), Type.Literal('estudiante'), Type.Literal('administrativo')]);
export type AccountRole = Static<typeof AccountRoleSchema>;
// Same expression in the DB; deliberately no institutional domain/verification policy.
export const AccountEmailSchema = Type.String({ minLength: 3, maxLength: 254, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' });
export const LoginRequestSchema = Type.Object({
  email: AccountEmailSchema, password: Type.String({ minLength: 1, maxLength: 128 }),
}, { additionalProperties: false });
export const AccountSchema = Type.Object({
  id: Type.String({ pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }),
  email: AccountEmailSchema, name: Type.String({ minLength: 1, maxLength: 200 }), role: AccountRoleSchema,
}, { additionalProperties: false });
export const SessionResponseSchema = Type.Object({ data: Type.Object({
  account: AccountSchema,
  expiresAt: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$' }),
}, { additionalProperties: false }) }, { additionalProperties: false });
export const LogoutRequestSchema = Type.Object({}, { additionalProperties: false });
export type LoginRequest = Static<typeof LoginRequestSchema>;
export type Account = Static<typeof AccountSchema>;
export type SessionResponse = Static<typeof SessionResponseSchema>;
