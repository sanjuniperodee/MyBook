/**
 * Каналы привлечения: из UTM-меток, реферера и источника сделки получаем понятный канал
 * («Instagram», «Google Ads», «Блогеры»…). Модуль без зависимостей — общий для сервера и интерфейса.
 */
export interface Attribution {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  referrer?: string;
  /** Короткая ссылка из раздела «Ссылки и каналы», по которой пришёл клиент. */
  link?: string;
  landing?: string;
}

export const channels = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  youtube: "YouTube",
  vk: "ВКонтакте",
  google_ads: "Google Ads",
  google: "Google (поиск)",
  yandex_ads: "Яндекс Директ",
  yandex: "Яндекс (поиск)",
  bloggers: "Блогеры",
  email: "E-mail рассылка",
  referral: "Другие сайты",
  call: "Звонок",
  offline: "Офлайн (листовки, QR)",
  other: "Другое",
  direct: "Прямой заход",
} as const;
export type ChannelKey = keyof typeof channels;

/** Готовые источники для генератора ссылок: utm_source и utm_medium. */
export const sourcePresets: { key: ChannelKey; label: string; source: string; medium: string }[] = [
  { key: "instagram", label: "Instagram", source: "instagram", medium: "social" },
  { key: "tiktok", label: "TikTok", source: "tiktok", medium: "social" },
  { key: "whatsapp", label: "WhatsApp", source: "whatsapp", medium: "messenger" },
  { key: "telegram", label: "Telegram", source: "telegram", medium: "messenger" },
  { key: "bloggers", label: "Блогер", source: "blogger", medium: "influencer" },
  { key: "google_ads", label: "Google Ads", source: "google", medium: "cpc" },
  { key: "yandex_ads", label: "Яндекс Директ", source: "yandex", medium: "cpc" },
  { key: "facebook", label: "Facebook", source: "facebook", medium: "social" },
  { key: "email", label: "Рассылка", source: "newsletter", medium: "email" },
  { key: "offline", label: "Листовка / QR", source: "offline", medium: "qr" },
];

const paid = (m: string) => /^(cpc|ppc|paid|cpm|ads?|paidsocial|banner|display)$/.test(m);

export function channelOf(a: Attribution | null | undefined, dealSource?: string | null): ChannelKey {
  const src = (a?.source ?? "").toLowerCase().trim();
  const med = (a?.medium ?? "").toLowerCase().trim();
  const ref = (a?.referrer ?? "").toLowerCase().trim();
  if (src || med) {
    if (/^(blog|influenc)/.test(src) || /^(blogger|influencer|influence)$/.test(med)) return "bloggers";
    if (/^(ig|insta)/.test(src)) return "instagram";
    if (/^(tiktok|tt)$/.test(src)) return "tiktok";
    if (/^(fb|facebook|meta)/.test(src)) return "facebook";
    if (/^(wa|whatsapp)/.test(src)) return "whatsapp";
    if (/^(tg|telegram)/.test(src)) return "telegram";
    if (/^(yt|youtube)/.test(src)) return "youtube";
    if (/^(vk|vkontakte)/.test(src)) return "vk";
    if (src.startsWith("google")) return paid(med) ? "google_ads" : "google";
    if (src.startsWith("yandex") || src === "ya") return paid(med) ? "yandex_ads" : "yandex";
    if (/^(email|newsletter|mail)/.test(src) || med === "email") return "email";
    if (/^(offline|qr|flyer|print)/.test(src) || med === "qr" || med === "offline") return "offline";
    return "other";
  }
  if (ref) {
    if (/(^|\.)google\./.test(ref)) return "google";
    if (/(^|\.)(yandex|ya)\./.test(ref)) return "yandex";
    if (/instagram\.com$|(^|\.)l\.instagram/.test(ref)) return "instagram";
    if (/(^|\.)(facebook|fb)\.com$/.test(ref)) return "facebook";
    if (/tiktok\.com$/.test(ref)) return "tiktok";
    if (/(^|\.)t\.me$|telegram/.test(ref)) return "telegram";
    if (/(^|\.)vk\.com$/.test(ref)) return "vk";
    if (/youtube\.com$|youtu\.be$/.test(ref)) return "youtube";
    return "referral";
  }
  switch (dealSource) {
    case "whatsapp":
      return "whatsapp";
    case "instagram":
      return "instagram";
    case "telegram":
      return "telegram";
    case "call":
      return "call";
    case "referral":
      return "referral";
    default:
      return "direct";
  }
}

export const channelLabel = (a: Attribution | null | undefined, dealSource?: string | null) => channels[channelOf(a, dealSource)];

/** «instagram / social / new-year» — кратко для карточек. */
export function describeAttribution(a: Attribution | null | undefined) {
  if (!a) return "";
  const utm = [a.source, a.medium, a.campaign].filter(Boolean).join(" / ");
  return utm || a.referrer || "";
}

/** Приводит сырое значение (cookie, JSON из базы) к Attribution, отбрасывая лишнее. */
export function toAttribution(raw: unknown): Attribution | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: Attribution = {};
  for (const k of ["source", "medium", "campaign", "content", "term", "referrer", "link", "landing"] as const) {
    if (typeof r[k] === "string" && r[k]) out[k] = (r[k] as string).slice(0, 100);
  }
  return Object.keys(out).length ? out : null;
}

/** Код ссылки в первом сообщении WhatsApp: «… (код: insta-bio)» или «#insta-bio». */
export function linkCodeFromText(text: string): string | null {
  const m = /\(\s*код:?\s*([a-z0-9][a-z0-9-]{1,40})\s*\)|(?:^|\s)#([a-z0-9][a-z0-9-]{1,40})(?=\s|$)/i.exec(text);
  return (m?.[1] ?? m?.[2])?.toLowerCase() ?? null;
}

/** Короткий код ссылки: латиница, цифры, дефис. */
export function normalizeSlug(raw: string) {
  const map: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ы: "y", э: "e", ю: "yu", я: "ya", ә: "a", ғ: "g", қ: "q", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i" };
  return raw
    .toLowerCase()
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Полная ссылка с UTM для сайта. */
export function buildSiteUrl(base: string, path: string, a: { source: string; medium?: string; campaign?: string; content?: string }, link?: string) {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, base);
  url.searchParams.set("utm_source", a.source);
  if (a.medium) url.searchParams.set("utm_medium", a.medium);
  if (a.campaign) url.searchParams.set("utm_campaign", a.campaign);
  if (a.content) url.searchParams.set("utm_content", a.content);
  if (link) url.searchParams.set("lnk", link);
  return url.toString();
}
