import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { DrizzleRewardLedger } from "@/modules/referrals/infrastructure/persistence";
import { drizzleFriendPurchases } from "@/modules/referrals/infrastructure/gateways";
import { clientReferrals } from "@/modules/reporting/infrastructure/Referrals";

/**
 * Награда за друга, купившего из чата (contacts-d7), на PostgreSQL: код-приглашение из меток сделки или первого визита
 * клиента, награда одна на сделку и одна на заказ, приглашения в карточке клиента.
 * Запуск: INTEGRATION=1 npx vitest run tests/referral-chat.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `rfc${Date.now()}`;
const code = `${tag.toUpperCase()}-AAAA`;

run("referrals: покупка из чата (PostgreSQL)", () => {
  const one = async (query: ReturnType<typeof sql>) => (await db.execute<{ id: string }>(query)).rows[0].id;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const user = (key: string, source: Record<string, string> | null = null) =>
      one(sql`insert into users (email, password_hash, name, source) values (${`${tag}-${key}@test.kz`}, 'x', ${`${tag}-${key}`}, ${source ? JSON.stringify(source) : null}::jsonb) returning id`);
    ids.asel = await user("asel");
    ids.dana = await user("dana", { source: "invite", medium: "referral", campaign: code });
    await db.execute(sql`insert into promo_codes (code, kind, value, note, owner_user_id) values (${code}, 'percent', 10, ${tag}, ${ids.asel})`);
    const won = await one(sql`select id from crm_stages where kind = 'won' order by position limit 1`);
    // Сделка без клиента, код в метках из сообщения виджета; сделка клиента, пришедшего по ссылке; повторная покупка.
    ids.chat = await one(sql`insert into crm_deals (title, stage_id, contact_name, utm) values (${tag}, ${won}, 'Мадина Ахметова', ${JSON.stringify({ source: "invite", medium: "referral", campaign: code, content: "site-widget" })}::jsonb) returning id`);
    ids.client = await one(sql`insert into crm_deals (title, stage_id, client_id) values (${tag}, ${won}, ${ids.dana}) returning id`);
    ids.repeat = await one(sql`insert into crm_deals (title, stage_id, client_id, repeat_count) values (${tag}, ${won}, ${ids.dana}, 1) returning id`);
    ids.plain = await one(sql`insert into crm_deals (title, stage_id, utm) values (${tag}, ${won}, ${JSON.stringify({ source: "instagram" })}::jsonb) returning id`);
  });

  afterAll(async () => {
    await db.execute(sql`delete from referral_rewards where referrer_id in (select id from users where email like ${`${tag}%`})`);
    await db.execute(sql`delete from crm_deals where title = ${tag}`);
    await db.execute(sql`delete from promo_codes where note = ${tag}`);
    await db.execute(sql`delete from users where email like ${`${tag}%`}`);
    await pool.end();
  });

  it("код-приглашение — из меток сделки, из первого визита клиента; повторная покупка отмечена", async () => {
    expect(await drizzleFriendPurchases.deal(ids.chat)).toMatchObject({ name: "Мадина Ахметова", clientId: null, inviteCode: code, repeat: false });
    expect(await drizzleFriendPurchases.deal(ids.client)).toMatchObject({ name: `${tag}-dana`, clientId: ids.dana, inviteCode: code, repeat: false });
    expect(await drizzleFriendPurchases.deal(ids.repeat)).toMatchObject({ inviteCode: code, repeat: true });
    expect(await drizzleFriendPurchases.deal(ids.plain)).toMatchObject({ inviteCode: null });
  });

  it("награда за сделку одна; заказ по той же сделке — без второй; карточка клиента показывает приглашения", async () => {
    const ledger = new DrizzleRewardLedger();
    const now = new Date();
    const first = await ledger.claim({ orderId: null, dealId: ids.chat, orderNumber: 88, referrerId: ids.asel, friendId: null, createdAt: now });
    expect(first).toEqual(expect.any(String));
    expect(await ledger.claim({ orderId: null, dealId: ids.chat, orderNumber: 88, referrerId: ids.asel, friendId: null, createdAt: now })).toBeNull();
    await ledger.setCode(first!, `${code}-R`);
    expect(await ledger.claim({ orderId: null, dealId: ids.client, orderNumber: 89, referrerId: ids.asel, friendId: ids.dana, createdAt: now })).toEqual(expect.any(String));
    expect((await ledger.forReferrer(ids.asel)).map((r) => [r.dealId, r.code])).toEqual(expect.arrayContaining([[ids.chat, `${code}-R`], [ids.client, null]]));

    const asel = await clientReferrals(ids.asel);
    expect(asel.code).toEqual({ code, active: true });
    expect(asel.friends.map((f) => [f.kind, f.number, f.name, f.rewardCode]).sort()).toEqual([
      ["deal", 88, "Мадина Ахметова", `${code}-R`],
      ["deal", 89, `${tag}-dana`, null],
    ]);
    expect((await clientReferrals(ids.dana)).invitedBy).toEqual({ id: ids.asel, name: `${tag}-asel` });
  });
});
