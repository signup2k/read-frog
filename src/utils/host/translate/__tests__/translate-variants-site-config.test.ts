// @vitest-environment jsdom
import type { Config } from "@/types/config/config"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"

const { getLocalConfig, translateTextCore } = vi.hoisted(() => ({
  getLocalConfig: vi.fn<() => Promise<Config | null>>(),
  translateTextCore: vi
    .fn<(options: { providerConfig: { id: string } }) => Promise<string>>()
    .mockResolvedValue("translated"),
}))

vi.mock("@/utils/config/storage", () => ({ getLocalConfig }))
vi.mock("../target-language-skip", () => ({
  shouldSkipAsTargetLanguage: vi
    .fn<(...args: unknown[]) => Promise<boolean>>()
    .mockResolvedValue(false),
}))
vi.mock("../translate-text", () => ({
  MIN_LENGTH_FOR_SKIP_LLM_DETECTION: 100,
  shouldSkipByLanguage: vi.fn<(...args: unknown[]) => Promise<boolean>>().mockResolvedValue(false),
  translateTextCore,
}))
vi.mock("../translation-session", () => ({
  getPageTranslationSessionId: vi.fn<() => string | null>().mockReturnValue(null),
}))
vi.mock("../webpage-context", () => ({
  getOrCreateWebPageContext: vi.fn<(...args: unknown[]) => Promise<null>>().mockResolvedValue(null),
}))
vi.mock("../webpage-summary", () => ({
  getOrGenerateWebPageSummary: vi
    .fn<(...args: unknown[]) => Promise<null>>()
    .mockResolvedValue(null),
}))

import { translateTextForPage, translateTextForPageTitle } from "../translate-variants"

function siteBoundConfig(): Config {
  const config = structuredClone(DEFAULT_CONFIG)
  config.siteRules.userRules = [
    {
      id: "site-provider",
      matches: "localhost",
      providerId: "google-translate-default",
    },
  ]
  return config
}

describe("page translation site provider binding", () => {
  beforeEach(() => {
    getLocalConfig.mockResolvedValue(siteBoundConfig())
    translateTextCore.mockClear()
  })

  it.each([
    ["page text", () => translateTextForPage("hello")],
    ["page title", () => translateTextForPageTitle("hello")],
  ])("uses the effective site provider for %s", async (_label, translate) => {
    await translate()

    expect(translateTextCore).toHaveBeenCalledOnce()
    expect(translateTextCore.mock.calls[0][0].providerConfig.id).toBe("google-translate-default")
  })
})
