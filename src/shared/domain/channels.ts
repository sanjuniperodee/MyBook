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
  recommendation: "Рекомендация знакомых",
  repeat: "Повторный клиент",
  other: "Другое",
  direct: "Прямой заход",
} as const;
export type ChannelKey = keyof typeof channels;

/**
 * Каналы, которые менеджер выбирает вручную, когда заводит клиента или правит его карточку (порядок — как в списке).
 * Клиент сохраняется с меткой {source: ключ канала, medium: "manual"} — отчёты и фильтры читают её как обычный источник.
 */
export const manualChannels = ["instagram", "whatsapp", "telegram", "tiktok", "facebook", "youtube", "vk", "bloggers", "call", "recommendation", "repeat", "offline", "other"] as const satisfies readonly ChannelKey[];
export type ManualChannel = (typeof manualChannels)[number];
export const MANUAL_MEDIUM = "manual";

export const isManualChannel = (v: unknown): v is ManualChannel => typeof v === "string" && (manualChannels as readonly string[]).includes(v);

/** Метка источника для выбранного вручную канала. */
export const manualAttribution = (channel: ManualChannel): Attribution => ({ source: channel, medium: MANUAL_MEDIUM });

const paid = (m: string) => /^(cpc|ppc|paid|cpm|ads?|paidsocial|banner|display)$/.test(m);

export function channelOf(a: Attribution | null | undefined, dealSource?: string | null): ChannelKey {
  const src = (a?.source ?? "").toLowerCase().trim();
  const med = (a?.medium ?? "").toLowerCase().trim();
  const ref = (a?.referrer ?? "").toLowerCase().trim();
  // Канал выбрал менеджер — это он и есть, без догадок по тексту метки.
  if (med === MANUAL_MEDIUM && isManualChannel(src)) return src;
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
  // Канал выбран вручную — «метки» нет, сам канал уже показан отдельно.
  if (!a || a.medium === MANUAL_MEDIUM) return "";
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
