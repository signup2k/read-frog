import { Icon } from "@iconify/react"
import { useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import { toastManager } from "@/components/ui/base-ui/toast"
import { i18n } from "@/utils/i18n"
import { useSubtitlesUI } from "../../subtitles-ui-context"
import { SubtitlesSettingsItem } from "./subtitles-settings-item"

export function DownloadSourceSubtitles() {
  const [isDownloading, setIsDownloading] = useState(false)
  const { downloadSourceSubtitles } = useSubtitlesUI()
  const buttonId = "read-frog-download-source-subtitles"
  const title = i18n.t("subtitles.actions.downloadSource")

  const downloadSubtitles = async () => {
    if (isDownloading) {
      return
    }

    setIsDownloading(true)

    try {
      await downloadSourceSubtitles()
    } catch (error) {
      toastManager.add({
        type: "error",
        title: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <SubtitlesSettingsItem
      icon={<Icon icon="tabler:download" className="size-4" />}
      label={title}
      labelFor={buttonId}
    >
      <Button
        id={buttonId}
        type="button"
        variant="ghost-secondary"
        size="icon-sm"
        onClick={downloadSubtitles}
        disabled={isDownloading}
      >
        {isDownloading ? (
          <Icon icon="tabler:loader2" className="size-3.5 animate-spin" />
        ) : (
          <Icon icon="tabler:download" className="size-3.5" />
        )}
      </Button>
    </SubtitlesSettingsItem>
  )
}
