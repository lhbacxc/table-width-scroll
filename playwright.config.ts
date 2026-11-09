import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const candidates = [process.env.TWS_BROWSER_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter((p): p is string => !!p);
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.ts', workers: 1,
  globalSetup: './tests/prepare.mjs',
  use: {
    viewport: { width: 1280, height: 900 },
    launchOptions: { executablePath: candidates.find(existsSync) },
  },
});
