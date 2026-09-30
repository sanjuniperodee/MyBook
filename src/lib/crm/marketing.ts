import "server-only";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { channelOf, channels, toAttribution, type Attribution, type ChannelKey } from "./channels";

export interface Metrics {
  clicks: number;
  registrations: number;
  startedBook: number;
  leads: number;
  sales: number;
  revenue: number;
}
const empty = (): Metrics => ({ clicks: 0, registrations: 0, startedBook: 0, leads: 0, sales: 0, revenue: 0 });

/** Конверсия в продажу: от регистраций и заявок без аккаунта на сайте. */
export const conversion = (m: Metrics & { leadsWithoutClient?: number }) => {
  const base = m.registrations + (m.leadsWithoutClient ?? 0);
  return base ? m.sales / base : null;
};

export interface Report {
  channels: (Metrics & { key: ChannelKey; label: string; leadsWithoutClient: number })[];
  campaigns: (Metrics & { key: string; source: string; medium: string; campaign: string; channel: string; leadsWithoutClient: number })[];
  links: Map<string, Metrics & { leadsWithoutClient: number }>;
  total: Metrics & { leadsWithoutClient: number };
}

/**
 * Отчёт по каналам за последние days дней (null — за всё время).
 * Клиенты — по дате регистрации и источнику первого визита; заявки (сделки) — по дате создания и их UTM;
 * выручка — оплаченные заказы клиентов когорты плюс успешные сделки без заказа (продажи в мессенджерах).
 */
export async function channelReport(days: number | null): Promise<Report> {
  const since = days ? sql`now() - make_interval(days => ${days})` : sql`'-infinity'::timestamptz`;
  const sinceDay = days ? sql`to_char((now() - make_interval(days => ${days})) at time zone 'Asia/Almaty', 'YYYY-MM-DD')` : sql`'0000-00-00'`;
  const [clients, deals, clicks] = await Promise.all([
    db.execute<{ source: unknown; started: boolean; paid: boolean; revenue: number }>(sql`
      select u.source,
        exists (select 1 from books b where b.user_id = u.id) as started,
        exists (select 1 from orders o where o.user_id = u.id and o.paid_at is not null and o.status <> 'cancelled') as paid,
        coalesce((select sum(o.amount) from orders o where o.user_id = u.id and o.paid_at is not null and o.status <> 'cancelled'), 0)::int as revenue
      from users u where u.role = 'user' and u.created_at >= ${since}`),
    db.execute<{ utm: unknown; source: string; client_id: string | null; won: boolean; amount: number; has_order: boolean }>(sql`
      select d.utm, d.source, d.client_id, s.kind = 'won' as won, d.amount, d.order_id is not null as has_order
      from crm_deals d join crm_stages s on s.id = d.stage_id where d.created_at >= ${since}`),
    db.execute<{ slug: string; source: string; medium: string; campaign: string; content: string; clicks: number }>(sql`
      select l.slug, l.utm_source as source, l.utm_medium as medium, l.utm_campaign as campaign, l.utm_content as content, coalesce(sum(c.clicks), 0)::int as clicks
      from crm_links l left join crm_link_clicks c on c.link_id = l.id and c.day >= ${sinceDay}
      group by l.id`),
  ]);

  const byChannel = new Map<ChannelKey, Metrics & { leadsWithoutClient: number }>();
  const byCampaign = new Map<string, Metrics & { source: string; medium: string; campaign: string; channel: string; leadsWithoutClient: number }>();
  const byLink = new Map<string, Metrics & { leadsWithoutClient: number }>();
  const total = { ...empty(), leadsWithoutClient: 0 };
  const bump = (a: Attribution | null, dealSource: string | null, f: (m: Metrics & { leadsWithoutClient: number }) => void) => {
    const ch = channelOf(a, dealSource);
    if (!byChannel.has(ch)) byChannel.set(ch, { ...empty(), leadsWithoutClient: 0 });
    f(byChannel.get(ch)!);
    f(total);
    if (a?.source) {
      const key = [a.source, a.medium ?? "", a.campaign ?? ""].join("|").toLowerCase();
      if (!byCampaign.has(key)) byCampaign.set(key, { ...empty(), source: a.source, medium: a.medium ?? "", campaign: a.campaign ?? "", channel: channels[ch], leadsWithoutClient: 0 });
      f(byCampaign.get(key)!);
    }
    if (a?.link) {
      if (!byLink.has(a.link)) byLink.set(a.link, { ...empty(), leadsWithoutClient: 0 });
      f(byLink.get(a.link)!);
    }
  };

  for (const c of clients.rows) {
    bump(toAttribution(c.source), null, (m) => {
      m.registrations++;
      if (c.started) m.startedBook++;
      if (c.paid) m.sales++;
      m.revenue += c.revenue;
    });
  }
  for (const d of deals.rows) {
    bump(toAttribution(d.utm), d.source, (m) => {
      m.leads++;
      if (!d.client_id) m.leadsWithoutClient++;
      // Продажа без заказа на сайте (договорились в чате и оплатили переводом) — учитываем по сделке.
      if (d.won && !d.has_order) {
        m.sales++;
        m.revenue += d.amount;
      }
    });
  }
  for (const l of clicks.rows) {
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
