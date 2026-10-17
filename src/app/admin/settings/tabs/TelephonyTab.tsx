import { fromEnv, getSetting, maskSecret } from "@/modules/workspace";
import { TelephonyForm } from "../telephony/TelephonyForm";
import { hook } from "./shared";

export async function TelephonyTab() {
  const [provider, zKey, zSecret, pbxToken, zPbx, zWebphone] = await Promise.all([getSetting("telephony.provider"), getSetting("zadarma.key"), getSetting("zadarma.secret"), getSetting("pbx.token"), getSetting("zadarma.pbxId"), getSetting("zadarma.webphone")]);
  return (
    <TelephonyForm
      provider={provider as "off" | "zadarma" | "pbx"}
      providerFromEnv={fromEnv("telephony.provider")}
      zadarma={{ key: maskSecret(zKey), secret: maskSecret(zSecret), keyEnv: fromEnv("zadarma.key"), secretEnv: fromEnv("zadarma.secret"), pbxId: zPbx, pbxIdEnv: fromEnv("zadarma.pbxId"), webphone: zWebphone === "on" }}
      zadarmaUrl={hook("/api/integrations/zadarma")}
      pbxUrl={pbxToken ? hook("/api/integrations/pbx", pbxToken) : null}
    />
  );
}
