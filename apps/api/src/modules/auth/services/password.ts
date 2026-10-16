import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../../../infrastructure/errors.js';

const prefix = 'scrypt-v1$131072$8$1$';
const encoding = /^scrypt-v1\$131072\$8\$1\$([0-9a-f]{32})\$([0-9a-f]{128})$/;
// One memory-hard derivation at a time fits the VM's 512 MiB application limit.
let deriving = false;
const waiting: Array<() => void> = [];
async function derive(password: string, salt: Buffer): Promise<Buffer> {
  if (deriving) {
    if (waiting.length >= 16) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'El servicio no está disponible.');
    await new Promise<void>(resolve => waiting.push(resolve));
  } else deriving = true;
  try {
    return await new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(key)));
  } finally {
    const next = waiting.shift(); if (next) next(); else deriving = false;
  }
}
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 128) throw new Error('Contraseña de preparación fuera de límites.');
  const salt = randomBytes(16);
  return `${prefix}${salt.toString('hex')}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const match = encoding.exec(hash);
  if (!match || password.length > 128) return false;
  const result = await derive(password, Buffer.from(match[1]!, 'hex'));
  return timingSafeEqual(result, Buffer.from(match[2]!, 'hex'));
}
// Not an account credential: a fixed salt/digest used only to equalize missing-account work.
export const dummyPasswordHash = `${prefix}${'0'.repeat(32)}$${'0'.repeat(128)}`;
