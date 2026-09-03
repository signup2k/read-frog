import { createEnv } from "@t3-oss/env-core"
import { createExtensionClientEnvSchema, resolveExtensionEnv } from "./shared"

export const env = createEnv({
  clientPrefix: "WXT_",
  client: createExtensionClientEnvSchema(),
  runtimeEnv: resolveExtensionEnv(import.meta.env),
  emptyStringAsUndefined: true,
})
