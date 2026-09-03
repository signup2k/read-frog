import type {
  AllProviderTypes,
  APIProviderTypes,
  ProviderConfig,
  ProvidersConfig,
} from "@/types/config/provider"
import type { Theme } from "@/types/config/theme"
import { camelCase } from "case-anything"
import customProviderLogo from "@/assets/providers/custom-provider.svg?url&no-inline"
import deeplxLogoDark from "@/assets/providers/deeplx-dark.svg?url&no-inline"
import deeplxLogoLight from "@/assets/providers/deeplx-light.svg?url&no-inline"
import { env } from "@/env"
import {
  API_PROVIDER_TYPES,
  NON_API_TRANSLATE_PROVIDERS,
  NON_API_TRANSLATE_PROVIDERS_MAP,
  PURE_TRANSLATE_PROVIDERS,
  TRANSLATE_PROVIDER_TYPES,
  isAPIProviderConfig,
} from "@/types/config/provider"
import { pick } from "@/types/utils"
import { i18n } from "@/utils/i18n"
import { getLobeIconsCDNUrlFn } from "../logo"

export const PROVIDER_ITEMS: Record<
  AllProviderTypes,
  { logo: (theme: Theme) => string; name: string; website: string }
> = {
  "microsoft-translate": {
    logo: getLobeIconsCDNUrlFn("microsoft-color"),
    name: NON_API_TRANSLATE_PROVIDERS_MAP["microsoft-translate"],
    website: "https://translator.microsoft.com",
  },
  "google-translate": {
    logo: getLobeIconsCDNUrlFn("google-color"),
    name: NON_API_TRANSLATE_PROVIDERS_MAP["google-translate"],
    website: "https://translate.google.com",
  },
  deeplx: {
    logo: (theme: Theme) => (theme === "light" ? deeplxLogoLight : deeplxLogoDark),
    name: "DeepLX",
    website: "https://deeplx.owo.network/",
  },
  deepl: {
    logo: (theme: Theme) => (theme === "light" ? deeplxLogoLight : deeplxLogoDark),
    name: "DeepL",
    website: "https://www.deepl.com/pro-api",
  },
  "openai-compatible": {
    logo: () => customProviderLogo,
    name: "Custom Provider",
    website: `${env.WXT_WEBSITE_URL}/docs/providers/openai-compatible-providers`,
  },
}

export const DEFAULT_PROVIDER_CONFIG = {
  "google-translate": {
    id: "google-translate-default",
    name: PROVIDER_ITEMS["google-translate"].name,
    enabled: true,
    provider: "google-translate",
  },
  "microsoft-translate": {
    id: "microsoft-translate-default",
    name: PROVIDER_ITEMS["microsoft-translate"].name,
    enabled: true,
    provider: "microsoft-translate",
  },
  deeplx: {
    id: "deeplx-default",
    name: PROVIDER_ITEMS.deeplx.name,
    enabled: true,
    provider: "deeplx",
    baseURL: "",
  },
  deepl: {
    id: "deepl-default",
    name: PROVIDER_ITEMS.deepl.name,
    enabled: true,
    provider: "deepl",
    baseURL: "https://api-free.deepl.com",
  },
  "openai-compatible": {
    id: "openai-compatible-default",
    name: PROVIDER_ITEMS["openai-compatible"].name,
    enabled: true,
    provider: "openai-compatible",
    baseURL: "https://api.example.com/v1",
    model: {
      model: "use-custom-model",
      isCustomModel: true,
      customModel: null,
    },
  },
} as const satisfies Record<AllProviderTypes, ProviderConfig>

export const PROVIDER_BASE_URL_PLACEHOLDERS: Partial<Record<APIProviderTypes, string>> = {
  deeplx: DEFAULT_PROVIDER_CONFIG.deeplx.baseURL,
  deepl: DEFAULT_PROVIDER_CONFIG.deepl.baseURL,
  "openai-compatible": DEFAULT_PROVIDER_CONFIG["openai-compatible"].baseURL,
}

export const DEFAULT_PROVIDER_CONFIG_LIST: ProvidersConfig = [
  DEFAULT_PROVIDER_CONFIG["microsoft-translate"],
  DEFAULT_PROVIDER_CONFIG["google-translate"],
  DEFAULT_PROVIDER_CONFIG["openai-compatible"],
]

/** Resolve a provider's default description in the active interface language. */
export function getDefaultProviderDescription(providerType: APIProviderTypes): string | undefined {
  const descriptionKey = camelCase(providerType)
  const description = i18n.t(
    `options.apiProviders.providers.description.${descriptionKey}` as never,
  )
  return description || undefined
}

/**
 * Build providers for a fresh config after i18n has initialized, so descriptions are
 * persisted in the same interface language as providers created from the options page.
 */
export function buildDefaultProviderConfigList(): ProvidersConfig {
  return structuredClone(DEFAULT_PROVIDER_CONFIG_LIST).map((providerConfig) => {
    if (!isAPIProviderConfig(providerConfig)) {
      return providerConfig
    }

    const description = getDefaultProviderDescription(providerConfig.provider)
    return description ? { ...providerConfig, description } : providerConfig
  })
}

export const NON_API_TRANSLATE_PROVIDER_ITEMS = pick(PROVIDER_ITEMS, NON_API_TRANSLATE_PROVIDERS)

export const TRANSLATE_PROVIDER_ITEMS = pick(PROVIDER_ITEMS, TRANSLATE_PROVIDER_TYPES)

export const PURE_TRANSLATE_PROVIDER_ITEMS = pick(
  TRANSLATE_PROVIDER_ITEMS,
  PURE_TRANSLATE_PROVIDERS,
)

export const API_PROVIDER_ITEMS = pick(PROVIDER_ITEMS, API_PROVIDER_TYPES)
