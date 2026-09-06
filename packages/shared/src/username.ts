/**
 * Username rules, shared by the signup form and the server.
 *
 * Pure — no env, no database. This module is exported from the browser-safe
 * barrel, so it must never import from ./env or ./db.
 *
 * Phase 6 turns usernames into `/:username` profile URLs, which is why the
 * charset is conservative and the reserved list exists.
 */

export const MIN_USERNAME_LENGTH = 3
export const MAX_USERNAME_LENGTH = 32

/** Words that would shadow a route or impersonate the product. Lowercase. */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin',
  'administrator',
  'api',
  'auth',
  'login',
  'logout',
  'signup',
  'signin',
  'settings',
  'profile',
  'me',
  'you',
  'explore',
  'trip',
  'trips',
  'new',
  'edit',
  'help',
  'support',
  'about',
  'terms',
  'privacy',
  'security',
  'billing',
  'tripi',
  'official',
  'staff',
  'system',
  'root',
  'null',
  'undefined',
  'static',
  'assets',
  'public',
  'health',
  'status',
])

/** Trim and lowercase. The canonical form used for uniqueness. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase()
}

export type UsernameResult =
  | { ok: true; username: string; usernameLower: string }
  | { ok: false; reason: string }

/**
 * Validates a username and returns both the display form (as typed, trimmed)
 * and the canonical lowercase form that carries the unique index.
 */
export function validateUsername(raw: string): UsernameResult {
  const username = raw.trim()
  const usernameLower = normalizeUsername(raw)

  if (usernameLower.length < MIN_USERNAME_LENGTH) {
    return { ok: false, reason: `Must be at least ${MIN_USERNAME_LENGTH} characters.` }
  }
  if (usernameLower.length > MAX_USERNAME_LENGTH) {
    return { ok: false, reason: `Must be at most ${MAX_USERNAME_LENGTH} characters.` }
  }
  if (!/^[a-z]/.test(usernameLower)) {
    return { ok: false, reason: 'Must start with a letter.' }
  }
  if (!/^[a-z0-9_]+$/.test(usernameLower)) {
    return { ok: false, reason: 'Only letters, numbers, and underscores.' }
  }
  if (usernameLower.includes('__')) {
    return { ok: false, reason: 'No consecutive underscores.' }
  }
  if (usernameLower.endsWith('_')) {
    return { ok: false, reason: 'Cannot end with an underscore.' }
  }
  if (RESERVED_USERNAMES.has(usernameLower)) {
    return { ok: false, reason: 'That name is reserved.' }
  }

  return { ok: true, username, usernameLower }
}
