// End-to-end tests. Starts a fresh backend (temporary SQLite DB, 1-second simulation interval)
// and the Vite dev server, then drives Chromium. Run: npx playwright test
import { defineConfig, devices } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'

const isWin = process.platform === 'win32'
const python = process.env.E2E_PYTHON || (isWin ? '..\\backend\\venv\\Scripts\\python.exe' : '../backend/venv/bin/python')
const dbFile = process.env.E2E_DB || path.join(os.tmpdir(), `glucosync-e2e-${process.pid}.db`)
const API_PORT = 8001
const WEB_PORT = 5174

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: `${python} -m uvicorn main:app --port ${API_PORT}`,
      cwd: '../backend',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DATABASE_URL: `sqlite:///${dbFile.replace(/\\/g, '/')}`,
        SIMULATION_INTERVAL_SECONDS: '1',
        HIS_MOCK_FAILURE_RATE: '0',
        CORS_ORIGINS: `http://localhost:${WEB_PORT},http://127.0.0.1:${WEB_PORT}`,
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_BACKEND_URL: `http://127.0.0.1:${API_PORT}`, VITE_PORT: String(WEB_PORT) },
    },
  ],
})
