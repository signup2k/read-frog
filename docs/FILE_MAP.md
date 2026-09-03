# File Map (minimal)

The repo was stripped to a personal-use subset in 2026 (see `docs/simplification-plan-v2.md`).
Key entry points:

- `src/entrypoints/background/` — translation queues, config, context menu, iframe injection
- `src/entrypoints/host.content/` — full-page translation content script
- `src/entrypoints/subtitles.content/` + `interceptor.content/` — video subtitle translation
- `src/entrypoints/options/` — settings UI (7 pages)
- `src/entrypoints/popup/` — popup
- `src/utils/providers/` — OpenAI-compatible provider factory
- `src/utils/config/` — config schema, storage, migrations (v087)
