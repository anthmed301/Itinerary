// Browser-safe barrel. Server-only modules are reached through their subpaths:
//   @tripi/shared/env       Zod-validated process env
//   @tripi/shared/db        Drizzle client
//   @tripi/shared/db/schema Drizzle tables
// biome.json enforces that restriction; see the boundaries table in the plan.
export type { CoreEnv, RealtimeEnv, WebEnv } from './env'
