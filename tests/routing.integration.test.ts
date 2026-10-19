import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { rootDb, txStorage } from "@/shared/infrastructure/database";
import { DrizzleDealRepository } from "@/modules/sales/infrastructure/persistence";
import { roundRobinRouter } from "@/modules/sales/infrastructure/adapters";

/**
 * Круг на PostgreSQL: кто в круге (на смене, deals.edit, не руководитель) и порядок — меньше назначений за сегодня,
 * при равенстве — кому дольше не назначали. Сотрудники локальной базы исключаются, чтобы не мешали.
 * Запуск: INTEGRATION=1 npx vitest run tests/routing.integration.test.ts (база из DATABASE_URL).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `rt${Date.now()}`;

run("sales: круг (PostgreSQL)", () => {
  const ids: Record<string, string> = {};
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const router = roundRobinRouter({ isWorkTime: async () => true, workMinutesBetween: async () => 0, addWorkMinutes: async (from) => from }, () => "Asia/Almaty");
  // Чужие сотрудники (в т. ч. заведённые параллельными тестами) исключаются на момент каждого вызова.
  const others = async () => (await q<{ id: string }>(sql`select id from users where role = 'admin' and email not like ${tag + "%"}`)).map((r) => r.id);
  const next = async (exclude: string[] = []) => router.next([...(await others()), ...exclude]);

  beforeAll(async () => {
    const role = async (key: string | null, perms: string[]) => (await q<{ id: string }>(sql`insert into crm_roles (name, key, scope, permissions) values (${tag + key}, ${key ? tag + key : null}, 'own', ${`{${perms.join(",")}}`}::text[]) returning id`))[0].id;
    const manager = await role("m", ["deals.view", "deals.edit"]);
    const viewer = await role("v", ["deals.view"]);
    const [owner] = await q<{ id: string }>(sql`select id from crm_roles where key = 'owner'`);
    const staff = async (key: string, roleId: string, onShift = true, disabled = false) => {
      const [u] = await q<{ id: string }>(sql`insert into users (email, password_hash, name, role, crm_role_id, on_shift, staff_disabled) values (${`${tag}${key}@t.kz`}, 'x', ${key}, 'admin', ${roleId}, ${onShift}, ${disabled}) returning id`);
      ids[key] = u.id;
    };
    await staff("a", manager);
    await staff("b", manager);
    await staff("off", manager, false);
    await staff("gone", manager, true, true);
    await staff("viewer", viewer);
    if (owner) await staff("boss", owner.id);
    const [stage] = await q<{ id: string }>(sql`select id from crm_stages where kind = 'open' order by position limit 1`);
    // У «a» сегодня две заявки, у «b» — одна, но давнее: первым идёт «b».
    for (const [who, ago] of [["a", "1 hour"], ["a", "2 hours"], ["b", "3 hours"]] as const)
      await q(sql`insert into crm_deals (title, stage_id, contact_name, assignee_id, assigned_at) values (${tag}, ${stage.id}, 'К', ${ids[who]}, now() - ${ago}::interval)`);
  });
  afterAll(async () => {
    await q(sql`delete from crm_deals where title = ${tag}`);
    await q(sql`delete from users where email like ${tag + "%"}`);
    await q(sql`delete from crm_roles where name like ${tag + "%"}`);
    await pool.end();
  });

  it("в круге — только на смене, активные, с deals.edit и не руководители; первым — у кого меньше за сегодня", async () => {
    expect(await next()).toBe(ids.b);
    expect(await next([ids.b])).toBe(ids.a);
    expect(await next([ids.a, ids.b])).toBeNull();
  });

  it("при равенстве — кому дольше не назначали; блокировка работает внутри транзакции", async () => {
    await q(sql`insert into crm_deals (title, stage_id, contact_name, assignee_id, assigned_at) select ${tag}, stage_id, 'К', ${ids.b}, now() - interval '5 minutes' from crm_deals where title = ${tag} limit 1`);
    // Теперь у обоих по две за сегодня; «a» назначали час назад, «b» — 5 минут: первым «a».
    expect(await next()).toBe(ids.a);
    await rootDb.transaction((tx) => txStorage.run({ tx, events: [], aggregates: new Set() }, async () => router.lock()));
  });

  it("isActive: отключённый сотрудник — нет", async () => {
    expect([await router.isActive(ids.a), await router.isActive(ids.gone)]).toEqual([true, false]);
  });

  it("waitingForRoute: только свежие неразобранные без ответственного, без «спам/отклонить»", async () => {
    const [stage] = await q<{ id: string }>(sql`select id from crm_stages where kind = 'open' order by position limit 1`);
    const mk = async (key: string, o: { unsorted?: boolean; ago?: string; tags?: string } = {}) =>
      (await q<{ id: string }>(sql`insert into crm_deals (title, stage_id, contact_name, unsorted, created_at, tags) values (${tag + key}, ${stage.id}, 'К', ${o.unsorted ?? true}, now() - ${o.ago ?? "1 hour"}::interval, ${`{${o.tags ?? ""}}`}::text[]) returning id`))[0].id;
    const fresh = await mk("fresh");
    const old = await mk("old", { ago: "30 days" });
    const sorted = await mk("sorted", { unsorted: false });
    const spam = await mk("spam", { tags: "\"запрос: спам\"" });
    try {
      const got = await new DrizzleDealRepository().waitingForRoute(100000);
      expect(got).toContain(fresh);
      for (const id of [old, sorted, spam]) expect(got).not.toContain(id);
    } finally {
      await q(sql`delete from crm_deals where title like ${tag + "%"} and assignee_id is null`);
    }
  });
});
