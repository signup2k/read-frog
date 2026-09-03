import type { JSONValue } from "ai"

export const LLM_PROVIDER_MODELS = {
  "openai-compatible": ["use-custom-model"],
} as const

export const NON_API_TRANSLATE_PROVIDERS = ["google-translate", "microsoft-translate"] as const
export const NON_API_TRANSLATE_PROVIDERS_MAP: Record<
  (typeof NON_API_TRANSLATE_PROVIDERS)[number],
  string
> = {
  "google-translate": "Google Translate",
  "microsoft-translate": "Microsoft Translator",
}

export const PURE_TRANSLATE_PROVIDERS = [
  "google-translate",
  "microsoft-translate",
  "deeplx",
  "deepl",
] as const

/**
 * Model options configuration.
 * Flat list design: first match wins, more specific patterns should be placed first.
 * Options are matched by model name, not by provider.
 */
export const LLM_MODEL_OPTIONS: Array<{
  pattern: RegExp
  options: Record<string, JSONValue>
}> = [
  // Gemini - specific patterns first
  {
    pattern: /^gemini-3(?:\.\d+)?-.*?(?:-preview(?:-customtools)?)?$/i,
    options: { thinkingConfig: { thinkingLevel: "minimal", includeThoughts: false } },
  },
  {
    pattern: /^gemini-2\.5-/i,
    options: { thinkingConfig: { thinkingBudget: 0, includeThoughts: false } },
  },
  {
    // Default for all other Gemini models
    pattern: /^gemini-/i,
    options: { thinkingConfig: { thinkingBudget: 0, includeThoughts: false } },
  },

  // Claude - disable thinking
  {
    pattern: /^claude-/i,
    options: { thinking: { type: "disabled" } },
  },

  // OpenAI reasoning models - use the lowest supported reasoning effort
  {
    pattern: /^(?:o1|o3|o4-mini)(?:-|$)/i,
    options: { reasoningEffort: "minimal" },
  },

  // OpenAI-compatible reasoning models exposed by Groq/Cerebras and similar providers
  {
    pattern: /^(?:openai\/)?gpt-oss-(?:20|120)b$/i,
    options: { reasoningEffort: "none" },
  },

  // Volcengine Doubao Seed models - disable thinking by default.
  // Keep the version suffix optional because non-Volcengine providers may expose the same model family without it.
  {
    pattern:
      /(?:^|\/)doubao-seed-(?:code-preview|1[.-](?:6(?:-(?:flash|vision))?|8)|2[.-]0-(?:lite|mini|pro|code-preview))(?:-\d{6})?$/i,
    options: { thinking: { type: "disabled" } },
  },

  // DeepSeek reasoning models - disable thinking by default
  {
    pattern: /(?:^|\/)deepseek-(?:reasoner|v4-(?:flash|pro))$/i,
    options: { thinking: { type: "disabled" } },
  },

  // MiniMax reasoning-capable models - disable thinking/history by default.
  {
    pattern: /(?:^|\/)minimax-m(?:2(?:[.-].*)?|3)$/i,
    options: { thinking: { type: "disabled" }, reasoningHistory: "disabled" },
  },

  // Kimi K2 models - disable thinking/history by default.
  // Keep instruct variants untouched; they should not receive Moonshot's `thinking` options.
  {
    pattern: /(?:^|\/)kimi-k2(?!-instruct(?:[a-z0-9.-].*)?$)(?:[a-z0-9.-].*)?$/i,
    options: { thinking: { type: "disabled" }, reasoningHistory: "disabled" },
  },

  // Namespaced Qwen3 models - disable reasoning by default.
  // Keep this before the broad Qwen rule so OpenAI-compatible Qwen3 ids can use reasoningEffort.
  {
    pattern: /(?:^|\/)qwen\/qwen3(?!.*[/.-](?:thinking|qwq)(?:[/.-]|$))[a-z0-9.-]*$/i,
    options: { reasoningEffort: "none" },
  },

  // Qwen models - disable thinking by default.
  // Keep explicit thinking-only variants (for example `qwq-*` and `*-thinking`) untouched.
  {
    pattern: /(?:^|\/)qwen(?!-3-)(?!.*[/.-](?:thinking|qwq)(?:[/.-]|$)).*$/i,
    options: { enableThinking: false },
  },

  // GLM models - disable thinking (compatibility issues)
  {
    pattern: /(?:^|\/)GLM-/i,
    options: { thinking: { type: "disabled" } },
  },
]
