import type { APIProviderTypes } from "@/types/config/provider"
import { useAtom, useSetAtom } from "jotai"
import ProviderIcon from "@/components/provider-icon"
import { useTheme } from "@/components/providers/theme-provider"
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/base-ui/dialog"
import { API_PROVIDER_TYPES } from "@/types/config/provider"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { API_PROVIDER_ITEMS } from "@/utils/constants/providers"
import { i18n } from "@/utils/i18n"
import { selectedProviderIdAtom } from "./atoms"
import { addProvider } from "./utils"

export default function AddProviderDialog({ onClose }: { onClose: () => void }) {
  const [providersConfig, setProvidersConfig] = useAtom(configFieldsAtomMap.providersConfig)
  const setSelectedProviderId = useSetAtom(selectedProviderIdAtom)

  const handleAddProvider = async (providerType: APIProviderTypes) => {
    await addProvider(providerType, providersConfig, setProvidersConfig, setSelectedProviderId)
    onClose()
  }

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto md:max-w-2xl lg:max-w-4xl xl:max-w-5xl">
      <DialogHeader>
        <DialogTitle>{i18n.t("options.apiProviders.dialog.title")}</DialogTitle>
      </DialogHeader>
      <div className="my-2.5">
        <div className="grid grid-cols-4 gap-1.5 py-2 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-11">
          {API_PROVIDER_TYPES.map((providerType) => (
            <ProviderButton
              key={providerType}
              providerType={providerType}
              handleAddProvider={handleAddProvider}
            />
          ))}
        </div>
      </div>
    </DialogContent>
  )
}

function ProviderButton({
  providerType,
  handleAddProvider,
}: {
  providerType: APIProviderTypes
  handleAddProvider: (providerType: APIProviderTypes) => void
}) {
  const { theme } = useTheme()
  return (
    <button
      type="button"
      key={providerType}
      className="relative flex h-auto flex-col items-center space-y-1.5 rounded-lg p-2 hover:bg-muted/70"
      onClick={() => handleAddProvider(providerType)}
    >
      <ProviderIcon logo={API_PROVIDER_ITEMS[providerType].logo(theme)} size="md" />
      <span className="line-clamp-2 flex w-full flex-1 items-center justify-center text-xs font-light">
        {API_PROVIDER_ITEMS[providerType].name}
      </span>
    </button>
  )
}
