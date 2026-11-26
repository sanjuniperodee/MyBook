/** Чистые помощники рекламных ссылок и виджета сайта: нужны и модулю marketing, и страницам сайта без БД. */

export const isValidSlug = (slug: string) => /^[a-z0-9-]{1,40}$/i.test(slug);

/** Ссылка в WhatsApp с первым сообщением и кодом ссылки в нём — по коду CRM узнаёт источник заявки (linkCodeFromText). */
export function whatsappLink(whatsappNumber: string, text: string, code: string) {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`${text} (код: ${code})`)}`;
}

/**
 * Код источника в сообщении из виджета сайта (chats-19): «site-<кампания>» — по utm_campaign визита, иначе
 * «site-<страница>» («site-gift», «site-home»). Латиница, цифры и дефис, не длиннее, чем берёт linkCodeFromText.
 */
export function widgetCode(campaign: string | null | undefined, path: string): string {
  const slug = (v: string) =>
    v
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 34);
  const page = path.replace(/^\/(kk)(\/|$)/, "/").replace(/^\/+|\/+$/g, "") || "home";
  return `site-${slug(campaign ?? "") || slug(page) || "home"}`;
}

/** Кампания визита по ссылке-приглашению /r/<код> (contacts-d7): так виджет сайта передаёт код в первом сообщении. */
export const INVITE_CAMPAIGN_PREFIX = "invite-";

/** Первое касание: откуда пришёл посетитель (UTM и реферер). Храним 60 дней, при регистрации сохраняем в профиль. */
export const SOURCE_COOKIE = "mb_src";

/** Cookie посетителя для чата на сайте. */
export const VISITOR_COOKIE = "mb_chat";
