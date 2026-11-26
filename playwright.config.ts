import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  // The first smoke test walks the whole HUD (several screen sizes, settings, walking): it needs more than 90 s on a software GPU.
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1600, height: 900 },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1600, height: 900 },
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
  ],
});
