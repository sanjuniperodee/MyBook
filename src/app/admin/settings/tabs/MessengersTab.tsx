import { fromEnv, getSetting, getSettings, maskSecret } from "@/modules/workspace";
import { container } from "@/server/container";
import { RULE_DAILY_LIMIT_MAX } from "@/modules/messaging";
import { parseChatKinds } from "@/modules/notifications";
import { LifecycleChatForm } from "../whatsapp/LifecycleChatForm";
import { GowaForm } from "../whatsapp/GowaForm";
import { WhatsappCallsForm } from "../whatsapp/WhatsappCallsForm";
import { RuleSendingForm } from "../whatsapp/RuleSendingForm";
import { CatalogSettingsForm } from "../whatsapp/CatalogSettingsForm";
import { CATALOG_DOC_KEYS, WA_CATALOG, catalogLink, parseCatalogDocs, type CatalogDocKey } from "@/modules/messaging";

/** Подписи запросов каталога WhatsApp в настройках. */
const CATALOG_DOC_LABELS: Record<CatalogDocKey, string> = {
  read: "Каталог, как видит клиент",
  owner: "Каталог владельца",
  add: "Добавить товар",
  edit: "Изменить товар",
  remove: "Удалить товар",
  collections: "Коллекции владельца",
  collectionsPublic: "Коллекции, как видит клиент",
  createCollection: "Создать коллекцию",
  updateCollection: "Изменить коллекцию",
  deleteCollections: "Удалить коллекции",
};
import { recordingDays } from "@/modules/telephony";
import { WazzupForm } from "../wazzup/WazzupForm";
import { SettingsFrame } from "../frame";
import { tabAnchors } from "../tabs";
import { hook } from "./shared";

export async function MessengersTab() {
  const [apiKey, baseUrl, channelId, webhookToken, gowa, rules, lifecycleChat, catalog] = await Promise.all([
    getSetting("wazzup.apiKey"),
    getSetting("wazzup.baseUrl"),
    getSetting("wazzup.channelId"),
    getSetting("wazzup.webhookToken"),
    (async () => ({ provider: await container().messaging.whatsappProvider(), settings: await getSettings(["gowa.baseUrl", "gowa.basicAuth", "gowa.callbackUrl", "gowa.calls"]), status: await container().messaging.gowa.status() }))(),
    container().messaging.chats.ruleSendingToday(),
    getSetting("notify.whatsapp"),
    (async () => {
      const overrides = parseCatalogDocs(await getSetting("whatsapp.catalogDocs"));
      const docs = CATALOG_DOC_KEYS.map((key) => ({ key, label: CATALOG_DOC_LABELS[key], value: overrides[key] ?? "", fallback: WA_CATALOG.docs[key] }));
      return { settings: await container().messaging.catalog.settings(), products: (await container().messaging.catalog.list()).length, docs };
    })(),
  ]);
  return (
    <SettingsFrame anchors={tabAnchors("messengers")}>
      <GowaForm
        provider={gowa.provider}
        baseUrl={gowa.settings["gowa.baseUrl"]}
        authSaved={maskSecret(gowa.settings["gowa.basicAuth"])}
        status={gowa.status}
        callbackUrl={gowa.settings["gowa.callbackUrl"]}
        callbackDefault={hook("/api/integrations/gowa")}
      />
      <WhatsappCallsForm enabled={gowa.provider === "gowa" && gowa.settings["gowa.calls"] === "on"} gowa={gowa.provider === "gowa"} recordingDays={recordingDays(await getSetting("calls.recordingDays"))} />
      <CatalogSettingsForm settings={catalog.settings} products={catalog.products} gowa={gowa.provider === "gowa"} link={gowa.status.phone ? catalogLink(gowa.status.phone) : null} docs={catalog.docs} />
      <RuleSendingForm from={rules.policy.from} to={rules.policy.to} dailyLimit={rules.policy.dailyLimit} sentToday={rules.sent} max={RULE_DAILY_LIMIT_MAX} />
      <LifecycleChatForm kinds={[...parseChatKinds(lifecycleChat)]} />
      <WazzupForm
        saved={{ apiKey: maskSecret(apiKey), baseUrl, channelId }}
        env={{ apiKey: fromEnv("wazzup.apiKey"), baseUrl: fromEnv("wazzup.baseUrl"), channelId: fromEnv("wazzup.channelId") }}
        webhookUrl={webhookToken ? hook("/api/integrations/wazzup", webhookToken) : null}
      />
    </SettingsFrame>
  );
}
