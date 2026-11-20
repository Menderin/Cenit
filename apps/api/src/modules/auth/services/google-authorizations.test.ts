import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type pg from 'pg';
import { expect, it } from 'vitest';
import { configureGoogleAuthorizations, readGoogleAuthorizationsFile } from '../../../../../../db/seeds/google-authorizations.js';

it('autoriza sólo desde un archivo regular, acotado y con el contrato vigente', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cenit-google-authorizations-'));
  const file = join(directory, 'authorizations.json');
  try {
    const entries = [{ accountId: '00000000-0000-4000-8000-000000000001', googleEmail: 'demo@cenit.invalid' }];
    writeFileSync(file, JSON.stringify(entries));
    expect(readGoogleAuthorizationsFile(file)).toEqual(entries);
    if (process.platform !== 'win32') {
      const link = join(directory, 'link.json');
      symlinkSync(file, link);
      expect(() => readGoogleAuthorizationsFile(link)).toThrow('regular');
    }
    expect(() => readGoogleAuthorizationsFile(directory)).toThrow('regular');
    writeFileSync(file, ' '.repeat(256 * 1024 + 1));
    expect(() => readGoogleAuthorizationsFile(file)).toThrow('grande');
    writeFileSync(file, '{');
    expect(() => readGoogleAuthorizationsFile(file)).toThrow();
    writeFileSync(file, JSON.stringify([{ ...entries[0], sub: 'unverified' }]));
    expect(() => readGoogleAuthorizationsFile(file)).toThrow('inválido');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it('rechaza acciones desconocidas antes de abrir una transacción', async () => {
  await expect(configureGoogleAuthorizations({} as pg.Pool, [], 'replace' as 'authorize')).rejects.toThrow('Acción');
});
