/**
 * Migration script from v086 to v087
 * - Removes the `selectionToolbar` section (selection toolbar feature removed).
 * - Removes the `tts` section (text-to-speech feature removed).
 * - Filters `providersConfig` down to supported provider types
 *   (openai-compatible / deeplx / deepl / google-translate / microsoft-translate).
 * - Falls back `translate.providerId` / `videoSubtitles.providerId` to
 *   "microsoft-translate-default" when the referenced provider no longer exists.
 *
 * IMPORTANT: All values are hardcoded inline. Migration scripts are frozen
 * snapshots - never import constants or helpers that may change.
 */

const SUPPORTED_PROVIDERS = [
  "openai-compatible",
  "deeplx",
  "deepl",
  "google-translate",
  "microsoft-translate",
]

export function migrate(oldConfig: any): any {
  if (!oldConfig || typeof oldConfig !== "object") {
    return oldConfig
  }

  const next: any = { ...oldConfig }

  delete next.selectionToolbar
  delete next.tts

  if (Array.isArray(next.providersConfig)) {
    next.providersConfig = next.providersConfig.filter((provider: any) =>
      SUPPORTED_PROVIDERS.includes(provider?.provider),
    )

    const hasMicrosoftTranslate = next.providersConfig.some(
      (provider: any) => provider.provider === "microsoft-translate",
    )
    const fallbackProviderId = hasMicrosoftTranslate
      ? "microsoft-translate-default"
      : (next.providersConfig[0]?.id ?? "")

    if (
      next.translate &&
      !next.providersConfig.some((provider: any) => provider.id === next.translate.providerId)
    ) {
      next.translate = { ...next.translate, providerId: fallbackProviderId }
    }

    if (
      next.videoSubtitles &&
      !next.providersConfig.some(
        (provider: any) => provider.id === next.videoSubtitles.providerId,
      )
    ) {
      next.videoSubtitles = { ...next.videoSubtitles, providerId: fallbackProviderId }
    }
  }

  return next
}
