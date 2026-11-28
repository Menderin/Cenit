import type { PurchaseCapabilities } from '@cenit/contracts/purchases';

export const defaultPurchaseCapabilities: PurchaseCapabilities = { sheetsSyncEnabled: false };

export function readPurchaseCapabilities(env = process.env): PurchaseCapabilities {
  const flag = (name: string) => {
    const value = env[name];
    if (value !== undefined && value !== 'true' && value !== 'false') throw new Error(`Configuración inválida: ${name}.`);
    return value === 'true';
  };
  return { sheetsSyncEnabled: flag('CENIT_PURCHASE_SHEETS_SYNC_ENABLED') };
}
