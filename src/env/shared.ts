import { z } from "zod"

type RawEnvValue = string | boolean | undefined
export type RawExtensionEnv = Record<string, RawEnvValue>

const strictStringSchema = z.string().refine((value) => value === value.trim(), {
  message: "must not include leading or trailing whitespace",
})

const strictUrlSchema = strictStringSchema.pipe(z.url()).refine((value) => !value.endsWith("/"), {
  message: "must not end with a trailing slash",
})

export const WEBSITE_URL_DEFAULT = "https://www.readfrog.app"

export function resolveExtensionEnv(rawEnv: RawExtensionEnv) {
  return {
    ...rawEnv,
    WXT_WEBSITE_URL: rawEnv.WXT_WEBSITE_URL ?? WEBSITE_URL_DEFAULT,
  }
}

export function createExtensionClientEnvSchema() {
  return {
    WXT_WEBSITE_URL: strictUrlSchema,
  } satisfies Record<string, z.ZodType>
}
