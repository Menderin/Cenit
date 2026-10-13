import { afterEach, expect, it, vi } from 'vitest';
import { getPlan, getPlans, getStudents, getProgress, retryAcademicRead } from './academic.js';
import { HttpError } from '../../../shared/lib/http.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('rechaza JSON o catálogo incompleto en vez de presentarlo como éxito', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { courses: [] } }))));
  await expect(getPlan('nutricion-dietetica', '2027-r1')).rejects.toMatchObject({ status: 502 });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>error</html>')));
  await expect(getPlans()).rejects.toMatchObject({ status: 502 });
});

it('una lista vacía válida es distinta de una respuesta inválida', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }))));
  await expect(getPlans()).resolves.toEqual([]);
});

it('búsqueda e historial validan los contratos y consultan identidad propia en el servidor', async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ data: [] }))));
  vi.stubGlobal('fetch', fetch);
  await expect(getStudents({ page: 1, pageSize: 20, name: 'Camila & Demo', rut: '00.000.002-0' })).rejects.toMatchObject({ status: 502 });
  expect(fetch.mock.calls[0]![0]).toBe('/api/v1/academic/students?page=1&pageSize=20&name=Camila+%26+Demo&rut=00.000.002-0');
  await expect(getProgress(null)).rejects.toMatchObject({ status: 502 });
  expect(fetch.mock.calls[1]![0]).toBe('/api/v1/academic/me/progress');
});

it('limita reintentos a red y 503; no reintenta permisos o contratos inválidos', () => {
  expect(retryAcademicRead(0, new HttpError(0, 'Red'))).toBe(true);
  expect(retryAcademicRead(1, new HttpError(503, 'Servicio'))).toBe(true);
  expect(retryAcademicRead(2, new HttpError(503, 'Servicio'))).toBe(false);
  for (const status of [401, 403, 404, 502]) expect(retryAcademicRead(0, new HttpError(status, 'Error'))).toBe(false);
});

it('distingue el tiempo agotado de la cancelación al abandonar una consulta', async () => {
  const timeout = new AbortController();
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
  vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
  })));
  const timed = getPlans();
  timeout.abort(new DOMException('Tiempo agotado', 'TimeoutError'));
  await expect(timed).rejects.toMatchObject({ status: 0, message: 'La consulta tardó demasiado. Intenta nuevamente.' });

  const bodyTimeout = new AbortController();
  let bodyStarted = false;
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(bodyTimeout.signal);
  vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => Promise.resolve({
    ok: true,
    json: () => {
      bodyStarted = true;
      return new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true }));
    },
  })));
  const readingBody = getPlans();
  await vi.waitFor(() => expect(bodyStarted).toBe(true));
  bodyTimeout.abort(new DOMException('Tiempo agotado', 'TimeoutError'));
  await expect(readingBody).rejects.toMatchObject({ status: 0, message: 'La consulta tardó demasiado. Intenta nuevamente.' });

  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(new AbortController().signal);
  vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
  })));
  const caller = new AbortController();
  const canceled = getPlans(caller.signal);
  caller.abort();
  await expect(canceled).rejects.toMatchObject({ name: 'AbortError' });
});
