// Browser-safe barrel. Server-only modules are reached through their subpaths:
//   @tether/shared/env       Zod-validated process env
//   @tether/shared/db        Drizzle client
//   @tether/shared/db/schema Drizzle tables
// biome.json enforces that restriction; see the boundaries table in the plan.
export type { CoreEnv, RealtimeEnv, WebEnv } from './env'
export {
  MAX_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
  normalizeUsername,
  RESERVED_USERNAMES,
  type UsernameResult,
  validateUsername,
} from './username'
export { docNameForTrip, getActivities, getDays, getMeta, tripIdFromDocName } from './yjs/schema'
