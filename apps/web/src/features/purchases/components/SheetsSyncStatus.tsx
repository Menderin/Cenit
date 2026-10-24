import { useQuery } from '@tanstack/react-query';
import { getPurchaseSheetsStatus } from '../api/purchases.js';
import { usePurchaseCapabilities } from '../model/capabilities.js';

export function SheetsSyncStatus({ purchaseId }: { purchaseId?: string }) {
  const { sheetsSyncEnabled } = usePurchaseCapabilities();
  const query = useQuery({ queryKey: ['purchases', 'sheets-sync', purchaseId ?? 'all'], queryFn: ({ signal }) => getPurchaseSheetsStatus(signal, purchaseId),
    enabled: sheetsSyncEnabled, refetchInterval: 15_000 });
  if (!sheetsSyncEnabled) return null;
  const data = query.data?.data;
  return <section className="purchase-sync" aria-label="Sincronización con Google Sheets">
    <strong>{purchaseId ? 'Copia en Google Sheets' : 'Google Sheets'}</strong>
    {query.isError ? <div role="alert"><p>{query.error.message}</p><button onClick={() => { void query.refetch(); }}>Consultar estado</button></div>
      : !data ? <p role="status">Consultando sincronización…</p> : <>
        <p role="status">{data.status === 'synced' ? data.lastSyncedAt ? 'Sincronizado' : 'No hay registros por sincronizar.' : data.status === 'error' ? 'Error de sincronización. Se reintentará automáticamente.' : 'Pendiente de sincronización. Los datos están guardados en Cenit.'}</p>
        {!purchaseId && data.pending > 0 && <p>{data.pending} {data.pending === 1 ? 'registro por sincronizar' : 'registros por sincronizar'}</p>}
        {data.lastSyncedAt && <p>Última sincronización: {new Date(data.lastSyncedAt).toLocaleString('es-CL')}</p>}
        {data.url && <a href={data.url} target="_blank" rel="noopener noreferrer">Abrir planilla</a>}
      </>}
  </section>;
}
