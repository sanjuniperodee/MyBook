/**
 * Рекламные лендинги (/podarok): код перехода, разбор адреса и устройства. Чистый код — и для страницы сайта (браузер
 * пишет переход и дописывает код в сообщение WhatsApp), и для API (проверяет то, что прислал браузер).
 */

/**
 * Лендинги под рекламу: slug — и путь страницы, и метка перехода в БД. podarok — mybooks.kz/podarok; skidka — его
 * прежний адрес (сайт перенаправляет на podarok, старые переходы в БД помечены им).
 */
export const AD_LANDINGS = ["podarok", "skidka"] as const;
export type AdLanding = (typeof AD_LANDINGS)[number];
export const isAdLanding = (v: unknown): v is AdLanding => typeof v === "string" && (AD_LANDINGS as readonly string[]).includes(v);

/**
 * Код перехода: «lp» и 6 знаков без похожих (0/o, 1/l). В сообщение лендинга /podarok он не дописывается (клиент не
 * должен видеть кода) — это id перехода и eventID в Meta Pixel; если код всё же есть в сообщении («… (код: lp…)»),
 * CRM привяжет диалог по нему.
 */
export const LANDING_CODE_RE = /^lp[a-hj-km-np-z2-9]{6}$/;
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const isLandingCode = (v: unknown): v is string => typeof v === "string" && LANDING_CODE_RE.test(v);

export function newLandingCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  return `lp${[...random(6)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("")}`;
}

/**
 * Окно привязки «по времени»: первое сообщение пришло не позже чем через 10 минут после нажатия кнопки (обычно — через
 * 1–3 минуты). Часы телефона и сервера расходятся — нажатие может оказаться чуть «позже» сообщения.
 */
export const LANDING_MATCH_BEFORE_MS = 10 * 60_000;
export const LANDING_MATCH_AFTER_MS = 60_000;

/** Что страница берёт из адреса: UTM, fbclid и динамические параметры Meta ({{campaign.id}}, {{adset.id}}, {{ad.id}}, {{placement}}). */
export const LANDING_URL_PARAMS = {
  utm_source: "utmSource",
  utm_medium: "utmMedium",
  utm_campaign: "utmCampaign",
  utm_content: "utmContent",
  utm_term: "utmTerm",
  fbclid: "fbclid",
  campaign_id: "campaignId",
  adset_id: "adsetId",
  ad_id: "adId",
  placement: "placement",
} as const;
export type LandingUrlFields = Partial<Record<(typeof LANDING_URL_PARAMS)[keyof typeof LANDING_URL_PARAMS], string>>;

/** Предел длины любого поля перехода (fbclid бывает ~200 знаков). */
export const LANDING_FIELD_MAX = 300;

/** Параметр адреса с креативом рекламы (?c=nurtik): от него зависит первое сообщение в WhatsApp. */
export const LANDING_CREATIVE_PARAM = "c";

/** Креатив из адреса (?c=) — без пробелов и в нижнем регистре; нет — пусто. */
export const landingCreative = (search: URLSearchParams) => (search.get(LANDING_CREATIVE_PARAM) ?? "").trim().toLowerCase().slice(0, LANDING_FIELD_MAX);

/** Параметры Lead в Meta Pixel: content_name — креатив из ?c=, без него — «site». */
export const landingLeadParams = (search: URLSearchParams) => ({ content_name: landingCreative(search) || "site" });

/**
 * Ссылка кнопки WhatsApp лендинга: только фраза, без кода перехода — клиент не должен видеть служебного. Источник
 * заявки CRM находит по времени нажатия (landing_visits).
 */
export const landingWhatsappUrl = (number: string, text: string) => `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

/**
 * Поля перехода из адреса страницы; пустые и незаполненные шаблоны Meta («{{ad.id}}») отбрасываются. Креатив (?c=)
 * без utm_campaign становится кампанией: так CRM видит, с какого креатива заявка.
 */
export function landingUrlFields(search: URLSearchParams): LandingUrlFields {
  const out: LandingUrlFields = {};
  for (const [param, field] of Object.entries(LANDING_URL_PARAMS)) {
    const v = search.get(param)?.trim();
    if (v && !/^\{\{.*\}\}$/.test(v)) out[field] = v.slice(0, LANDING_FIELD_MAX);
  }
  const creative = landingCreative(search);
  if (creative && !out.utmCampaign) out.utmCampaign = creative;
  return out;
}

/** Meta Pixel рекламного лендинга (публичный ID, виден в коде любой страницы с пикселем). */
export const LANDING_META_PIXEL_ID = "1667800464519418";

export type LandingDevice = "iphone" | "ipad" | "android" | "desktop" | "other";
export type LandingApp = "instagram" | "facebook" | "tiktok" | "";

/** Устройство и встроенный браузер приложения по User-Agent. */
export function landingDevice(userAgent: string): { device: LandingDevice; inApp: LandingApp } {
  const ua = userAgent || "";
  const device: LandingDevice = /iPad/.test(ua) ? "ipad" : /iPhone|iPod/.test(ua) ? "iphone" : /Android/.test(ua) ? "android" : /Windows|Macintosh|X11|CrOS/.test(ua) ? "desktop" : "other";
  const inApp: LandingApp = /Instagram/.test(ua) ? "instagram" : /FBAN|FBAV|FB_IAB|FBIOS/.test(ua) ? "facebook" : /musical_ly|BytedanceWebview|TikTok/i.test(ua) ? "tiktok" : "";
  return { device, inApp };
}
