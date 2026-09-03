import type { APIProviderConfig } from "@/types/config/provider"
import { useSelector } from "@tanstack/react-store"
import { PROVIDER_BASE_URL_PLACEHOLDERS } from "@/utils/constants/providers"
import { i18n } from "@/utils/i18n"
import { withForm } from "./form"

export const BaseURLField = withForm({
  ...{ defaultValues: {} as APIProviderConfig },
  render: function Render({ form }) {
    const providerConfig = useSelector(form.store, (state) => state.values)
    const providerType = providerConfig.provider

    if (providerType === "deepl") {
      return null
    }

    const isOptionalBaseURL = providerType === "openai-compatible"
    const labelText = `${i18n.t("options.apiProviders.form.fields.baseURL")}${
      isOptionalBaseURL ? ` (${i18n.t("options.apiProviders.form.fields.optional")})` : ""
    }`

    return (
      <form.AppField name="baseURL">
        {(field) => (
          <field.InputFieldAutoSave
            formForSubmit={form}
            label={labelText}
            placeholder={PROVIDER_BASE_URL_PLACEHOLDERS[providerType]}
          />
        )}
      </form.AppField>
    )
  },
})
