import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { attentionDeals } from "@/modules/reporting/infrastructure/Attention";
import { iso, localDay } from "@/modules/reporting/infrastructure/time";

/**
 * «Требуют внимания» на главной (bots-11, analytics-4) на PostgreSQL: бот передал — не ответили дольше норматива, счёт
 * истекает или истёк без нового, до даты события неделя — денег нет; «только свои» — свои и ничьи.
 * Запуск: INTEGRATION=1 npx vitest run tests/attention.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `att${Date.now()}`;

run("reporting: требуют внимания (PostgreSQL)", () => {
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const one = async (query: ReturnType<typeof sql>) => (await q<{ id: string }>(query))[0].id;
  const ids: Record<string, string> = {};
  const all = { userId: "00000000-0000-4000-8000-000000000000", seesAll: true };
  const mine = (rows: Awaited<ReturnType<typeof attentionDeals>>) => rows.filter((r) => Object.values(ids).includes(r.dealId)).map((r) => `${r.kind}:${Object.entries(ids).find(([, v]) => v === r.dealId)![0]}`).sort();

  beforeAll(async () => {
    ids.staff = await one(sql`insert into users (email, password_hash, name, role) values (${`${tag}-m@test.kz`}, 'x', 'М', 'admin') returning id`);
    const open = await one(sql`select id from crm_stages where kind = 'open' order by position limit 1`);
    const deal = async (key: string, o: { fields?: Record<string, string>; assignee?: string | null } = {}) =>
      (ids[key] = await one(sql`insert into crm_deals (title, stage_id, contact_name, custom_fields, assignee_id) values (${tag}, ${open}, ${key}, ${JSON.stringify(o.fields ?? {})}::jsonb, ${o.assignee ?? null}) returning id`));
    const conv = async (dealKey: string, o: { awaiting: string; handoff: string; answered?: string }) => {
      const c = await one(sql`insert into crm_conversations (channel, channel_id, chat_id, deal_id, awaiting_since, last_outgoing_at) values ('whatsapp', ${tag}, ${`${tag}${dealKey}`}, ${ids[dealKey]}, now() - ${o.awaiting}::interval, ${o.answered ? sql`now() - ${o.answered}::interval` : null}) returning id`);
      await q(sql`insert into crm_bot_events (conversation_id, kind, created_at) values (${c}, 'handoff', now() - ${o.handoff}::interval)`);
    };
    // Бот передал 40 минут назад, никто не ответил; вторая — передал 5 минут назад; третья — после передачи ответили.
    await deal("handoff");
    await conv("handoff", { awaiting: "50 minutes", handoff: "40 minutes" });
    await deal("fresh");
    await conv("fresh", { awaiting: "6 minutes", handoff: "5 minutes" });
    await deal("answered");
    await conv("answered", { awaiting: "30 minutes", handoff: "60 minutes", answered: "45 minutes" });
    // Счета: истекает через 5 часов; истёк вчера без нового; истёк, но выставлен новый.
    const invoice = (dealKey: string, status: string, expires: string, created = "now()") =>
      q(sql`insert into deal_invoices (token, deal_id, plan, agreed_total, amount, purpose, status, expires_at, created_at) values (${`${tag}${dealKey}${status}${expires}`}, ${ids[dealKey]}, 'hardcover', 30000, 15000, 'prepayment', ${status}, now() + ${expires}::interval, ${sql.raw(created)})`);
    await deal("expiring");
    await invoice("expiring", "pending_payment", "5 hours");
    await deal("expired");
    await invoice("expired", "expired", "-1 day");
    await deal("reissued");
    await invoice("reissued", "expired", "-1 day", "now() - interval '8 days'");
    await invoice("reissued", "pending_payment", "6 days");
    // Дата события через 3 дня: не оплачено; оплачено; через 20 дней. Чужая сделка — только «все».
    await deal("unpaid", { fields: { event_date: iso(localDay(3)) } });
    await deal("paid", { fields: { event_date: iso(localDay(3)) } });
    await q(sql`insert into crm_payments (deal_id, amount, kind) values (${ids.paid}, 5000, 'prepayment')`);
    await deal("far", { fields: { event_date: iso(localDay(20)) } });
    await deal("other", { fields: { event_date: iso(localDay(2)) }, assignee: ids.staff });
  });

  afterAll(async () => {
    await q(sql`delete from crm_conversations where channel_id = ${tag}`);
    await q(sql`delete from deal_invoices where token like ${tag + "%"}`);
    await q(sql`delete from crm_payments where deal_id in (select id from crm_deals where title = ${tag})`);
    await q(sql`delete from crm_deals where title = ${tag}`);
    await q(sql`delete from users where email like ${tag + "%"}`);
    await pool.end();
  });

  it("три причины и только они", async () => {
    expect(mine(await attentionDeals(all, 15, 50))).toEqual(["deadline_unpaid:other", "deadline_unpaid:unpaid", "handoff:handoff", "invoice_expired:expired", "invoice_expiring:expiring"]);
  });

  it("«только свои» не видит чужую сделку", async () => {
    const other = { userId: "00000000-0000-4000-8000-0000000000ff", seesAll: false };
    expect(mine(await attentionDeals(other, 15, 50))).not.toContain("deadline_unpaid:other");
    expect(mine(await attentionDeals({ userId: ids.staff, seesAll: false }, 15, 50))).toContain("deadline_unpaid:other");
  });
});
