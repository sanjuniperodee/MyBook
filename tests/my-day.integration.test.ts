import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { MY_DAY_LIMITS, myDay } from "@/modules/reporting/infrastructure/MyDay";
import { crmCounters } from "@/modules/reporting/infrastructure/Counters";
import { inbox } from "@/modules/reporting/infrastructure/Inbox";

/**
 * Честные числа «Моего дня» (tasks-d1) на PostgreSQL: плитка показывает настоящее число, а не длину обрезанного списка,
 * и совпадает с бейджем меню и экраном по ссылке.
 * Запуск: INTEGRATION=1 npx vitest run tests/my-day.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `md${Date.now()}`;
const sections = { chats: true, calls: true, deals: true };

run("reporting: числа «Моего дня» и бейджи меню (PostgreSQL)", () => {
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const one = async (query: ReturnType<typeof sql>) => (await q<{ id: string }>(query))[0].id;
  const ids: Record<string, string> = {};
  const viewer = () => ({ userId: ids.me, seesAll: false });
  const task = (assignee: string, due: ReturnType<typeof sql>, done = false) =>
    q(sql`insert into crm_tasks (title, assignee_id, due_at, done_at) values (${tag}, ${assignee}, ${due}, ${done ? sql`now()` : null})`);

  beforeAll(async () => {
    ids.me = await one(sql`insert into users (email, password_hash, name, role) values (${`${tag}-me@test.kz`}, 'x', ${tag}, 'admin') returning id`);
    ids.other = await one(sql`insert into users (email, password_hash, name, role) values (${`${tag}-other@test.kz`}, 'x', ${tag}, 'admin') returning id`);
  });

  afterAll(async () => {
    await q(sql`delete from crm_tasks where title = ${tag}`);
    await q(sql`delete from crm_conversations where contact_name = ${tag}`);
    await q(sql`delete from crm_calls where provider = ${tag}`);
    await q(sql`delete from users where name = ${tag}`);
    await pool.end();
  });

  it("11 задач на сегодня — плитка 11, как бейдж «Задачи»; задачи коллеги, послезавтрашние и выполненные не считаются", async () => {
    const before = await myDay(viewer(), sections);
    for (let i = 0; i < 6; i++) await task(ids.me, sql`now() - interval '2 hours'`);
    // Позже сегодня: через 30 секунд (тест не запускают за полминуты до полуночи).
    for (let i = 0; i < 5; i++) await task(ids.me, sql`now() + interval '30 seconds'`);
    await task(ids.other, sql`now() - interval '1 hour'`);
    await task(ids.me, sql`now() + interval '2 days'`);
    await task(ids.me, sql`now() - interval '1 hour'`, true);

    const after = await myDay(viewer(), sections);
    expect(after.counts.tasks - before.counts.tasks).toBe(11);
    expect(after.counts.overdueTasks - before.counts.overdueTasks).toBe(6);
    expect((await crmCounters({ userId: ids.me, scope: "own", can: () => true })).tasks).toBe(after.counts.tasks);
  });

  it("ждут ответа: 7 диалогов — 7 на плитке при списке из 6, как фильтр «Ждут ответа»; закрытый и чужой не считаются", async () => {
    const before = await myDay(viewer(), sections);
    for (let i = 0; i < 7; i++)
      await q(sql`insert into crm_conversations (channel, chat_id, contact_name, assignee_id, awaiting_since) values ('whatsapp', ${`${tag}-w${i}`}, ${tag}, ${ids.me}, now() - ${i} * interval '1 minute')`);
    await q(sql`insert into crm_conversations (channel, chat_id, contact_name, assignee_id, awaiting_since, status) values ('whatsapp', ${`${tag}-closed`}, ${tag}, ${ids.me}, now(), 'closed')`);
    await q(sql`insert into crm_conversations (channel, chat_id, contact_name, assignee_id, awaiting_since) values ('whatsapp', ${`${tag}-other`}, ${tag}, ${ids.other}, now())`);

    const after = await myDay(viewer(), sections);
    expect(after.counts.waiting - before.counts.waiting).toBe(7);
    expect(after.waiting.length).toBeLessThanOrEqual(MY_DAY_LIMITS.waiting);
    expect(await inbox(viewer(), "waiting", tag)).toHaveLength(7);
  });

  it("пропущенные: 8 за 3 дня — 8 на плитке, как бейдж «Звонки»; перезвонили и старые не считаются", async () => {
    const before = await myDay(viewer(), sections);
    const call = (i: number | string, extra: ReturnType<typeof sql> = sql`now() - interval '1 hour'`, handled = false) =>
      q(sql`insert into crm_calls (provider, external_id, direction, status, staff_id, started_at, handled_at) values (${tag}, ${`${tag}-${i}`}, 'in', 'missed', ${ids.me}, ${extra}, ${handled ? sql`now()` : null})`);
    for (let i = 0; i < 8; i++) await call(i);
    await call("handled", sql`now() - interval '1 hour'`, true);
    await call("old", sql`now() - interval '4 days'`);

    const after = await myDay(viewer(), sections);
    expect(after.counts.missed - before.counts.missed).toBe(8);
    expect(after.missed.length).toBeLessThanOrEqual(MY_DAY_LIMITS.missed);
    expect((await crmCounters({ userId: ids.me, scope: "own", can: () => true })).calls).toBe(after.counts.missed);
  });
});
