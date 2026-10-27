import { defineConfig } from '@playwright/test';
import auth from './playwright.auth.config.js';
export default defineConfig({ ...auth, testMatch: ['auth.spec.ts', 'academic.spec.ts', 'capture.spec.ts', 'ux.spec.ts', 'contextual-ux.spec.ts', 'purchase-summary.spec.ts', 'purchase-register.spec.ts'] });
