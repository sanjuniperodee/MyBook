import { channelOf, channels, toAttribution, type Attribution, type ChannelKey } from "@/lib/crm/channels";

export interface Metrics {
  clicks: number;
  registrations: number;
  startedBook: number;
  leads: number;
  sales: number;
  revenue: number;
}
export type CohortMetrics = Metrics & { leadsWithoutClient: number };
const empty = (): CohortMetrics => ({ clicks: 0, registrations: 0, startedBook: 0, leads: 0, sales: 0, revenue: 0, leadsWithoutClient: 0 });

/** Конверсия в продажу: от регистраций и заявок без аккаунта на сайте. */
export const conversion = (m: Metrics & { leadsWithoutClient?: number }) => {
  const base = m.registrations + (m.leadsWithoutClient ?? 0);
  return base ? m.sales / base : null;
};

export interface Report {
  channels: (CohortMetrics & { key: ChannelKey; label: string })[];
  campaigns: (CohortMetrics & { key: string; source: string; medium: string; campaign: string; channel: string })[];
  links: Map<string, CohortMetrics>;
  total: CohortMetrics;
}

/** Клиент когорты: источник первого визита, начал ли книгу, оплатил ли и на сколько. */
export interface ClientRow {
  source: unknown;
  started: boolean;
  paid: boolean;
  revenue: number;
}
/** Заявка (сделка): её UTM, источник, есть ли клиент, успешна ли и закрыта ли заказом на сайте. */
export interface DealRow {
  utm: unknown;
  source: string;
  clientId: string | null;
  won: boolean;
  amount: number;
  hasOrder: boolean;
}
export interface ClickRow {
  slug: string;
  source: string;
  medium: string;
  campaign: string;
  clicks: number;
}

/**
 * Отчёт по каналам привлечения. Клиенты — по источнику первого визита; заявки — по их UTM;
 * выручка — оплаченные заказы клиентов когорты плюс успешные сделки без заказа (продажи в мессенджерах).
 */
export function buildChannelReport(clients: ClientRow[], deals: DealRow[], clicks: ClickRow[]): Report {
  const byChannel = new Map<ChannelKey, CohortMetrics>();
  const byCampaign = new Map<string, CohortMetrics & { source: string; medium: string; campaign: string; channel: string }>();
  const byLink = new Map<string, CohortMetrics>();
  const total = empty();
  const bump = (a: Attribution | null, dealSource: string | null, f: (m: CohortMetrics) => void) => {
    const ch = channelOf(a, dealSource);
    if (!byChannel.has(ch)) byChannel.set(ch, empty());
    f(byChannel.get(ch)!);
    f(total);
    if (a?.source) {
      const key = [a.source, a.medium ?? "", a.campaign ?? ""].join("|").toLowerCase();
      if (!byCampaign.has(key)) byCampaign.set(key, { ...empty(), source: a.source, medium: a.medium ?? "", campaign: a.campaign ?? "", channel: channels[ch] });
      f(byCampaign.get(key)!);
    }
    if (a?.link) {
      if (!byLink.has(a.link)) byLink.set(a.link, empty());
      f(byLink.get(a.link)!);
    }
  };

  for (const c of clients) {
    bump(toAttribution(c.source), null, (m) => {
      m.registrations++;
      if (c.started) m.startedBook++;
      if (c.paid) m.sales++;
      m.revenue += c.revenue;
    });
  }
  for (const d of deals) {
    bump(toAttribution(d.utm), d.source, (m) => {
      m.leads++;
      if (!d.clientId) m.leadsWithoutClient++;
      // Продажа без заказа на сайте (договорились в чате и оплатили переводом) — учитываем по сделке.
      if (d.won && !d.hasOrder) {
        m.sales++;
        m.revenue += d.amount;
      }
    });
  }
  for (const l of clicks) {
    if (!l.clicks) continue;
    bump({ source: l.source, medium: l.medium || undefined, campaign: l.campaign || undefined, link: l.slug }, null, (m) => {
      m.clicks += l.clicks;
    });
  }

  return {
    channels: [...byChannel.entries()].map(([key, m]) => ({ key, label: channels[key], ...m })).sort((a, b) => b.revenue - a.revenue || b.registrations + b.leads - (a.registrations + a.leads)),
    campaigns: [...byCampaign.entries()].map(([key, m]) => ({ key, ...m })).sort((a, b) => b.revenue - a.revenue || b.registrations - a.registrations),
    links: byLink,
    total,
  };
}
