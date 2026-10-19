import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { notifyOwnerOr } from "@/modules/workspace/infrastructure/notify";

/**
 * Уведомление ответственному или всем с правом (PostgreSQL): ответственный отключён — как без ответственного. Задача по
 * нему уже ничья (TasksService.createSystem), и уведомление не должно уйти тому, кто его не увидит (tasks-d4).
 * Запуск: INTEGRATION=1 npx vitest run tests/notify.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `nt${Date.now()}`;

run("workspace: уведомление ответственному или всем с правом (PostgreSQL)", () => {
  const ids: Record<string, string> = {};
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const got = async (title: string) => (await q<{ user_id: string }>(sql`select user_id from crm_notifications where title = ${title}`)).map((r) => r.user_id);

  beforeAll(async () => {
    const [role] = await q<{ id: string }>(sql`insert into crm_roles (name, key, scope, permissions) values (${tag}, ${tag}, 'all', ${"{orders.view}"}::text[]) returning id`);
    const staff = async (key: string, disabled = false) => {
      const [u] = await q<{ id: string }>(sql`insert into users (email, password_hash, name, role, crm_role_id, staff_disabled) values (${`${tag}${key}@t.kz`}, 'x', ${key}, 'admin', ${role.id}, ${disabled}) returning id`);
      ids[key] = u.id;
    };
    await staff("active");
    await staff("gone", true);
  });
  afterAll(async () => {
    await q(sql`delete from crm_notifications where title like ${tag + "%"}`);
    await q(sql`delete from users where email like ${tag + "%"}`);
    await q(sql`delete from crm_roles where name = ${tag}`);
    await pool.end();
  });

  it("действующему ответственному — только ему", async () => {
    await notifyOwnerOr(ids.active, "orders.view", { kind: "task", title: `${tag} свой`, push: false });
    expect(await got(`${tag} свой`)).toEqual([ids.active]);
  });

  it("ответственный отключён — всем с правом (и не ему)", async () => {
    await notifyOwnerOr(ids.gone, "orders.view", { kind: "task", title: `${tag} отключён`, push: false });
    const to = await got(`${tag} отключён`);
    expect(to).toContain(ids.active);
    expect(to).not.toContain(ids.gone);
  });
});
