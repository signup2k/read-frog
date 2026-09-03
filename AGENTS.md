# AGENTS.md

## Project Notes

- This is a personal-use fork of read-frog, heavily simplified (Chrome-only MV3).
- Features kept: full-page translation + video subtitle translation.
- AI providers: OpenAI-compatible endpoint only (+ DeepL/DeepLX/Google/Microsoft translate).
- No tests, no changesets, no CI. Verify changes with `pnpm type-check` and `pnpm build`.

## Config Migration Notes

- `src/utils/config/migration-scripts/` are frozen-snapshot migrations; never import
  constants/helpers that may change. Bump `CONFIG_SCHEMA_VERSION` when changing the schema.
