import "server-only";
import { z } from "zod";
import { container } from "@/server/container";
import { op } from "./op";

/**
 * Вкладки «Настроек» CRM (ADR 0012, A5 — Раздел 5): сохранённые значения, секреты — только маской, и какие поля заданы
 * переменными окружения сервера (сайт без БД их не знает). Права — как у страницы настроек (settings.manage).
 */
const none = z.object({}).strict();
const guard = ["settings.manage"] as const;
const workspace = () => import("@/modules/workspace");

const ROUTE_KEYS = [
  "seller.route",
  "seller.route.default",
  "seller.route.haiku",
  "seller.route.sonnet",
  "seller.route.opus",
  "seller.fallbacks",
  "seller.route.sonnetAt",
  "seller.route.opusAt",
  "seller.route.maxExtra",
  "seller.route.budget",
  "seller.route.dailyBudget",
  "seller.route.prices",
] as const;

export const reads = {
  "settings.ai": op(guard, none, async () => {
    const [{ fromEnv, getSetting, getSettings, maskSecret }, { aiProviderIds, aiProviders, providerSettingKeys }] = await Promise.all([workspace(), import("@/modules/assistant")]);
    const [aiProvider, aiEnabled, aiKnowledge, pr, sellerSettings, media, route, autofill] = await Promise.all([
      getSetting("ai.provider"),
      getSetting("ai.enabled"),
      getSetting("ai.knowledge"),
      getSettings(["proofread.provider", "proofread.model", "proofread.enabled", "writer.provider", "writer.model", "writer.enabled"]),
      getSettings(["seller.provider", "seller.model"]),
      getSettings(["media.provider", "media.model"]),
      getSettings([...ROUTE_KEYS]),
      getSetting("ai.autofill"),
    ]);
    const aiSaved = Object.fromEntries(
      await Promise.all(
        aiProviderIds.map(async (p) => {
          const k = providerSettingKeys[p];
          const v = await getSettings([k.apiKey, k.model, k.baseUrl]);
          // Адрес Claude по умолчанию хранится в настройках — показываем его как плейсхолдер, а не как своё значение.
          const baseUrl = v[k.baseUrl] === aiProviders[p].defaultBaseUrl ? "" : v[k.baseUrl];
          return [p, { apiKey: maskSecret(v[k.apiKey]), apiKeyEnv: fromEnv(k.apiKey), model: v[k.model], baseUrl, baseUrlEnv: fromEnv(k.baseUrl) }] as const;
        }),
      ),
    );
    return { aiProvider, aiEnabled, aiKnowledge, pr, sellerSettings, media, route, autofill, aiSaved, providerFromEnv: fromEnv("ai.provider"), routeEnv: ROUTE_KEYS.filter((k) => fromEnv(k)) };
  }),

  "settings.bot": op(guard, none, async () => {
    const [{ getSetting, listFields }, { botSiteInfo }] = await Promise.all([workspace(), import("@/server/bot-site")]);
    const [botMode, botConfig, dealFields, botMetrics, rules, botCatalog, aiModel, sellerModel, coach, materials] = await Promise.all([
      getSetting("bot.mode"),
      getSetting("bot.config"),
      listFields("deal"),
      container().messaging.botMetrics(),
      container().automation.rules.list(),
      botSiteInfo.catalog(),
      container()
        .assistant.service.describe()
        .then(async (d) => ((await container().assistant.service.configured()) ? d.model || d.label : null))
        .catch(() => null),
      container()
        .assistant.seller.describe()
        .then(async (d) => ((await container().assistant.seller.configured()) ? d.model || d.label : null))
        .catch(() => null),
      container().messaging.lessons(),
      container().messaging.materials(),
    ]);
    return { botMode, botConfig, dealFields, botMetrics, rules, botCatalog, aiModel, sellerModel, coach, materials };
  }),

  "settings.crm": op(guard, none, async () => {
    const { fromEnv, getSetting, maskSecret } = await workspace();
    const [sla, templates, workHours, autoDealFrom, unsorted, maxDiscount, blocked, wEnabled, wChat, reassign, holidays, mergeDays, digest, chatReward, wHelp, helpStats, autoLetters, gId, gSecret, gConnected] = await Promise.all([
      getSetting("crm.slaMinutes"),
      container().workspace.templates.list(),
      getSetting("crm.workHours"),
      getSetting("crm.autoDealFrom"),
      getSetting("crm.unsorted"),
      getSetting("crm.maxDiscount"),
      container().messaging.queries.blocklist(),
      getSetting("widget.enabled"),
      getSetting("widget.chat"),
      getSetting("crm.reassignMinutes"),
      getSetting("automation.holidays"),
      container().sales.deals.mergeClosedDays(),
      getSetting("crm.digest"),
      getSetting("referral.chatReward"),
      getSetting("widget.help"),
      container().messaging.helpStats(30).catch(() => null),
      getSetting("notify.auto"),
      getSetting("google.clientId"),
      getSetting("google.clientSecret"),
      container().boards.google.connectedCount(),
    ]);
    const google = { clientId: gId, clientIdEnv: fromEnv("google.clientId"), secret: maskSecret(gSecret), secretEnv: fromEnv("google.clientSecret"), connected: gConnected };
    return { sla, templates, workHours, autoDealFrom, unsorted, maxDiscount, blocked, wEnabled, wChat, reassign, holidays, mergeDays, digest, chatReward, wHelp, helpStats, autoLetters, google };
  }),

  "settings.mail": op(guard, none, async () => {
    const { fromEnv, getSettings, maskSecret, smtpConfig, smtpFromEnvironment } = await workspace();
    const em = await getSettings(["email.imapHost", "email.imapPort", "email.imapUser", "email.imapPassword", "email.imapMailbox", "email.webhookToken"]);
    const smtpEnv = smtpFromEnvironment();
    const smtpCfg = smtpEnv ? await smtpConfig() : null;
    const smtpDb = await getSettings(["mail.smtpHost", "mail.smtpPort", "mail.smtpSecure", "mail.smtpUser", "mail.smtpPassword", "mail.from", "mail.replyTo"]);
    const smtpSaved = smtpCfg
      ? { host: smtpCfg.host, port: String(smtpCfg.port), secure: String(smtpCfg.secure), user: smtpCfg.user, password: maskSecret(smtpCfg.password), from: smtpCfg.from, replyTo: smtpCfg.replyTo }
      : { host: smtpDb["mail.smtpHost"], port: smtpDb["mail.smtpPort"], secure: smtpDb["mail.smtpSecure"], user: smtpDb["mail.smtpUser"], password: maskSecret(smtpDb["mail.smtpPassword"]), from: smtpDb["mail.from"], replyTo: smtpDb["mail.replyTo"] };
    return {
      smtpEnv: !!smtpEnv,
      smtpSaved,
      smtp: await container().mailer.configured(),
      imap: { imapHost: em["email.imapHost"], imapPort: em["email.imapPort"], imapUser: em["email.imapUser"], imapPassword: maskSecret(em["email.imapPassword"]), imapMailbox: em["email.imapMailbox"] },
      imapEnv: { imapHost: fromEnv("email.imapHost"), imapPort: fromEnv("email.imapPort"), imapUser: fromEnv("email.imapUser"), imapPassword: fromEnv("email.imapPassword") },
      webhookToken: em["email.webhookToken"],
    };
  }),

  "settings.messengers": op(guard, none, async () => {
    const [{ fromEnv, getSetting, getSettings, maskSecret }, { WA_CATALOG }, { recordingDays }] = await Promise.all([workspace(), import("@/modules/messaging"), import("@/modules/telephony")]);
    const [apiKey, baseUrl, channelId, webhookToken, provider, gowaSettings, status, rules, lifecycleChat, catalogDocs, catalogSettings, products, recording] = await Promise.all([
      getSetting("wazzup.apiKey"),
      getSetting("wazzup.baseUrl"),
      getSetting("wazzup.channelId"),
      getSetting("wazzup.webhookToken"),
      container().messaging.whatsappProvider(),
      getSettings(["gowa.baseUrl", "gowa.basicAuth", "gowa.callbackUrl", "gowa.calls"]),
      container().messaging.gowa.status(),
      container().messaging.chats.ruleSendingToday(),
      getSetting("notify.whatsapp"),
      getSetting("whatsapp.catalogDocs"),
      container().messaging.catalog.settings(),
      container().messaging.catalog.list().then((l) => l.length),
      getSetting("calls.recordingDays"),
    ]);
    return {
      wazzup: { apiKey: maskSecret(apiKey), baseUrl, channelId, env: { apiKey: fromEnv("wazzup.apiKey"), baseUrl: fromEnv("wazzup.baseUrl"), channelId: fromEnv("wazzup.channelId") }, webhookToken },
      gowa: { provider, baseUrl: gowaSettings["gowa.baseUrl"], authSaved: maskSecret(gowaSettings["gowa.basicAuth"]), callbackUrl: gowaSettings["gowa.callbackUrl"], calls: gowaSettings["gowa.calls"], status },
      recordingDays: recordingDays(recording),
      rules,
      lifecycleChat,
      catalog: { settings: catalogSettings, products, docsRaw: catalogDocs, fallbacks: WA_CATALOG.docs },
    };
  }),

  "settings.payments": op(guard, none, async () => {
    const { fromEnv, getSettings } = await workspace();
    const [kaspi, transfer, alertAfterMinutes] = await Promise.all([container().ordering.kaspiSetup.status(), getSettings(["pay.transferPhone", "pay.transferName"]), container().ordering.kaspiWatch.alertAfterMinutes()]);
    return { kaspi, transfer, alertAfterMinutes, secretFromEnv: fromEnv("kaspi.webhookSecret"), transferFromEnv: fromEnv("pay.transferPhone") };
  }),

  "settings.telephony": op(guard, none, async () => {
    const { fromEnv, getSetting, maskSecret } = await workspace();
    const [provider, zKey, zSecret, pbxToken, zPbx, zWebphone] = await Promise.all([getSetting("telephony.provider"), getSetting("zadarma.key"), getSetting("zadarma.secret"), getSetting("pbx.token"), getSetting("zadarma.pbxId"), getSetting("zadarma.webphone")]);
    return {
      provider,
      providerFromEnv: fromEnv("telephony.provider"),
      zadarma: { key: maskSecret(zKey), secret: maskSecret(zSecret), keyEnv: fromEnv("zadarma.key"), secretEnv: fromEnv("zadarma.secret"), pbxId: zPbx, pbxIdEnv: fromEnv("zadarma.pbxId"), webphone: zWebphone === "on" },
      pbxToken,
    };
  }),
};
