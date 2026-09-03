import type { APIProviderConfig } from "@/types/config/provider"
import { Icon } from "@iconify/react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { useEffect, useRef, useState } from "react"
import ProviderIcon from "@/components/provider-icon"
import { useTheme } from "@/components/providers/theme-provider"
import { SortableList } from "@/components/sortable-list"
import { Badge } from "@/components/ui/base-ui/badge"
import { Button } from "@/components/ui/base-ui/button"
import { Dialog, DialogTrigger } from "@/components/ui/base-ui/dialog"
import { Switch } from "@/components/ui/base-ui/switch"
import { anchoredToastManager } from "@/components/ui/base-ui/toast"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/base-ui/tooltip"
import { isAPIProviderConfig } from "@/types/config/provider"
import { configAtom, configFieldsAtomMap } from "@/utils/atoms/config"
import { providerConfigAtom } from "@/utils/atoms/provider"
import { getAPIProvidersConfig } from "@/utils/config/helpers"
import {
  FEATURE_KEYS,
  FEATURE_PROVIDER_DEFS,
  getFeatureLabelI18nKey,
} from "@/utils/constants/feature-providers"
import { API_PROVIDER_ITEMS } from "@/utils/constants/providers"
import { i18n } from "@/utils/i18n"
import { cn } from "@/utils/styles/utils"
import { ConfigCard } from "../../components/config-card"
import { EntityEditorLayout } from "../../components/entity-editor-layout"
import { EntityListRail } from "../../components/entity-list-rail"
import AddProviderDialog from "./add-provider-dialog"
import { selectedProviderIdAtom } from "./atoms"
import { ProviderConfigForm } from "./provider-config-form"

export function ProvidersConfig() {
  const selectedProviderId = useAtomValue(selectedProviderIdAtom)
  const editor = <ProviderConfigForm key={selectedProviderId} />

  return (
    <ConfigCard
      id="api-providers"
      title={i18n.t("options.apiProviders.title")}
      description={i18n.t("options.apiProviders.description")}
      className="lg:flex-col"
    >
      <EntityEditorLayout list={<ProviderCardList />} editor={editor} />
    </ConfigCard>
  )
}

function ProviderCardList() {
  const [providersConfig, setProvidersConfig] = useAtom(configFieldsAtomMap.providersConfig)
  const apiProvidersConfig = getAPIProvidersConfig(providersConfig)
  const [selectedProviderId, setSelectedProviderId] = useAtom(selectedProviderIdAtom)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const didLockInitialSelectionRef = useRef(false)

  const handleReorder = (newList: APIProviderConfig[]) => {
    const desiredOrderIds = newList.map((provider) => provider.id)
    const desiredOrderIdSet = new Set(desiredOrderIds)

    const nonApiProviders = providersConfig.filter((provider) => !isAPIProviderConfig(provider))
    const currentApiProviders = providersConfig.filter(isAPIProviderConfig)

    const apiProvidersById = new Map(
      currentApiProviders.map((provider) => [provider.id, provider] as const),
    )

    const reorderedApiProviders: APIProviderConfig[] = []
    for (const id of desiredOrderIds) {
      const provider = apiProvidersById.get(id)
      if (provider) reorderedApiProviders.push(provider)
    }

    // Preserve any API providers that appeared while dragging (e.g. config sync)
    for (const provider of currentApiProviders) {
      if (!desiredOrderIdSet.has(provider.id)) {
        reorderedApiProviders.push(provider)
      }
    }

    void setProvidersConfig([...nonApiProviders, ...reorderedApiProviders])
  }

  useEffect(() => {
    if (didLockInitialSelectionRef.current) return
    if (selectedProviderId) {
      setSelectedProviderId(selectedProviderId)
      didLockInitialSelectionRef.current = true
    }
  }, [selectedProviderId, setSelectedProviderId])

  return (
    <div className="flex flex-col gap-4">
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogTrigger
          render={
            <Button
              variant="outline"
              className="h-auto rounded-xl border-dashed p-3"
              onClick={() => setIsAddDialogOpen(true)}
            />
          }
        >
          <div className="flex w-full items-center justify-center gap-2">
            <Icon icon="tabler:plus" className="size-4" />
            <span className="text-sm">{i18n.t("options.apiProviders.addProvider")}</span>
          </div>
        </DialogTrigger>
        <AddProviderDialog onClose={() => setIsAddDialogOpen(false)} />
      </Dialog>
      <EntityListRail>
        <SortableList
          list={apiProvidersConfig}
          setList={handleReorder}
          className="flex flex-col gap-4 pt-2"
          renderItem={(providerConfig) => <ProviderCard providerConfig={providerConfig} />}
        />
      </EntityListRail>
    </div>
  )
}

function ProviderCard({ providerConfig }: { providerConfig: APIProviderConfig }) {
  const { id, name, provider, enabled } = providerConfig
  const { theme } = useTheme()
  const [selectedProviderId, setSelectedProviderId] = useAtom(selectedProviderIdAtom)
  const setProviderConfig = useSetAtom(providerConfigAtom(id))
  const config = useAtomValue(configAtom)
  const switchRef = useRef<HTMLButtonElement>(null)

  const assignedFeatures = FEATURE_KEYS.filter(
    (key) => FEATURE_PROVIDER_DEFS[key].getProviderId(config) === id,
  )
  const isLanguageDetectionProvider =
    config.languageDetection.mode === "llm" && config.languageDetection.providerId === id
  const totalAssigned = assignedFeatures.length + (isLanguageDetectionProvider ? 1 : 0)

  const handleProviderEnabledChange = (checked: boolean) => {
    if (!checked && enabled && totalAssigned > 0) {
      if (!switchRef.current) return

      anchoredToastManager.add({
        id: `provider-disable-${id}`,
        positionerProps: {
          anchor: switchRef.current,
          sideOffset: 6,
        },
        timeout: 5000,
        type: "error",
        title: i18n.t("options.apiProviders.form.providerInUseCannotDisable", [
          name,
          totalAssigned,
        ]),
      })
      return
    }

    void setProviderConfig({ ...providerConfig, enabled: checked })
  }

  return (
    <ProviderListCell
      providerId={id}
      logo={API_PROVIDER_ITEMS[provider].logo(theme)}
      name={name}
      checked={enabled}
      selected={selectedProviderId === id}
      onSelect={() => setSelectedProviderId(id)}
      onCheckedChange={handleProviderEnabledChange}
      switchRef={switchRef}
      badges={
        <>
          <FeatureCountBadge count={totalAssigned}>
            {assignedFeatures.map((key) => (
              <li key={key}>{i18n.t(getFeatureLabelI18nKey(key))}</li>
            ))}
            {isLanguageDetectionProvider && (
              <li>{i18n.t("options.general.languageDetection.title")}</li>
            )}
          </FeatureCountBadge>
        </>
      }
    />
  )
}

function FeatureCountBadge({ count, children }: { count: number; children: React.ReactNode }) {
  if (count === 0) {
    return null
  }

  return (
    <div className="absolute -top-2 right-2 flex items-center justify-center gap-1">
      <Tooltip>
        <TooltipTrigger render={<Badge className="cursor-default bg-blue-500" size="sm" />}>
          {i18n.t("options.apiProviders.badges.featureCount", [count])}
        </TooltipTrigger>
        <TooltipContent>
          <ul className="list-inside list-disc marker:text-green-500">{children}</ul>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

interface ProviderListCellProps {
  providerId: string
  logo: string
  name: string
  checked: boolean
  selected: boolean
  disabled?: boolean
  badges?: React.ReactNode
  onSelect: () => void
  onCheckedChange?: (checked: boolean) => void
  switchRef?: React.Ref<HTMLButtonElement>
}

function ProviderListCell({
  providerId,
  logo,
  name,
  checked,
  selected,
  disabled,
  badges,
  onSelect,
  onCheckedChange,
  switchRef,
}: ProviderListCellProps) {
  return (
    <div
      data-provider-id={providerId}
      className={cn(
        "relative cursor-pointer rounded-xl border bg-card p-3",
        selected && "border-primary",
      )}
      onClick={onSelect}
    >
      {badges}
      <div className="flex items-center justify-between gap-2">
        <ProviderIcon logo={logo} name={name} size="base" textClassName="text-sm" />
        <Switch
          ref={switchRef}
          aria-label={name}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  )
}
