import { readFileSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'

/**
 * drizzle-kit runs outside Next and outside tsx, so nothing has loaded
 * .env.local for us. Read it here so `pnpm db:migrate` works with no
 * inline environment variable, matching what the README tells you to run.
 * CI sets DATABASE_URL directly and never reaches the file.
 *
 * There is deliberately no fallback: a migration tool that guesses its target
 * database is a tool that will one day migrate the wrong one.
 */
function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL

  const path = new URL('../../.env.local', import.meta.url)
  let file: string
  try {
    file = readFileSync(path, 'utf8')
  } catch {
    throw new Error(
      `DATABASE_URL is not set and ${path.pathname} could not be read.\n` +
        'Run: cp .env.example .env.local  (see README "Getting started")',
    )
  }

  const match = file.match(/^DATABASE_URL=(.*)$/m)
  const value = match?.[1]?.trim()
  if (!value) {
    throw new Error(
      `DATABASE_URL is not set and no DATABASE_URL= line was found in ${path.pathname}`,
    )
  }
  return value
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl() },
  strict: true,
  verbose: true,
})
