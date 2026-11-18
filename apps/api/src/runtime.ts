import { fileURLToPath } from 'node:url';
import { buildAcademicApp } from './app.js';
import { createPool, databaseUrl } from './infrastructure/database/connection.js';
import { createReadiness } from './infrastructure/database/readiness.js';
import { AcademicRepository } from './modules/academic/repositories/academic.js';
import { AuthRepository } from './modules/auth/repositories/auth.js';
import { AuthService } from './modules/auth/services/auth.js';
import { GoogleRepository } from './modules/auth/repositories/google.js';
import { GoogleService, googleTokenVerifier, readGoogleConfig } from './modules/auth/services/google.js';
import { readAuthConfig } from './modules/auth/routes/index.js';
import { PurchaseRepository } from './modules/purchases/repositories/purchases.js';
import { ExtractionService, httpExtractionProcessor } from './modules/purchases/services/extractions.js';
import { readPurchaseCapabilities } from './modules/purchases/services/config.js';
import { PurchaseSheetsRepository } from './modules/purchases/repositories/sheets.js';
import { createGoogleSheetsWriter, readSheetsTarget, startSheetsSync } from './modules/purchases/services/sheets.js';
import { AssetRepository } from './modules/assets/repositories/assets.js';
import { readCaptureReceipts } from './modules/purchases/services/capture-receipts.js';

export function createRuntimeApp() {
  const config = readAuthConfig();
  const captureReceipts = readCaptureReceipts();
  const extraction = new ExtractionService(process.env.OCR_URL ? httpExtractionProcessor(process.env.OCR_URL) : undefined, captureReceipts);
  const purchaseCapabilities = readPurchaseCapabilities();
  const target = purchaseCapabilities.sheetsSyncEnabled ? readSheetsTarget() : undefined;
  const writer = target ? createGoogleSheetsWriter(target.spreadsheetId, target.keyFile, purchaseCapabilities.secondReviewEnabled) : undefined;
  const pool = createPool();
  const auth = new AuthService(new AuthRepository(pool));
  const googleConfig = readGoogleConfig();
  const google = new GoogleService(googleConfig, new GoogleRepository(pool), auth, googleConfig.enabled ? googleTokenVerifier(googleConfig.clientId) : undefined);
  const purchases = new PurchaseRepository(pool);
  const sheets = target ? { repository: new PurchaseSheetsRepository(pool, purchases), spreadsheetId: target.spreadsheetId } : undefined;
  const readiness = createReadiness(databaseUrl(), fileURLToPath(new URL('../../../db/migrations/', import.meta.url)));
  const app = buildAcademicApp({ extraction, captureReceipts, repository: new AcademicRepository(pool), purchases, assets: new AssetRepository(pool), purchaseCapabilities, sheets, frontendRoot: process.env.NODE_ENV === 'production' ? fileURLToPath(new URL('../../web/dist/', import.meta.url)) : undefined, auth: { service: auth, google, config } });
  if (sheets && writer) {
    let stop: (() => Promise<void>) | undefined;
    app.addHook('onReady', async () => { stop = startSheetsSync(sheets.repository, sheets.spreadsheetId, writer); });
    app.addHook('preClose', async () => { await stop?.(); });
  }
  app.addHook('onClose', async () => { await Promise.all([pool.end(), readiness.close()]); });
  app.get('/health/live', () => ({ status: 'live' }));
  app.get('/health/ready', async (_request, reply) => {
    const ready = await readiness.check();
    return reply.status(ready ? 200 : 503).send({ status: ready ? 'ready' : 'unavailable' });
  });
  return app;
}
