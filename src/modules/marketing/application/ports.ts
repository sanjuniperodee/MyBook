import type { Locale } from "@/i18n/config";
import type { ClickRow, ClientRow, DealRow, TrackedLink } from "../domain";

export interface ReportSource {
  /** since — null за всё время. */
  rows(since: Date | null): Promise<{ clients: ClientRow[]; deals: DealRow[]; clicks: ClickRow[] }>;
}

export interface LinkRepository {
  bySlug(slug: string): Promise<TrackedLink | null>;
  all(): Promise<(TrackedLink & { name: string; clicks: number; createdAt: Date })[]>;
  recordClick(linkId: string, at: Date): Promise<void>;
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
