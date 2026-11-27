import type { Locale } from "@/i18n/config";
import type { ClickRow, ClientRow, DealRow, LandingMatch, LandingVisit, SpendRow, TrackedLink } from "../domain";

export interface ReportSource {
  /** since — null за всё время. */
  /** until — конец периода (не включая); без него — до сейчас. day — период днями магазина: расход берётся за эти дни целиком. */
  rows(since: Date | null, until?: { to: Date; first: string; last: string } | null): Promise<{ clients: ClientRow[]; deals: DealRow[]; clicks: ClickRow[]; spend?: SpendRow[] }>;
}

/** Расходы на рекламу (analytics-7). */
export interface SpendRepository {
  add(row: { channel: string; day: string; amount: number; note: string; createdById: string }): Promise<string>;
  recent(limit: number): Promise<{ id: string; channel: string; day: string; amount: number; note: string; createdAt: Date }[]>;
  remove(id: string): Promise<{ channel: string; day: string; amount: number } | null>;
}

export interface LinkRepository {
  bySlug(slug: string): Promise<TrackedLink | null>;
  /** Ссылка с такой utm_campaign (свежая — первой): заявка из виджета сайта по кампании визита. */
  byCampaign?(campaign: string): Promise<TrackedLink | null>;
  all(): Promise<(TrackedLink & { name: string; clicks: number; createdAt: Date })[]>;
  recordClick(linkId: string, at: Date): Promise<void>;
  add(link: Omit<TrackedLink, "id" | "archived"> & { name: string; createdById: string }): Promise<void>;
  setArchived(id: string, archived: boolean): Promise<void>;
}

/** Клиент глазами отдела продаж: язык, неоплаченный заказ, книга в работе. */
export interface ClientContext {
  load(clientId: string | null): Promise<{ locale: Locale; order: { id: string; number: number } | null; book: { id: string; title: string } | null }>;
}

/** Персональный промокод (контекст Ordering). */
export interface PromoIssuer {
  issuePersonal(input: { code: string; percent: number; validHours: number; note: string }): Promise<{ code: string; expiresAt: Date | null } | null>;
}

/** Код персонального промокода (MB-XXXXXX). */
export type PromoCodeGenerator = () => string;

export interface MarketingSettings {
  maxDiscount(): Promise<number>;
  whatsappNumber(): Promise<string>;
}

export interface AppLinks {
  readonly appUrl: string;
  link(path: string, locale: Locale): string;
  formatDate(d: Date, locale: Locale): string;
}

/** Переход на лендинг, как его прислал браузер (поля уже обрезаны и проверены). */
export interface LandingVisitInput {
  code: string;
  landing: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
  fbclid: string;
  fbp: string;
  fbc: string;
  campaignId: string;
  adsetId: string;
  adId: string;
  placement: string;
  referrer: string;
  userAgent: string;
  device: string;
  inApp: string;
}

/** Переходы на рекламные лендинги (landing_visits). */
export interface LandingVisitRepository {
  /** Заход (повтор с тем же кодом — без изменений); clickedAt — нажал WhatsApp (ставится один раз, первым нажатием). */
  record(visit: LandingVisitInput, clickedAt: Date | null): Promise<void>;
  byCode(code: string): Promise<LandingVisit | null>;
  /** Свободные (не привязанные) нажатия WhatsApp в промежутке. */
  freeClicks(from: Date, to: Date): Promise<LandingVisit[]>;
  /**
   * Привязать переход к диалогу. onlyFree — только если он ещё ни к кому не привязан (по времени); по коду — всегда:
   * код в сообщении надёжнее прежней догадки по времени. false — не привязали.
   */
  claim(id: string, conversationId: string, match: LandingMatch, at: Date, onlyFree: boolean): Promise<boolean>;
}
