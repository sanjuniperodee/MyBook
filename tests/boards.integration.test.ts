import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { BoardsService } from "@/modules/boards/application/BoardsService";
import { CardsService } from "@/modules/boards/application/CardsService";
import { CalendarService } from "@/modules/boards/application/CalendarService";
import { drizzleBoards } from "@/modules/boards/infrastructure/store";
import { drizzleFeeds } from "@/modules/boards/infrastructure/calendar";
import type { BoardViewer } from "@/modules/boards";

/**
 * Доски задач на PostgreSQL (миграция 0109): доска по шаблону, перенос с позициями и «Готово», правила (чек-лист в
 * колонке, назначить перенёсшего, срок прошёл → метка и её снятие), соисполнители в «Моём дне», повтор, iCal.
 * Запуск: INTEGRATION=1 npx vitest run tests/boards.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `brd${Date.now()}`;

run("доски задач (PostgreSQL)", () => {
  const clock = { now: () => new Date() };
  const sent: { ids: string[]; title: string; body?: string }[] = [];
  const notifier = { notify: async (ids: (string | null | undefined)[], n: { title: string; body?: string }) => void sent.push({ ids: ids.filter(Boolean) as string[], title: n.title, body: n.body }), mentions: async () => [] as string[] };
  const files = new Map<string, Uint8Array>();
  const boards = new BoardsService(drizzleBoards, { boardChanged: async () => {} }, clock);
  const cards = new CardsService(drizzleBoards, boards, notifier, { put: async (k, d) => void files.set(k, d), remove: async (k) => void files.delete(k) }, clock);
  let me: BoardViewer;
  let other: BoardViewer;
  let boardId = "";

  beforeAll(async () => {
    const { rows } = await db.execute<{ id: string }>(sql`insert into users (email, name, role, password_hash) values (${`${tag}a@x.kz`}, ${`${tag} Анна`}, 'admin', 'x'), (${`${tag}b@x.kz`}, ${`${tag} Борис`}, 'admin', 'x') returning id`);
    me = { userId: rows[0].id, name: "Анна", seesAll: true, allTasks: false, manageBoards: false };
    other = { userId: rows[1].id, name: "Борис", seesAll: false, allTasks: false, manageBoards: false };
  });

  afterAll(async () => {
    if (boardId) await db.execute(sql`delete from crm_tasks where board_id = ${boardId}`);
    await db.execute(sql`delete from crm_boards where name like ${`${tag}%`}`);
    await db.execute(sql`delete from users where email like ${`${tag}%`}`);
    await pool.end();
  });

  it("проект по шаблону: колонки, метки, правило «срок прошёл»; закрытая — видна только участникам", async () => {
    boardId = await boards.create(me, { name: `${tag} Запуск`, template: "project" });
    const view = await boards.view(me, boardId);
    expect(view.columns.map((c) => c.name)).toEqual(["Идеи", "План", "В работе", "Проверка", "Готово"]);
    expect(view.columns.at(-1)?.done).toBe(true);
    expect(view.labels[0].name).toBe("Просрочено");
    expect(view.rules.map((r) => r.trigger.type)).toContain("card.overdue");
    expect(view.board.canManage).toBe(true);
    await expect(boards.view(other, boardId)).rejects.toMatchObject({ code: "notFound" });
    await boards.setMember(me, boardId, other.userId, "member");
    expect((await boards.view(other, boardId)).board.canManage).toBe(false);
  });

  it("общую доску отдела без права «Доски» не завести", async () => {
    await expect(boards.create(me, { name: `${tag} Отдел`, template: "sales" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("карточка: создание, перенос между соседями, «Готово» ставит выполнение, обратно — снимает", async () => {
    const view = await boards.view(me, boardId);
    const [ideas, plan, , , done] = view.columns;
    const a = await cards.create(me, { boardId, title: "A", columnId: ideas.id });
    const b = await cards.create(me, { boardId, title: "B", columnId: ideas.id });
    const c = await cards.create(me, { boardId, title: "C", columnId: ideas.id, at: "top" });
    let list = (await boards.view(me, boardId)).cards.filter((x) => x.columnId === ideas.id).sort((x, y) => x.position! - y.position!);
    expect(list.map((x) => x.title)).toEqual(["C", "A", "B"]);
    await cards.move(me, b, { columnId: ideas.id, beforeId: c, afterId: a });
    list = (await boards.view(me, boardId)).cards.filter((x) => x.columnId === ideas.id).sort((x, y) => x.position! - y.position!);
    expect(list.map((x) => x.title)).toEqual(["C", "B", "A"]);
    await cards.move(me, a, { columnId: done.id });
    let card = await cards.summary(me, a);
    expect(card.doneAt).not.toBeNull();
    expect(card.columnId).toBe(done.id);
    await cards.move(me, a, { columnId: plan.id });
    card = await cards.summary(me, a);
    expect(card.doneAt).toBeNull();
    const detail = await cards.detail(me, a);
    expect(detail.activity.map((x) => x.kind)).toEqual(expect.arrayContaining(["created", "moved"]));
  });

  it("правило «попала в колонку → назначить перенёсшего и чек-лист», «чек-лист выполнен → в Готово»", async () => {
    const view = await boards.view(me, boardId);
    const [ideas, , work, check, done] = view.columns;
    await boards.addRule(me, boardId, { name: "В работу", trigger: { type: "card.moved", columnId: work.id }, actions: [{ type: "assign", userId: "mover" }, { type: "add_checklist", title: "Шаги", items: ["Раз", "Два"] }] });
    await boards.addRule(me, boardId, { name: "Чек-лист → проверка", trigger: { type: "checklist.completed" }, actions: [{ type: "move", columnId: check.id }] });
    const id = await cards.create(me, { boardId, title: "Правила", columnId: ideas.id });
    await cards.move(me, id, { columnId: work.id });
    let d = await cards.detail(me, id);
    expect(d.assigneeIds).toEqual([me.userId]);
    expect(d.checklists[0].items.map((i) => i.text)).toEqual(["Раз", "Два"]);
    for (const i of d.checklists[0].items) await cards.updateItem(me, i.id, { done: true });
    d = await cards.detail(me, id);
    expect(d.columnId).toBe(check.id);
    expect(d.activity.some((x) => x.kind === "rule")).toBe(true);
    expect(done.done).toBe(true);
  });

  it("соисполнитель видит карточку в «Моём дне», новому исполнителю — одно уведомление", async () => {
    const id = await cards.create(me, { boardId, title: "Вдвоём", dueAt: new Date(Date.now() + 3600_000).toISOString() });
    sent.length = 0;
    await cards.setAssignees(me, id, [me.userId, other.userId]);
    expect(sent).toHaveLength(1);
    expect(sent[0].ids).toEqual([other.userId]);
    const { rows } = await db.execute<{ n: number }>(sql`select count(*)::int as n from crm_task_members where task_id = ${id} and user_id = ${other.userId} and role = 'assignee'`);
    expect(rows[0].n).toBe(1);
    expect((await cards.summary(other, id)).assigneeIds).toEqual([me.userId, other.userId]);
  });

  it("срок прошёл → метка «Просрочено» (один раз); срок перенесли вперёд — метка снимается", async () => {
    const id = await cards.create(me, { boardId, title: "Горит" });
    await db.execute(sql`update crm_tasks set due_at = now() - interval '2 hours' where id = ${id}`);
    await cards.sweepOverdue();
    await cards.sweepOverdue();
    const label = (await boards.view(me, boardId)).labels[0].id;
    expect((await cards.summary(me, id)).labelIds).toEqual([label]);
    await cards.update(me, id, { dueAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect((await cards.summary(me, id)).labelIds).toEqual([]);
  });

  it("повтор: выполнили — следующая карточка с новым сроком, исполнителями и чек-листом", async () => {
    const due = new Date(Date.now() + 3600_000);
    const id = await cards.create(me, { boardId, title: "Еженедельный отчёт", dueAt: due.toISOString(), assigneeIds: [me.userId] });
    await cards.update(me, id, { recurrence: { freq: "weekly", interval: 1 } });
    await cards.addChecklist(me, id, "Отчёт", ["Цифры"]);
    await cards.setDone(me, id, true);
    expect(await cards.spawnRecurring()).toBeGreaterThanOrEqual(1);
    const next = (await boards.view(me, boardId)).cards.find((c) => c.title === "Еженедельный отчёт" && !c.doneAt)!;
    expect(new Date(next.dueAt!).getTime() - due.getTime()).toBe(7 * 86_400_000);
    expect(next.recurring).toBe(true);
    expect(next.checklist).toEqual({ done: 0, total: 1 });
    expect(await cards.spawnRecurring()).toBe(0);
  });

  it("вложение: в хранилище, первая картинка — обложка; удаление карточки убирает файл", async () => {
    const id = await cards.create(me, { boardId, title: "С файлом" });
    const att = await cards.attach(me, id, { name: "макет.png", type: "image/png", data: new Uint8Array([1, 2, 3]) });
    const s = await cards.summary(me, id);
    expect(s.cover).toEqual({ image: `/api/admin/tasks/${id}/files/${att}` });
    expect(files.size).toBeGreaterThan(0);
    await cards.remove(me, id);
    expect([...files.keys()].some((k) => k.includes(id))).toBe(false);
  });

  it("календарь и iCal: карточки с сроком в периоде, лента — только мои, без данных клиента", async () => {
    const cal = new CalendarService(drizzleBoards, drizzleFeeds, async (uid) => (uid === me.userId ? me : null), clock, "https://mybooks.kz");
    const due = new Date(Date.now() + 2 * 86_400_000);
    const id = await cards.create(me, { boardId, title: "Встреча; с клиентом", kind: "meeting", dueAt: due.toISOString(), assigneeIds: [me.userId] });
    const range = await cal.range(me, new Date(Date.now()), new Date(Date.now() + 7 * 86_400_000), { boardId });
    expect(range.some((c) => c.id === id)).toBe(true);
    const url = await cal.issueFeed(me);
    const token = url.split("/").pop()!.replace(".ics", "");
    const ics = (await cal.feed(token))!;
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:Встреча\\; с клиентом");
    expect(ics).toContain(`/admin/tasks/${id}`);
    await cal.revokeFeed(me);
    expect(await cal.feed(token)).toBeNull();
  });

  it("массовые действия: перенос и метка нескольким карточкам", async () => {
    const view = await boards.view(me, boardId);
    const ids = [await cards.create(me, { boardId, title: "M1" }), await cards.create(me, { boardId, title: "M2" })];
    const col = view.columns[1];
    expect(await cards.bulk(me, ids, { type: "move", columnId: col.id })).toEqual({ done: 2, failed: 0 });
    expect(await cards.bulk(me, ids, { type: "label", labelId: view.labels[1].id, on: true })).toEqual({ done: 2, failed: 0 });
    const after = (await boards.view(me, boardId)).cards.filter((c) => ids.includes(c.id));
    expect(after.every((c) => c.columnId === col.id && c.labelIds.includes(view.labels[1].id))).toBe(true);
  });

  it("правило CRM: карточка заказа на доске (одна на сделку), перенос по статусу заказа в колонку", async () => {
    const view = await boards.view(me, boardId);
    const { rows } = await db.execute<{ id: string }>(sql`insert into crm_deals (title, contact_name, stage_id) values (${`${tag} сделка`}, 'Алия', (select id from crm_stages limit 1)) returning id`);
    const dealId = rows[0].id;
    const id = await cards.createFromRule({ boardId, title: "Книга для Алии", dealId, checklist: { title: "Шаги", items: ["Макет", "Печать"] } });
    expect(id).toBeTruthy();
    expect(await cards.createFromRule({ boardId, title: "Книга для Алии", dealId })).toBeNull();
    expect(await cards.moveFromRule({ boardId, columnId: view.columns[3].id, orderId: null, dealId })).toBe(true);
    const s = await cards.summary(me, id!);
    expect(s.columnId).toBe(view.columns[3].id);
    expect(s.checklist.total).toBe(2);
    expect(await cards.moveFromRule({ boardId, columnId: view.columns[3].id, orderId: null, dealId: "00000000-0000-0000-0000-000000000001" })).toBe(false);
    await db.execute(sql`delete from crm_deals where id = ${dealId}`);
  });

  it("доска по умолчанию показывает и задачи без доски (из сделок и правил)", async () => {
    const def = await drizzleBoards.defaultBoard();
    expect(def?.isDefault).toBe(true);
    const { rows } = await db.execute<{ id: string }>(sql`insert into crm_tasks (title, kind, assignee_id) values (${`${tag} без доски`}, 'call', ${me.userId}) returning id`);
    const v = await boards.view({ ...me, allTasks: true }, def!.id);
    const card = v.cards.find((c) => c.id === rows[0].id);
    expect(card?.columnId).toBe(v.columns.find((c) => !c.done)?.id);
    await db.execute(sql`delete from crm_tasks where id = ${rows[0].id}`);
  });
});
