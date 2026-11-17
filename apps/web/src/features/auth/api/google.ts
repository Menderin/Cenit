import { Value } from '@sinclair/typebox/value';
import type { TSchema, Static } from '@sinclair/typebox';
import { GoogleAvailabilitySchema, GoogleChallengeResponseSchema, GoogleLinkResponseSchema, SessionResponseSchema, type GooglePurpose } from '@cenit/contracts/auth';
import { api, HttpError } from '../../../shared/lib/http.js';

async function read<T extends TSchema>(path: string, schema: T, signal: AbortSignal, body?: unknown): Promise<Static<T>> {
  const response = await api(path, { signal, ...(body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) });
  const value: unknown = await response.json().catch(() => null);
  if (!Value.Check(schema, value)) throw new HttpError(0, 'El servidor devolvió una respuesta Google inválida.');
  return value;
}
export const getGoogleAvailability = async (signal: AbortSignal) => (await read('/auth/google', GoogleAvailabilitySchema, signal)).data;
export const getGoogleLink = async (signal: AbortSignal) => (await read('/auth/google/link', GoogleLinkResponseSchema, signal)).data;
export const createGoogleChallenge = async (purpose: GooglePurpose, signal: AbortSignal) => (await read('/auth/google/challenge', GoogleChallengeResponseSchema, signal, { purpose })).data;
export const linkGoogle = async (credential: string, signal: AbortSignal) => (await read('/auth/google/link', GoogleLinkResponseSchema, signal, { credential })).data;
export const signInGoogle = async (credential: string, signal: AbortSignal) => (await read('/auth/google/login', SessionResponseSchema, signal, { credential })).data;
