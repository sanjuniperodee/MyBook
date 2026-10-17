import { fromEnv, getSetting, getSettings, maskSecret } from "@/modules/workspace";
import { container } from "@/server/container";
import { GowaForm } from "../whatsapp/GowaForm";
import { WazzupForm } from "../wazzup/WazzupForm";
import { hook } from "./shared";

export async function MessengersTab() {
  const [apiKey, baseUrl, channelId, webhookToken, gowa] = await Promise.all([
    getSetting("wazzup.apiKey"),
    getSetting("wazzup.baseUrl"),
    getSetting("wazzup.channelId"),
    getSetting("wazzup.webhookToken"),
    (async () => ({ provider: await container().messaging.whatsappProvider(), settings: await getSettings(["gowa.baseUrl", "gowa.basicAuth", "gowa.callbackUrl"]), status: await container().messaging.gowa.status() }))(),
  ]);
  return (
    <>
      <GowaForm
        provider={gowa.provider}
        baseUrl={gowa.settings["gowa.baseUrl"]}
        authSaved={maskSecret(gowa.settings["gowa.basicAuth"])}
        status={gowa.status}
        callbackUrl={gowa.settings["gowa.callbackUrl"]}
        callbackDefault={hook("/api/integrations/gowa")}
      />
      <WazzupForm
        saved={{ apiKey: maskSecret(apiKey), baseUrl, channelId }}
        env={{ apiKey: fromEnv("wazzup.apiKey"), baseUrl: fromEnv("wazzup.baseUrl"), channelId: fromEnv("wazzup.channelId") }}
        webhookUrl={webhookToken ? hook("/api/integrations/wazzup", webhookToken) : null}
      />
    </>
  );
}
