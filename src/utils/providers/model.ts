import type { Config } from "@/types/config/config"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { storage } from "#imports"
import { isCustomLLMProvider } from "@/types/config/provider"
import { getLLMProvidersConfig, getProviderConfigById } from "../config/helpers"
import { CONFIG_STORAGE_KEY } from "../constants/config"
import { getProviderHeadersWithOverride } from "./headers"
import { resolveModelId } from "./model-id"

async function getLanguageModelById(providerId: string) {
  const config = await storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`)
  if (!config) {
    throw new Error("Config not found")
  }

  const LLMProvidersConfig = getLLMProvidersConfig(config.providersConfig)
  const providerConfig = getProviderConfigById(LLMProvidersConfig, providerId)
  if (!providerConfig) {
    throw new Error(`Provider ${providerId} not found`)
  }

  const headers = getProviderHeadersWithOverride(providerConfig.provider, providerConfig.headers)

  const provider = createOpenAICompatible({
    name: providerConfig.provider,
    baseURL: providerConfig.baseURL ?? "",
    supportsStructuredOutputs: true,
    ...(isCustomLLMProvider(providerConfig.provider) &&
      providerConfig.apiKey && { apiKey: providerConfig.apiKey }),
    ...(headers && { headers }),
  })

  const modelId = resolveModelId(providerConfig.model)

  if (!modelId) {
    throw new Error("Model is undefined")
  }

  return provider.languageModel(modelId)
}

export async function getModelById(providerId: string): Promise<ReturnType<
  ReturnType<typeof createOpenAICompatible>["languageModel"]
>> {
  return getLanguageModelById(providerId)
}
