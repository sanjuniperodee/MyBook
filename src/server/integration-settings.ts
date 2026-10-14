import "server-only";
import { env } from "@/config/env";
import type { WhatsappSettings } from "@/modules/messaging";
import type { KaspiConfigStore, KaspiSession } from "@/modules/ordering";
import { ensureToken, getSettings, saveSettings } from "@/modules/workspace";

/*
 * Настройки интеграций для корня композиции (container.ts): модулям нужны не только значения из «Интеграций»,
 * но и токены вебхуков, которые создаются при первом обращении, и адрес сайта.
 */

/** Настройки Kaspi Pay в «Интеграциях»: сессия кассира хранится одним зашифрованным JSON. */
export const kaspiConfig: KaspiConfigStore = {
  async config() {
    const v = await getSettings(["kaspi.enabled", "kaspi.apiUrl", "kaspi.session"]);
    let session: KaspiSession | null = null;
    try {
      session = v["kaspi.session"] ? (JSON.parse(v["kaspi.session"]) as KaspiSession) : null;
    } catch {
      session = null;
    }
    return { enabled: v["kaspi.enabled"] === "on", apiUrl: v["kaspi.apiUrl"], session };
  },
  saveSession: (session, actorId) => saveSettings({ "kaspi.session": session ? JSON.stringify(session) : "" }, actorId),
  setEnabled: (enabled, actorId) => saveSettings({ "kaspi.enabled": enabled ? "on" : "off" }, actorId),
  saveApiUrl: (apiUrl, actorId) => saveSettings({ "kaspi.apiUrl": apiUrl }, actorId),
  webhookSecret: () => ensureToken("kaspi.webhookSecret"),
};

/** WhatsApp: Wazzup или свой шлюз GOWA — выбирается в «Интеграциях». */
export const whatsappSettings: WhatsappSettings = {
  provider: async () => ((await getSettings(["whatsapp.provider"]))["whatsapp.provider"] === "gowa" ? "gowa" : "wazzup"),
  gowa: async () => {
    const v = await getSettings(["gowa.baseUrl", "gowa.basicAuth"]);
    return { baseUrl: v["gowa.baseUrl"], basicAuth: v["gowa.basicAuth"] };
  },
  gowaWebhook: async () => {
    const callback = (await getSettings(["gowa.callbackUrl"]))["gowa.callbackUrl"];
    // По умолчанию — публичный адрес сайта; в docker compose — внутренний (GOWA_CALLBACK_URL), можно сменить в «Интеграциях».
    return { url: callback || `${env.appUrl}/api/integrations/gowa`, secret: await ensureToken("gowa.webhookSecret") };
  },
};
