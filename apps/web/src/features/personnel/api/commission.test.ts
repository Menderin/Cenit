import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyCommission } from '../model/commission.js';
import { requestCommissionPdf } from './commission.js';
import { HttpError } from '../../../shared/lib/http.js';

afterEach(() => vi.unstubAllGlobals());

describe('solicitud del PDF de comisión', () => {
  it('envía sólo la actividad visible y espera un PDF válido', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('%PDF-ejemplo', { headers: { 'Content-Type': 'application/pdf' } }));
    vi.stubGlobal('fetch', fetch);
    const draft = { ...emptyCommission(), activity: 'descripcion' as const, description: 'Trabajo ficticio', eventName: 'Dato oculto', categoryOther: 'Oculto' };
    const blob = await requestCommissionPdf(draft, new AbortController().signal);
    expect(await blob.text()).toBe('%PDF-ejemplo');
    const options = fetch.mock.calls[0]![1] as RequestInit;
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body as string)).toMatchObject({ description: 'Trabajo ficticio', eventName: '', categoryOther: '' });
  });
  it('conserva los errores por campo y rechaza respuestas que no son PDF', async () => {
    const body = { error: { code: 'VALIDATION_ERROR', message: 'Revisa los campos.', requestId: 'test', fields: { name: 'Texto demasiado largo.' } } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 422 })).mockResolvedValueOnce(new Response('no es PDF', { headers: { 'Content-Type': 'application/pdf' } })));
    try { await requestCommissionPdf(emptyCommission(), new AbortController().signal); throw new Error('Se esperaba un error'); }
    catch (error) { expect(error).toBeInstanceOf(HttpError); expect((error as HttpError).body).toEqual(body); }
    await expect(requestCommissionPdf(emptyCommission(), new AbortController().signal)).rejects.toThrow('El servidor no devolvió un PDF válido.');
  });
});
