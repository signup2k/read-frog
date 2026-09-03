import type { LangCodeISO6393 } from "@read-frog/definitions"
import type {
  BackgroundGenerateTextPayload,
  BackgroundGenerateTextResponse,
} from "@/types/background-generate-text"
import type { Config } from "@/types/config/config"
import type { ProviderConfig } from "@/types/config/provider"
import type {
  BatchQueueConfig,
  RequestQueueConfig,
  TranslationTextFormat,
} from "@/types/config/translate"
import type { ProxyRequest, ProxyResponse } from "@/types/proxy-fetch"
import { defineExtensionMessaging } from "@webext-core/messaging"

interface ProtocolMap {
  // navigation
  openPage: (data: { url: string; active?: boolean }) => void
  openOptionsPage: (data?: { route?: `/${string}` }) => void
  // config
  getInitialConfig: () => Config | null
  // translation state
  getEnablePageTranslationByTabId: (data: { tabId: number }) => boolean | undefined
  getEnablePageTranslationFromContentScript: () => Promise<boolean>
  tryToSetEnablePageTranslationByTabId: (data: {
    tabId: number
    enabled: boolean
  }) => void
  tryToSetEnablePageTranslationOnContentScript: (data: {
    enabled: boolean
  }) => void
  setAndNotifyPageTranslationStateChangedByManager: (data: {
    enabled: boolean
    url?: string
  }) => void
  notifyTranslationStateChanged: (data: { enabled: boolean }) => void
  ensureIframeHostContentInjected: (data: { tabId?: number }) => void
  injectCurrentIframesAfterTopFrameNodeTranslation: () => void
  reportDetectedPageLanguage: (data: {
    detectedCodeOrUnd: LangCodeISO6393 | "und"
    url: string
  }) => void
  refreshDetectedPageLanguage: () => void
  getDetectedCode: () => LangCodeISO6393
  detectedPageLanguageChanged: (data: { detectedCode: LangCodeISO6393 }) => void
  // ask host to start page translation
  askManagerToTogglePageTranslation: (data: {
    enabled: boolean
  }) => void
  // user guide
  pinStateChanged: (data: { isPinned: boolean }) => void
  getPinState: () => boolean
  returnPinState: (data: { isPinned: boolean }) => void
  // request
  enqueueTranslateRequest: (data: {
    text: string
    langConfig: Config["language"]
    providerConfig: ProviderConfig
    scheduleAt: number
    hash: string
    textFormat?: TranslationTextFormat
    webTitle?: string | null
    webDescription?: string | null
    webContent?: string | null
    webSummary?: string | null
    // Page-translation session this request belongs to; scopes the request
    // for cancelPageTranslationRequests. Absent for non-page requests
    // (input/selection translation), which are never cancellable.
    sessionId?: string
  }) => Promise<string>
  // Drain queued/in-flight page-translation requests of one session (#1881).
  // The background composes the scope as `${sender.tab.id}:${sessionId}`, so a
  // tab can only ever cancel its own requests.
  cancelPageTranslationRequests: (data: { sessionId: string }) => void
  getOrGenerateWebPageSummary: (data: {
    webTitle: string
    webContent: string
    providerConfig: ProviderConfig
  }) => Promise<string | null>
  enqueueSubtitlesTranslateRequest: (data: {
    text: string
    langConfig: Config["language"]
    providerConfig: ProviderConfig
    scheduleAt: number
    hash: string
    webTitle?: string | null
    webDescription?: string | null
    summary?: string | null
  }) => Promise<string>
  getSubtitlesSummary: (data: {
    videoTitle: string
    subtitlesContext: string
    providerConfig: ProviderConfig
  }) => Promise<string | null>
  backgroundGenerateText: (
    data: BackgroundGenerateTextPayload,
  ) => Promise<BackgroundGenerateTextResponse>
  // AI subtitle segmentation
  aiSegmentSubtitles: (data: { jsonContent: string; providerId: string }) => Promise<string>
  setTranslateRequestQueueConfig: (data: Partial<RequestQueueConfig>) => void
  setTranslateBatchQueueConfig: (data: Partial<BatchQueueConfig>) => void
  // Subtitle-specific queue config messages
  setSubtitlesRequestQueueConfig: (data: Partial<RequestQueueConfig>) => void
  setSubtitlesBatchQueueConfig: (data: Partial<BatchQueueConfig>) => void
  // microsoft batch translation
  microsoftBatchTranslate: (data: {
    texts: string[]
    fromLang: string
    toLang: string
  }) => Promise<string[]>
  // network proxy
  backgroundFetch: (data: ProxyRequest) => Promise<ProxyResponse>
  // cache management
  clearAllTranslationRelatedCache: () => Promise<void>
  clearAiSegmentationCache: () => Promise<void>
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>()
