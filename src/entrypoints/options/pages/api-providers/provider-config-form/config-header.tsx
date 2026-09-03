import type { APIProviderTypes } from "@/types/config/provider"
import ProviderIcon from "@/components/provider-icon"
import { useTheme } from "@/components/providers/theme-provider"
import { env } from "@/env"
import { PROVIDER_ITEMS } from "@/utils/constants/providers"

export function ConfigHeader({ providerType }: { providerType: APIProviderTypes }) {
  const tutorialUrl = getHowToConfigureURL(providerType)
  const { theme } = useTheme()
  const providerItem = PROVIDER_ITEMS[providerType]

  return (
    <div className="flex items-start justify-between">
      <a
        href={providerItem.website}
        className="flex items-center gap-2"
        target="_blank"
        rel="noreferrer"
      >
        <ProviderIcon
          logo={providerItem.logo(theme)}
          name={providerItem.name}
          size="base"
          className="group hover:cursor-pointer"
          textClassName="font-medium group-hover:text-link"
        />
      </a>
      {tutorialUrl && (
        <a
          href={tutorialUrl}
          className="text-xs text-link hover:opacity-90"
          target="_blank"
          rel="noreferrer"
        >
          How to configure
        </a>
      )}
    </div>
  )
}

function getHowToConfigureURL(providerType: APIProviderTypes): string | undefined {
  if (providerType === "openai-compatible") {
    return `${env.WXT_WEBSITE_URL}/docs/providers/openai-compatible-providers`
  }
  if (providerType === "deeplx" || providerType === "deepl") {
    return `${env.WXT_WEBSITE_URL}/docs/providers/${providerType}`
  }
  return undefined
}
