import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { drizzleLandingVisits } from "@/modules/marketing/infrastructure/persistence";
import type { LandingVisitInput } from "@/modules/marketing/application";

/**
 * Переходы на лендинг на PostgreSQL: заход и нажатие по одному коду, cookie пикселя с нажатия, свободные нажатия
 * в окне, привязка «только свободного» и по коду поверх.
 * Запуск: INTEGRATION=1 npx vitest run tests/landing-visits.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const suffix = Date.now().toString(36).slice(-4).replace(/[01ilo]/g, "x");
const code = (c: string) => `lp${c}${suffix}`.slice(0, 8);

const visit = (p: Partial<LandingVisitInput>): LandingVisitInput => ({
  code: code("aa"),
  landing: "podarok",
  utmSource: "instagram",
  utmMedium: "paid",
  utmCampaign: "it",
  utmContent: "",
  utmTerm: "",
  fbclid: "",
  fbp: "",
  fbc: "",
  campaignId: "",
  adsetId: "",
  adId: "",
  placement: "",
  referrer: "",
  userAgent: "test",
  device: "iphone",
  inApp: "instagram",
  ...p,
});

run("marketing: переходы на лендинг (PostgreSQL)", () => {
  const codes = [code("aa"), code("bb")];
  const convs: string[] = [];
  afterAll(async () => {
    await db.execute(sql`delete from landing_visits where code in (${sql.join(codes.map((c) => sql`${c}`), sql`, `)})`);
    for (const id of convs) await db.execute(sql`delete from crm_conversations where id = ${id}`);
    await pool.end();
  });

  it("заход, нажатие, поиск свободных и привязка", async () => {
    await drizzleLandingVisits.record(visit({ code: codes[0] }), null);
    const clicked = new Date();
    await drizzleLandingVisits.record(visit({ code: codes[0], utmCampaign: "other", fbp: "fb.1.2.3" }), clicked);
    await drizzleLandingVisits.record(visit({ code: codes[0] }), new Date(clicked.getTime() + 60_000));
    const v = await drizzleLandingVisits.byCode(codes[0]);
    expect(v).toMatchObject({ utmCampaign: "it", conversationId: null });
    expect(v!.clickedAt!.getTime()).toBe(clicked.getTime());
    const [{ fbp }] = (await db.execute<{ fbp: string }>(sql`select fbp from landing_visits where code = ${codes[0]}`)).rows;
    expect(fbp).toBe("fb.1.2.3");

    const free = await drizzleLandingVisits.freeClicks(new Date(clicked.getTime() - 1000), new Date(clicked.getTime() + 1000));
    expect(free.map((f) => f.code)).toContain(codes[0]);

    const ids: string[] = [];
    for (const chat of ["it-a", "it-b"]) {
      const { rows } = await db.execute<{ id: string }>(sql`insert into crm_conversations (channel, channel_id, chat_id) values ('whatsapp', 'it', ${`${chat}-${suffix}`}) returning id`);
      ids.push(rows[0].id);
    }
    convs.push(...ids);
    expect(await drizzleLandingVisits.claim(v!.id, ids[0], "time", new Date(), true)).toBe(true);
    expect(await drizzleLandingVisits.claim(v!.id, ids[1], "time", new Date(), true)).toBe(false);
    expect((await drizzleLandingVisits.freeClicks(new Date(clicked.getTime() - 1000), new Date(clicked.getTime() + 1000))).map((f) => f.code)).not.toContain(codes[0]);
    expect(await drizzleLandingVisits.claim(v!.id, ids[1], "code", new Date(), false)).toBe(true);
    expect((await drizzleLandingVisits.byCode(codes[0]))!.conversationId).toBe(ids[1]);
  });
});
