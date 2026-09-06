/**
 * Migration script from v087 to v088
 * - Adds "article" to the `translate.page.range` enum (no data change needed).
 *   "article" only selects a narrower translation root at translation time; the
 *   persisted `main`/`all` values remain valid, so no field rewrite is required.
 *
 * IMPORTANT: All values are hardcoded inline. Migration scripts are frozen
 * snapshots - never import constants or helpers that may change.
 */
export function migrate(oldConfig: any): any {
  if (!oldConfig || typeof oldConfig !== "object") {
    return oldConfig
  }

  return oldConfig
}
