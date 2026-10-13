import { defineConfig } from '@playwright/test';
import auth from './playwright.auth.config.js';
export default defineConfig({ ...auth, testMatch: 'academic.spec.ts' });
