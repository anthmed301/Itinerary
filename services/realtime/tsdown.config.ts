import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/server.ts'],
  format: 'esm',
  platform: 'node',
  // @tripi/shared ships TypeScript source. tsdown externalises declared
  // dependencies by default, which would leave Node to type-strip the shared
  // package at runtime and fail on its extensionless relative imports
  // (db/client.ts and yjs/schema.ts both have them).
  //
  // Must be a RegExp, not the string '@tripi/shared': a bare string matches only
  // the exact specifier and leaves subpath imports such as '@tripi/shared/env'
  // and '@tripi/shared/db' external. Verified by inspecting dist/server.mjs.
  //
  // Config-only — the CLI flags (--no-external, --deps.always-bundle) are a no-op.
  deps: { alwaysBundle: [/^@tripi\/shared(\/.*)?$/] },
})
