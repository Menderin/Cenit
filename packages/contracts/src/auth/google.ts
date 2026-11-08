import { Type, type Static } from '@sinclair/typebox';

const strict = { additionalProperties: false };
export const GooglePurposeSchema = Type.Union([Type.Literal('login'), Type.Literal('link')]);
export const GoogleAvailabilitySchema = Type.Object({ data: Type.Union([
  Type.Object({ enabled: Type.Literal(false), clientId: Type.Null() }, strict),
  Type.Object({ enabled: Type.Literal(true), clientId: Type.String({ minLength: 1, maxLength: 255 }) }, strict),
]) }, strict);
export const GoogleChallengeRequestSchema = Type.Object({ purpose: GooglePurposeSchema }, strict);
export const GoogleChallengeResponseSchema = Type.Object({ data: Type.Object({
  nonce: Type.String({ pattern: '^[0-9a-f]{64}$' }),
  expiresAt: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$' }),
}, strict) }, strict);
export const GoogleCredentialRequestSchema = Type.Object({
  credential: Type.String({ minLength: 1, maxLength: 16384 }),
}, strict);
export const GoogleLinkResponseSchema = Type.Object({ data: Type.Object({ linked: Type.Boolean() }, strict) }, strict);
export type GooglePurpose = Static<typeof GooglePurposeSchema>;
export type GoogleCredentialRequest = Static<typeof GoogleCredentialRequestSchema>;
