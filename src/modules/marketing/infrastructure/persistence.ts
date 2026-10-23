import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { books, crmLinkClicks, crmLinks, marketingSpend, orders, users } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { zonedDay } from "@/shared/domain/time";
import type { ClientContext, LinkRepository, ReportSource, SpendRepository } from "../application";

/** Заказ клиента (алиас o) оплачен по paid_at и не отменён — выручка канала; не isPaid() из ordering (тот — по статусу). */
const paidAndNotCancelled = sql`o.paid_at is not null and o.status <> 'cancelled'`;

/** Выборки для отчёта по каналам: когорта клиентов, заявки, переходы по ссылкам. */
export const sqlReportSource: ReportSource = {
  async rows(since) {
    const from = since ? sql`${since.toISOString()}::timestamptz` : sql`'-infinity'::timestamptz`;
    const fromDay = since ? zonedDay(since) : "0000-00-00";
    const db = executor();
    const [clients, deals, clicks, spend] = await Promise.all([
      db.execute<{ source: unknown; started: boolean; paid: boolean; revenue: number }>(sql`
        select u.source,
          exists (select 1 from books b where b.user_id = u.id) as started,
          exists (select 1 from orders o where o.user_id = u.id and ${paidAndNotCancelled}) as paid,
          coalesce((select sum(o.amount) from orders o where o.user_id = u.id and ${paidAndNotCancelled}), 0)::int as revenue
        from users u where u.role = 'user' and u.created_at >= ${from}`),
      db.execute<{ utm: unknown; source: string; client_id: string | null; won: boolean; amount: number; has_order: boolean; paid: number }>(sql`
        select d.utm, d.source, d.client_id, s.kind = 'won' as won, d.amount, d.order_id is not null as has_order,
          coalesce((select sum(case when p.kind = 'refund' then -p.amount else p.amount end) from crm_payments p where p.deal_id = d.id), 0)::int as paid
        from crm_deals d join crm_stages s on s.id = d.stage_id where d.created_at >= ${from}`),
      db.execute<{ slug: string; source: string; medium: string; campaign: string; clicks: number }>(sql`
        select l.slug, l.utm_source as source, l.utm_medium as medium, l.utm_campaign as campaign, coalesce(sum(c.clicks), 0)::int as clicks
        from crm_links l left join crm_link_clicks c on c.link_id = l.id and c.day >= ${fromDay}
        group by l.id`),
      // Расход на рекламу за период по каналам — по marketing_spend_day_idx.
      db.execute<{ channel: string; amount: number }>(sql`select channel, coalesce(sum(amount), 0)::int as amount from marketing_spend where day >= ${fromDay} group by channel`),
    ]);
    return {
      clients: clients.rows,
      deals: deals.rows.map((d) => ({ utm: d.utm, source: d.source, clientId: d.client_id, won: d.won, amount: d.amount, hasOrder: d.has_order, paid: d.paid })),
      clicks: clicks.rows,
      spend: spend.rows.map((r) => ({ channel: r.channel, amount: Number(r.amount) })),
    };
  },
};

export const drizzleLinks: LinkRepository = {
  async bySlug(slug) {
    const [l] = await executor().select().from(crmLinks).where(eq(crmLinks.slug, slug.toLowerCase())).limit(1);
    return l ?? null;
  },
  all: () => executor().select().from(crmLinks).orderBy(desc(crmLinks.createdAt)),
  add: async (link) => void (await executor().insert(crmLinks).values(link)),
  setArchived: async (id, archived) => void (await executor().update(crmLinks).set({ archived }).where(eq(crmLinks.id, id))),
  async recordClick(linkId, at) {
    await executor().update(crmLinks).set({ clicks: sql`${crmLinks.clicks} + 1` }).where(eq(crmLinks.id, linkId));
    await executor()
      .insert(crmLinkClicks)
      .values({ linkId, day: zonedDay(at), clicks: 1 })
      .onConflictDoUpdate({ target: [crmLinkClicks.linkId, crmLinkClicks.day], set: { clicks: sql`${crmLinkClicks.clicks} + 1` } });
  },
};

export const drizzleClientContext: ClientContext = {
  async load(clientId) {
    if (!clientId) return { locale: "ru", order: null, book: null };
    const db = executor();
    const [[client], [order], [book]] = await Promise.all([
      db.select({ locale: users.locale }).from(users).where(eq(users.id, clientId)).limit(1),
      db.select({ id: orders.id, number: orders.number }).from(orders).where(and(eq(orders.userId, clientId), eq(orders.status, "pending_payment"))).orderBy(desc(orders.createdAt)).limit(1),
      db.select({ id: books.id, title: books.title }).from(books).where(and(eq(books.userId, clientId), eq(books.status, "draft"))).orderBy(desc(books.updatedAt)).limit(1),
    ]);
    return { locale: client?.locale ?? "ru", order: order ?? null, book: book ?? null };
  },
};

export const drizzleSpend: SpendRepository = {
  async add(row) {
    const [r] = await executor().insert(marketingSpend).values(row).returning({ id: marketingSpend.id });
    return r.id;
  },
  recent: (limit) =>
    executor()
      .select({ id: marketingSpend.id, channel: marketingSpend.channel, day: marketingSpend.day, amount: marketingSpend.amount, note: marketingSpend.note, createdAt: marketingSpend.createdAt })
      .from(marketingSpend)
      .orderBy(desc(marketingSpend.day), desc(marketingSpend.createdAt))
      .limit(limit),
  async remove(id) {
    const [r] = await executor().delete(marketingSpend).where(eq(marketingSpend.id, id)).returning({ channel: marketingSpend.channel, day: marketingSpend.day, amount: marketingSpend.amount });
    return r ?? null;
  },
};
