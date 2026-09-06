import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    // Better Auth buckets rate limits on `${ip}|${path}`, and its getIP reads
    // only x-forwarded-for — falling back to ONE shared key when the header is
    // absent. Without this the whole suite shares a single bucket and throttles
    // itself nondeterministically. Review §3.4.
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.1' },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // CI exercises the production path; local keeps hot reload.
    command: process.env.CI ? 'pnpm start' : 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    cwd: '../..',
    timeout: 180_000,
  },
})
