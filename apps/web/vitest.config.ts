import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Next resolves "@/..." from tsconfig paths; vitest needs telling separately,
    // or any test touching an aliased module fails with "Cannot find package".
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // Playwright owns tests/e2e. Without this, vitest collects those .spec.ts
    // files, fails to run Playwright's `test()` outside its own runner, and
    // `pnpm test` goes red for reasons that have nothing to do with unit tests.
    include: ['src/**/*.test.{ts,tsx}'],
    // The env contract is enforced at import time, so a unit test touching
    // anything that builds a DB client needs values. The postgres driver does
    // not connect until a query runs, so this never reaches a real database.
    env: {
      APP_STAGE: 'local',
      DATABASE_URL: 'postgresql://tripi:tripi@localhost:5433/tripi_unit_tests_never_connect',
    },
  },
})
