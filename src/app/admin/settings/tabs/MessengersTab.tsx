import { fromEnv, getSetting, getSettings, maskSecret } from "@/modules/workspace";
import { container } from "@/server/container";
import { RULE_DAILY_LIMIT_MAX } from "@/modules/messaging";
import { GowaForm } from "../whatsapp/GowaForm";
import { RuleSendingForm } from "../whatsapp/RuleSendingForm";
import { WazzupForm } from "../wazzup/WazzupForm";
import { hook } from "./shared";

export async function MessengersTab() {
  const [apiKey, baseUrl, channelId, webhookToken, gowa, rules] = await Promise.all([
    getSetting("wazzup.apiKey"),
    getSetting("wazzup.baseUrl"),
    getSetting("wazzup.channelId"),
    getSetting("wazzup.webhookToken"),
    (async () => ({ provider: await container().messaging.whatsappProvider(), settings: await getSettings(["gowa.baseUrl", "gowa.basicAuth", "gowa.callbackUrl"]), status: await container().messaging.gowa.status() }))(),
    container().messaging.chats.ruleSendingToday(),
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
      <RuleSendingForm from={rules.policy.from} to={rules.policy.to} dailyLimit={rules.policy.dailyLimit} sentToday={rules.sent} max={RULE_DAILY_LIMIT_MAX} />
      <WazzupForm
        saved={{ apiKey: maskSecret(apiKey), baseUrl, channelId }}
        env={{ apiKey: fromEnv("wazzup.apiKey"), baseUrl: fromEnv("wazzup.baseUrl"), channelId: fromEnv("wazzup.channelId") }}
        webhookUrl={webhookToken ? hook("/api/integrations/wazzup", webhookToken) : null}
      />
    </>
  );
}
