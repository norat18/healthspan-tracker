import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.js/,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:8790', viewport: { width: 1200, height: 900 } },
  webServer: { command: 'python3 -m http.server 8790 --bind 127.0.0.1 --directory public', url: 'http://127.0.0.1:8790', reuseExistingServer: true },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium' } },
    { name: 'phone', use: { browserName: 'chromium', viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
});
