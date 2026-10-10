import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { books, crmLinkClicks, crmLinks, orders, users } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import type { ClientContext, LinkRepository, ReportSource } from "../application";

const almatyDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "Asia/Almaty" }).format(d);

/** Выборки для отчёта по каналам: когорта клиентов, заявки, переходы по ссылкам. */
export const sqlReportSource: ReportSource = {
  async rows(since) {
    const from = since ? sql`${since.toISOString()}::timestamptz` : sql`'-infinity'::timestamptz`;
    const fromDay = since ? almatyDay(since) : "0000-00-00";
    const db = executor();
    const [clients, deals, clicks] = await Promise.all([
      db.execute<{ source: unknown; started: boolean; paid: boolean; revenue: number }>(sql`
        select u.source,
          exists (select 1 from books b where b.user_id = u.id) as started,
          exists (select 1 from orders o where o.user_id = u.id and o.paid_at is not null and o.status <> 'cancelled') as paid,
          coalesce((select sum(o.amount) from orders o where o.user_id = u.id and o.paid_at is not null and o.status <> 'cancelled'), 0)::int as revenue
        from users u where u.role = 'user' and u.created_at >= ${from}`),
      db.execute<{ utm: unknown; source: string; client_id: string | null; won: boolean; amount: number; has_order: boolean; paid: number }>(sql`
        select d.utm, d.source, d.client_id, s.kind = 'won' as won, d.amount, d.order_id is not null as has_order,
          coalesce((select sum(case when p.kind = 'refund' then -p.amount else p.amount end) from crm_payments p where p.deal_id = d.id), 0)::int as paid
        from crm_deals d join crm_stages s on s.id = d.stage_id where d.created_at >= ${from}`),
      db.execute<{ slug: string; source: string; medium: string; campaign: string; clicks: number }>(sql`
        select l.slug, l.utm_source as source, l.utm_medium as medium, l.utm_campaign as campaign, coalesce(sum(c.clicks), 0)::int as clicks
        from crm_links l left join crm_link_clicks c on c.link_id = l.id and c.day >= ${fromDay}
        group by l.id`),
    ]);
    return {
      clients: clients.rows,
      deals: deals.rows.map((d) => ({ utm: d.utm, source: d.source, clientId: d.client_id, won: d.won, amount: d.amount, hasOrder: d.has_order, paid: d.paid })),
      clicks: clicks.rows,
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
      .values({ linkId, day: almatyDay(at), clicks: 1 })
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
