import { RULE_DAILY_LIMIT_MAX } from "@/modules/messaging/domain/ruleSending";
import { parseChatKinds } from "@/modules/notifications/domain/lifecycle";
import { LifecycleChatForm } from "../whatsapp/LifecycleChatForm";
import { GowaForm } from "../whatsapp/GowaForm";
import { WhatsappCallsForm } from "../whatsapp/WhatsappCallsForm";
import { RuleSendingForm } from "../whatsapp/RuleSendingForm";
import { CatalogSettingsForm } from "../whatsapp/CatalogSettingsForm";
import { CATALOG_DOC_KEYS, catalogLink, parseCatalogDocs, type CatalogDocKey } from "@/modules/messaging/domain/catalog";

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
import { WazzupForm } from "../wazzup/WazzupForm";
import { SettingsFrame } from "../frame";
import { tabAnchors } from "../tabs";
import { hook } from "./shared";
import { crmRead } from "@/server/v1-local-bridge-crm";

export async function MessengersTab() {
  const { wazzup, gowa, recordingDays, rules, lifecycleChat, catalog: c } = await crmRead("settings.messengers", {});
  const overrides = parseCatalogDocs(c.docsRaw);
  const catalog = { settings: c.settings, products: c.products, docs: CATALOG_DOC_KEYS.map((key) => ({ key, label: CATALOG_DOC_LABELS[key], value: overrides[key] ?? "", fallback: c.fallbacks[key] })) };
  return (
    <SettingsFrame anchors={tabAnchors("messengers")}>
      <GowaForm
        provider={gowa.provider}
        baseUrl={gowa.baseUrl}
        authSaved={gowa.authSaved}
        status={gowa.status}
        callbackUrl={gowa.callbackUrl}
        callbackDefault={hook("/api/integrations/gowa")}
      />
      <WhatsappCallsForm enabled={gowa.provider === "gowa" && gowa.calls === "on"} gowa={gowa.provider === "gowa"} recordingDays={recordingDays} />
      <CatalogSettingsForm settings={catalog.settings} products={catalog.products} gowa={gowa.provider === "gowa"} link={gowa.status.phone ? catalogLink(gowa.status.phone) : null} docs={catalog.docs} />
      <RuleSendingForm from={rules.policy.from} to={rules.policy.to} dailyLimit={rules.policy.dailyLimit} sentToday={rules.sent} max={RULE_DAILY_LIMIT_MAX} />
      <LifecycleChatForm kinds={[...parseChatKinds(lifecycleChat)]} />
      <WazzupForm
        saved={{ apiKey: wazzup.apiKey, baseUrl: wazzup.baseUrl, channelId: wazzup.channelId }}
        env={wazzup.env}
        webhookUrl={wazzup.webhookToken ? hook("/api/integrations/wazzup", wazzup.webhookToken) : null}
      />
    </SettingsFrame>
  );
}
