import type { Attribution } from "@/shared/domain/channels";
import { LANDING_MATCH_AFTER_MS, LANDING_MATCH_BEFORE_MS } from "@/shared/domain/landing";

/** Переход на рекламный лендинг (landing_visits). */
export interface LandingVisit {
  id: string;
  code: string;
  landing: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
  adId: string;
  inApp: string;
  device: string;
  createdAt: Date;
  clickedAt: Date | null;
  conversationId: string | null;
}

export type LandingMatch = "code" | "time";

/**
 * Метки сделки по переходу: UTM из адреса; без utm_source — приложение, в чьём браузере открыли (Instagram, Facebook),
 * иначе «landing». landing — путь лендинга, по нему отчёт и карточка видят, откуда заявка.
 */
export function visitAttribution(v: Pick<LandingVisit, "landing" | "utmSource" | "utmMedium" | "utmCampaign" | "utmContent" | "utmTerm" | "adId" | "inApp">): Attribution {
  return {
    source: v.utmSource || v.inApp || "landing",
    medium: v.utmMedium || (v.utmSource || v.inApp ? "paid" : "landing"),
    ...(v.utmCampaign ? { campaign: v.utmCampaign } : {}),
    ...(v.utmContent || v.adId ? { content: v.utmContent || v.adId } : {}),
    ...(v.utmTerm ? { term: v.utmTerm } : {}),
    landing: `/${v.landing}`,
  };
}

/**
 * Тестовый переход сотрудника: креатив `?c=lp-check…`, `?c=test…` (или такая же метка кампании). По времени к заявке
 * клиента не привязывается — 27.11 тестовые нажатия при проверке лендинга «достались» двум настоящим клиентам.
 */
export const isTestVisit = (v: Partial<Pick<LandingVisit, "utmCampaign">>) => /^(lp-?check|test)/i.test((v.utmCampaign ?? "").trim());

/**
 * Стандартный текст кнопки WhatsApp в самом объявлении Meta (Click-to-WhatsApp): человек пришёл из рекламы напрямую,
 * а не с лендинга, — по времени к переходу его не привязываем.
 */
const META_AD_DEFAULT_TEXTS = ["Привет! Можно узнать об этом подробнее?", "Hello! Can I get more info on this?"].map(adText);
function adText(text: string) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
export const isMetaAdDefaultText = (text: string) => META_AD_DEFAULT_TEXTS.includes(adText(text));

/**
 * Переход для нового диалога без кода: ближайшее к первому сообщению нажатие WhatsApp, ещё ни к кому не привязанное,
 * в окне [сообщение − 10 мин, сообщение + 1 мин], кроме тестовых (isTestVisit). Нет такого — null.
 */
export function nearestFreeClick<T extends Pick<LandingVisit, "clickedAt" | "conversationId"> & Partial<Pick<LandingVisit, "utmCampaign">>>(visits: T[], at: Date): T | null {
  const t = at.getTime();
  let best: T | null = null;
  let bestGap = Infinity;
  for (const v of visits) {
    if (!v.clickedAt || v.conversationId || isTestVisit(v)) continue;
    const d = v.clickedAt.getTime() - t;
    if (d < -LANDING_MATCH_BEFORE_MS || d > LANDING_MATCH_AFTER_MS) continue;
    if (Math.abs(d) < bestGap) {
      best = v;
      bestGap = Math.abs(d);
    }
  }
  return best;
}

/** Примечание в ленте сделки: откуда заявка и как нашли переход; «по времени» — менеджеру стоит уточнить. */
export function visitNote(v: LandingVisit, match: LandingMatch, firstMessageAt: Date, timeZone: string): string {
  const a = visitAttribution(v);
  const at = v.clickedAt ?? v.createdAt;
  const time = new Intl.DateTimeFormat("ru-RU", { timeZone, hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(at);
  const labels = [a.source, a.medium, a.campaign].filter(Boolean).join(" / ");
  const ad = a.content ? `, объявление ${a.content}` : "";
  const head = `Пришёл(а) с лендинга /${v.landing} (${labels}${ad}), переход ${time}`;
  if (match === "code") return `${head}, код ${v.code} в сообщении.`;
  const min = Math.max(0, Math.round((firstMessageAt.getTime() - at.getTime()) / 60_000));
  return `${head}. Источник по времени: код в сообщении стёрт, ближайшее нажатие WhatsApp — за ${min} мин до первого сообщения. Проверьте при разговоре.`;
}
