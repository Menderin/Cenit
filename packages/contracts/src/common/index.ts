import { Type, type Static } from '@sinclair/typebox';
export const ErrorResponseSchema = Type.Object({ error: Type.Object({
  code: Type.String({ minLength: 1 }), message: Type.String({ minLength: 1 }),
  requestId: Type.String({ minLength: 1 }),
}, { additionalProperties: false }) }, { additionalProperties: false });
export type ErrorResponse = Static<typeof ErrorResponseSchema>;
