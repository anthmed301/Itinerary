import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Playwright owns tests/e2e. Without this, vitest collects those .spec.ts
    // files, fails to run Playwright's `test()` outside its own runner, and
    // `pnpm test` goes red for reasons that have nothing to do with unit tests.
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
