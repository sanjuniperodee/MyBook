import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { BoardsService } from "@/modules/boards/application/BoardsService";
import { CardsService } from "@/modules/boards/application/CardsService";
import { GoogleSync, type GoogleApi, type GoogleEvent, type GoogleEventInput } from "@/modules/boards/application/GoogleSync";
import { drizzleBoards } from "@/modules/boards/infrastructure/store";
import { drizzleGoogle } from "@/modules/boards/infrastructure/googleStore";
import type { BoardViewer } from "@/modules/boards";

/**
 * Google Календарь на PostgreSQL с поддельным Google: вход (state, токены, календарь), выгрузка задач, правка в CRM →
 * событие обновляется один раз, перенос в Google → срок карточки, удаление в Google → не восстанавливаем, новое событие
 * в Google → карточка на личной доске, задача перестала быть моей → событие удалено, отключение.
 * Запуск: INTEGRATION=1 npx vitest run tests/boards-google.integration.test.ts
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `ggl${Date.now()}`;

function fakeGoogle() {
  const events = new Map<string, GoogleEventInput & { etag: string }>();
  const changes: GoogleEvent[] = [];
  let seq = 0;
  const calls: string[] = [];
  const api: GoogleApi = {
    authUrl: (_c, state) => `https://accounts.google.com/auth?state=${state}`,
    exchange: async () => ({ accessToken: "at", refreshToken: "rt", expiresIn: 3600, email: "me@gmail.com", scope: "openid email https://www.googleapis.com/auth/calendar.app.created" }),
    refresh: async () => ({ accessToken: "at2", expiresIn: 3600 }),
    revoke: async () => void calls.push("revoke"),
    createCalendar: async () => (calls.push("calendar"), "cal1"),
    calendarExists: async () => true,
    deleteCalendar: async () => void calls.push("deleteCalendar"),
    upsertEvent: async (_t, _c, id, ev) => {
      const eventId = id ?? `ev${++seq}`;
      calls.push(id ? `patch:${ev.title}` : `insert:${ev.title}`);
      const etag = `e${++seq}`;
      events.set(eventId, { ...ev, etag });
      return { id: eventId, cancelled: false, title: ev.title, start: ev.start, end: ev.end, allDay: ev.allDay, updated: new Date(), etag, taskId: ev.taskId, meetUrl: ev.meet ? "https://meet.google.com/abc" : null };
    },
    deleteEvent: async (_t, _c, id) => void (calls.push(`delete:${id}`), events.delete(id)),
    changes: async () => ({ items: changes.splice(0), syncToken: "s1", reset: false }),
    watch: async () => ({ resourceId: "res1", expiresAt: new Date(Date.now() + 6 * 86_400_000) }),
    stop: async () => void calls.push("stop"),
  };
  return { api, events, changes, calls };
}

run("Google Календарь (PostgreSQL, поддельный Google)", () => {
  const clock = { now: () => new Date() };
  const notifier = { notify: async () => {}, mentions: async () => [] as string[] };
  const boards = new BoardsService(drizzleBoards, { boardChanged: async () => {} }, clock);
  const cards = new CardsService(drizzleBoards, boards, notifier, { put: async () => {}, remove: async () => {} }, clock);
  const g = fakeGoogle();
  const cfg = { clientId: "id", clientSecret: "secret", redirectUri: "https://mybooks.kz/api/integrations/google/callback", webhookUrl: "https://mybooks.kz/api/integrations/google/webhook" };
  let me: BoardViewer;
  let other: BoardViewer;
  let sync: GoogleSync;
  let boardId = "";

  beforeAll(async () => {
    const { rows } = await db.execute<{ id: string }>(sql`insert into users (email, name, role, password_hash) values (${`${tag}a@x.kz`}, 'Анна', 'admin', 'x'), (${`${tag}b@x.kz`}, 'Борис', 'admin', 'x') returning id`);
    me = { userId: rows[0].id, name: "Анна", seesAll: true, allTasks: true, manageBoards: false };
    other = { ...me, userId: rows[1].id, name: "Борис" };
    sync = new GoogleSync(g.api, drizzleGoogle, async () => cfg, { sign: (p) => `${p}.sig`, verify: (s) => (s.endsWith(".sig") ? s.slice(0, -4) : null) }, cards, boards, async (id) => (id === me.userId ? me : id === other.userId ? other : null), clock, "https://mybooks.kz");
    boardId = await boards.create(me, { name: `${tag} проект`, template: "project" });
  });

  afterAll(async () => {
    await db.execute(sql`delete from crm_tasks where board_id in (select id from crm_boards where owner_id in (select id from users where email like ${`${tag}%`}))`);
    await db.execute(sql`delete from crm_boards where owner_id in (select id from users where email like ${`${tag}%`})`);
    await db.execute(sql`delete from users where email like ${`${tag}%`}`);
    await pool.end();
  });

  it("вход: state сотрудника, календарь «MyBooks CRM», канал; задачи со сроком — событиями", async () => {
    const id = await cards.create(me, { boardId, title: "Встреча с типографией", kind: "meeting", dueAt: new Date(Date.now() + 86_400_000).toISOString(), assigneeIds: [me.userId] });
    await cards.update(me, id, { meet: true });
    const url = await sync.connectUrl(me);
    const state = decodeURIComponent(url.split("state=")[1]);
    expect(await sync.finish("code", state)).toBe(me.userId);
    expect(g.calls).toContain("calendar");
    expect(g.calls).toContain("insert:Встреча с типографией");
    const st = await sync.status(me);
    expect(st).toMatchObject({ configured: true, connected: true, email: "me@gmail.com", push: true });
    expect((await cards.detail(me, id)).meetUrl).toBe("https://meet.google.com/abc");
    await expect(sync.finish("code", `${other.userId}.1.sig`)).rejects.toMatchObject({ code: "invalid" });
  });

  it("правка в CRM — событие обновляется один раз; без изменений — запросов нет", async () => {
    const [card] = (await boards.view(me, boardId)).cards;
    g.calls.length = 0;
    await cards.update(me, card.id, { title: "Встреча с типографией: тираж" });
    await sync.syncOne(me.userId);
    await sync.syncOne(me.userId);
    expect(g.calls).toEqual(["patch:Встреча с типографией: тираж"]);
  });

  it("перенос события в Google — срок карточки; удаление в Google — событие не восстанавливается", async () => {
    const [card] = (await boards.view(me, boardId)).cards;
    const [eventId] = [...g.events.keys()];
    const start = new Date(Date.now() + 3 * 86_400_000);
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60_000);
    g.changes.push({ id: eventId, cancelled: false, title: "Встреча с типографией: тираж", start, end, allDay: false, updated: new Date(), etag: "changed", taskId: card.id, meetUrl: null });
    await drizzleGoogle.updateAccount(me.userId, { pullRequestedAt: new Date(Date.now() + 1000) });
    await sync.syncOne(me.userId);
    expect((await cards.summary(me, card.id)).dueAt).toBe(end.toISOString());
    g.calls.length = 0;
    g.changes.push({ id: eventId, cancelled: true, title: "", start: null, end: null, allDay: false, updated: new Date(), etag: "gone", taskId: card.id, meetUrl: null });
    await drizzleGoogle.updateAccount(me.userId, { pullRequestedAt: new Date(Date.now() + 2000) });
    await sync.syncOne(me.userId);
    await sync.syncOne(me.userId);
    expect(g.calls.filter((c) => c.startsWith("insert") || c.startsWith("patch"))).toEqual([]);
  });

  it("новое событие в календаре «MyBooks CRM» — карточка на личной доске", async () => {
    const start = new Date(Date.now() + 5 * 86_400_000);
    g.changes.push({ id: "user-ev", cancelled: false, title: "Позвонить в типографию", start, end: new Date(start.getTime() + 30 * 60_000), allDay: false, updated: new Date(), etag: "u1", taskId: null, meetUrl: null });
    await drizzleGoogle.updateAccount(me.userId, { pullRequestedAt: new Date(Date.now() + 3000) });
    await sync.syncOne(me.userId);
    const personal = (await boards.list(me)).find((b) => b.kind === "personal" && b.ownerId === me.userId);
    expect(personal).toBeTruthy();
    const card = (await boards.view(me, personal!.id)).cards.find((c) => c.title === "Позвонить в типографию");
    expect(card?.assigneeIds).toEqual([me.userId]);
    expect(g.calls).toContain("patch:Позвонить в типографию");
  });

  it("задача перестала быть моей — событие удалено; отключение — календарь удалён, доступ отозван", async () => {
    const id = await cards.create(me, { boardId, title: "Передам Борису", dueAt: new Date(Date.now() + 86_400_000).toISOString(), assigneeIds: [me.userId] });
    await sync.syncOne(me.userId);
    g.calls.length = 0;
    await cards.setAssignees(me, id, [other.userId]);
    await sync.syncOne(me.userId);
    expect(g.calls.some((c) => c.startsWith("delete:"))).toBe(true);
    await sync.disconnect(me);
    expect(g.calls).toEqual(expect.arrayContaining(["stop", "deleteCalendar", "revoke"]));
    expect((await sync.status(me)).connected).toBe(false);
  });
});
