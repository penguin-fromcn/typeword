import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4174',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--mute-audio'] },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 960 } },
    },
  ],
  webServer: {
    command: 'npx vite --port 4174 --strictPort',
    url: 'http://localhost:4174',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
