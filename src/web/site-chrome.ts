import "server-only";
import { site } from "@/config/site";
import { v1WebRead } from "./api";

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
      viaApi: (api) => api.webSiteChrome({}),
    });
  } catch {
    return { widget: null, shopWhatsappDigits: site.contacts.whatsapp.replace(/\D/g, "") };
  }
}
