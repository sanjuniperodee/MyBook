import "server-only";
import { site } from "@/config/site";
import { localSiteChrome } from "./v1-local-bridge-public";
import { v1WebRead } from "./v1-web-client";

/**
 * Подвал и кнопки связи публичных страниц: виджет и номер WhatsApp магазина. На сервере с БД — напрямую, на сайте
 * без БД — через API v1 (Раздел 4). Сбой не роняет страницу: виджета нет, номер — заводской.
 */
export async function siteChrome() {
  try {
    return await v1WebRead({
      name: "public.siteChrome",
      section: "public",
      sessionCookie: null,
      local: () => localSiteChrome(),
      viaApi: (api) => api.webSiteChrome({}),
    });
  } catch {
    return { widget: null, shopWhatsappDigits: site.contacts.whatsapp.replace(/\D/g, "") };
  }
}
