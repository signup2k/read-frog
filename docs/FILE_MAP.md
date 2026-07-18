# File Map

> Per-file index for AI agents. Read the relevant entry BEFORE opening a file;
> read only the line ranges the entry points to. Update entries after any
> structural change (see `$repo-map` skill).
> Last partial audit: 2026-07-18 | Files mapped: 17 of 1329

## Root configuration

### package.json (~226 lines, json, map-updated 2026-07-18)

Defines the WXT extension workspace, pnpm 11.13.1 toolchain, scripts, and dependencies.

### wxt.config.ts (~157 lines, ts, map-updated 2026-07-18)

Owns browser-extension manifest generation, permissions, content-security policy, and build-time flags.

## src/types/config

### src/types/config/config.ts (~183 lines, ts, map-updated 2026-07-18)

Purpose: owns the complete persisted extension configuration schema and cross-field provider validation.
Structure:

- `configSchema` (L107): combines all feature config and validates enabled provider assignments.
- `Config` (L207): inferred persisted config type.
  Depends on: feature provider registry, site-rule schema, feature-specific schemas.
  Gotchas: parse failure can reset callers to defaults; new fields need backward-compatible defaults or migration.

### src/types/config/site-rules.ts (~66 lines, ts, map-updated 2026-07-18)

Purpose: defines persisted per-site rules and the `siteRules` config envelope.
Structure:

- `siteRuleSchema` (L21): lenient rule schema for URL patterns, DOM selectors, thresholds, page provider/display-mode bindings, and injected CSS.
- `siteRulesConfigSchema` (L59): user rules plus disabled built-ins, backward-compatible default included.
  Gotchas: user editor, rather than schema parsing, enforces size and rule-count limits.

## src/utils/site-rules

### src/utils/site-rules/match.ts (~157 lines, ts, map-updated 2026-07-18)

Purpose: normalizes friendly site patterns and matches URLs against include/exclude patterns.
Structure: `normalizeUrlPattern` (L19), `urlMatchesPattern` (L135), `urlMatchesRule` (L148).

### src/utils/site-rules/resolve.ts (~200 lines, ts, map-updated 2026-07-18)

Purpose: merges matching built-in and user site rules into one effective rule.
Structure:

- `ResolvedSiteRule` (L10): hot-path resolved representation, including page provider/display-mode bindings.
- `resolveSiteRule` (L119): unions selector arrays and applies last-wins scalar precedence.
  Gotchas: built-ins precede user rules; invalid selectors are dropped instead of invalidating all config.

### src/utils/site-rules/effective.ts (~62 lines, ts, map-updated 2026-07-18)

Purpose: memoizes effective site-rule resolution by config object identity and URL.
Structure: `getEffectiveSiteRule` resolves bundled and user rules; `getEffectivePageTranslationConfig` safely overlays valid enabled per-site page provider/mode bindings.

## src/utils/config and atoms

### src/utils/constants/config.ts (~231 lines, ts, map-updated 2026-07-18)

Purpose: owns config storage keys, schema version, and the full default configuration.
Structure: `CONFIG_SCHEMA_VERSION` (L42), `DEFAULT_CONFIG` (L83), `buildFreshDefaultConfig` (L228).

### src/utils/constants/feature-providers.ts (~100 lines, ts, map-updated 2026-07-18)

Purpose: maps each translation feature to its configured provider path and resolves provider instances.
Structure: `FEATURE_KEYS` (L6), `FEATURE_PROVIDER_DEFS` (L19), `resolveProviderConfig` (L56), `buildFeatureProviderPatch` (L85).

### src/utils/atoms/config.ts (~180 lines, ts, map-updated 2026-07-18)

Purpose: synchronizes persisted config with Jotai UI state and serializes concurrent writes.
Structure: `configAtom` (L9), `writeConfigAtom` (L35), `configFieldsAtomMap` (L180).
Gotchas: array patches overwrite instead of merge; writes are optimistic and queued.

### src/utils/config/storage.ts (~73 lines, ts, map-updated 2026-07-18)

Purpose: validates local config reads/writes and maintains config metadata.
Structure: `getLocalConfig` (L8), `setLocalConfig` (L22), metadata variants (L31/L60).

## src/entrypoints/popup

### src/entrypoints/popup/app.tsx (~58 lines, tsx, map-updated 2026-07-18)

Purpose: composes the extension popup header, translation controls, site controls, and footer.

### src/entrypoints/popup/atoms/site-control.ts (~62 lines, ts, map-updated 2026-07-18)

Purpose: resolves and toggles current-host blacklist/whitelist membership, then reloads the tab.
Structure: `toggleSiteInPatterns` (L14) and two writable toggle atoms (L53/L58).

### src/entrypoints/popup/components/providers-field.tsx (~112 lines, tsx, map-updated 2026-07-18)

Purpose: summarizes feature providers and opens the global provider-assignment drawer.
Structure: `getSelectedProviderOptions` (L21), `ProvidersField` (L81).

### src/entrypoints/popup/components/site-translation-binding.tsx (~126 lines, tsx, map-updated 2026-07-18)

Purpose: lets the popup create/remove a hostname-level site rule and select its page Provider and display mode.
Structure: `SiteTranslationBinding` reads the active HTTP(S) tab, owns a `personal-site-binding:<hostname>` rule, and persists changes through `writeConfigAtom`.
Gotchas: bindings deliberately affect only page translation; global Provider/mode remain the fallback.

### src/entrypoints/popup/components/translation-mode-selector.tsx (~84 lines, tsx, map-updated 2026-07-18)

Purpose: toggles the global page translation display mode between bilingual and translation-only.
Structure: `TranslationModeSelector` (L36) updates `config.translate.mode`.

## src/entrypoints/host.content/translation-control

### src/entrypoints/host.content/translation-control/page-translation.ts (~1006 lines, ts, map-updated 2026-07-18)

Purpose: owns the page-translation lifecycle, DOM observation, mutation handling, and retranslation.
Structure:

- `PageTranslationManager.start` (L153): loads the effective site page config/provider/rule and begins page walking.
- mutation/retranslation paths (L830-L970): re-resolve the effective site page config after each fresh storage read.
  Depends on: config storage, provider resolution, site rules, DOM walker/translator modules.
  Gotchas: provider and mode are consumed in several asynchronous callbacks, not only at initial start.

## Unmapped

The remaining tracked files are intentionally unmapped for this task. Map a file before editing it; prioritize `src/entrypoints`, `src/utils`, and tests touched by the site-binding and personal-extension cleanup.
