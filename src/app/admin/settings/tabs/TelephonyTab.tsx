import { TelephonyForm } from "../telephony/TelephonyForm";
import { SettingsFrame } from "../frame";
import { hook } from "./shared";
import { crmRead } from "@/server/v1-local-bridge-crm";

export async function TelephonyTab() {
  const { provider, providerFromEnv, zadarma, pbxToken } = await crmRead("settings.telephony", {});
  return (
    <SettingsFrame>
      <TelephonyForm
        provider={provider as "off" | "zadarma" | "pbx"}
        providerFromEnv={providerFromEnv}
        zadarma={zadarma}
        zadarmaUrl={hook("/api/integrations/zadarma")}
        pbxUrl={pbxToken ? hook("/api/integrations/pbx", pbxToken) : null}
      />
    </SettingsFrame>
  );
}
