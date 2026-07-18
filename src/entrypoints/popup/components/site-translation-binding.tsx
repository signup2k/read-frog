import type { TranslationMode } from "@/types/config/translate"
import { useAtomValue, useSetAtom } from "jotai"
import { useEffect, useMemo, useState } from "react"
import ProviderSelector from "@/components/llm-providers/provider-selector"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/base-ui/select"
import { Switch } from "@/components/ui/base-ui/switch"
import { TRANSLATION_MODES } from "@/types/config/translate"
import { configAtom, writeConfigAtom } from "@/utils/atoms/config"
import { i18n } from "@/utils/i18n"
import { getSelectableProvidersForCapability } from "@/utils/providers/provider-registry"
import { getActiveTabUrl } from "@/utils/utils"

const SITE_BINDING_ID_PREFIX = "personal-site-binding:"

export function SiteTranslationBinding() {
  const config = useAtomValue(configAtom)
  const setConfig = useSetAtom(writeConfigAtom)
  const [hostname, setHostname] = useState<string | null>(null)

  useEffect(() => {
    void getActiveTabUrl()
      .then((url) => {
        try {
          const parsed = url ? new URL(url) : null
          setHostname(
            parsed && ["http:", "https:"].includes(parsed.protocol) ? parsed.hostname : null,
          )
        } catch {
          setHostname(null)
        }
      })
      .catch(() => setHostname(null))
  }, [])

  const bindingId = hostname ? `${SITE_BINDING_ID_PREFIX}${hostname}` : null
  const binding = bindingId
    ? config.siteRules.userRules.find((rule) => rule.id === bindingId)
    : undefined
  const providers = useMemo(
    () => getSelectableProvidersForCapability("translate", config.providersConfig),
    [config.providersConfig],
  )

  if (!hostname || !bindingId) return null

  const updateRules = (userRules: typeof config.siteRules.userRules) =>
    setConfig({ siteRules: { ...config.siteRules, userRules } })

  const updateBinding = (patch: { providerId?: string; translationMode?: TranslationMode }) => {
    if (!binding) return
    void updateRules(
      config.siteRules.userRules.map((rule) =>
        rule.id === bindingId ? { ...rule, ...patch } : rule,
      ),
    )
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-medium">{i18n.t("options.siteRules.title")}</div>
          <div className="truncate text-xs text-muted-foreground">{hostname}</div>
        </div>
        <Switch
          checked={!!binding}
          onCheckedChange={(checked) => {
            if (checked) {
              void updateRules([
                ...config.siteRules.userRules,
                {
                  id: bindingId,
                  description: `Personal page translation settings for ${hostname}`,
                  matches: hostname,
                  providerId: config.translate.providerId,
                  translationMode: config.translate.mode,
                },
              ])
            } else {
              void updateRules(config.siteRules.userRules.filter((rule) => rule.id !== bindingId))
            }
          }}
        />
      </div>
      {binding && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
            {i18n.t("popup.providers.title")}
            <ProviderSelector
              providers={providers}
              value={binding.providerId ?? config.translate.providerId}
              onChange={(providerId) => updateBinding({ providerId })}
              triggerSize="sm"
              className="w-full"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
            {i18n.t("options.translation.translationMode.title")}
            <Select
              value={binding.translationMode ?? config.translate.mode}
              onValueChange={(translationMode: TranslationMode | null) => {
                if (translationMode) updateBinding({ translationMode })
              }}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {TRANSLATION_MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {i18n.t(`options.translation.translationMode.mode.${mode}`)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
        </div>
      )}
    </div>
  )
}
