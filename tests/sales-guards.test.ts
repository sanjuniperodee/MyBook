import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderingError } from "@/modules/ordering/domain";
import { anna, fake, kira, lena, owner, Redirect, resetContainer, resetRequest, sasha, signIn } from "./doubles/web";

const notified = vi.hoisted(() => ({ calls: [] as { to: string[]; title: string; link: string }[] }));

vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);
vi.mock("next/navigation", async () => (await import("./doubles/web")).nextNavigation);
vi.mock("next/cache", async () => (await import("./doubles/web")).nextCache);
vi.mock("@/server/container", async () => (await import("./doubles/web")).containerModule);
vi.mock("@/shared/infrastructure/database", () => ({ rootDb: {}, executor: () => ({}) }));
vi.mock("@/modules/workspace", () => ({
  notify: async (to: string[], n: { title: string; link: string }) => void notified.calls.push({ to, title: n.title, link: n.link }),
  notifyMentions: async () => {},
  staffNotifier: { notifyAllWith: async () => {} },
  listFields: async () => [],
  readFieldValues: () => ({}),
  getSetting: async () => "",
}));

const { bulkDealsAction, createDealAction, linkDealClientAction, moveDealAction } = await import("@/app/admin/deals/actions");
const { assignOrderAction, bulkStatusAction, createTaskAction, reviewOrderPaymentAction } = await import("@/app/admin/actions");
const { restoreCard } = await import("@/app/admin/deals/DealsBoard");
const { bulkStatusText } = await import("@/app/admin/orders/OrdersTable");
const { keepVisible } = await import("@/components/admin/useRowSelection");
const { textOn } = await import("@/lib/readable-text");

const id = (n: number) => `0d0d0d0d-0000-4000-8000-${String(n).padStart(12, "0")}`;
const STAGE = id(901);
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeEach(() => {
  resetRequest();
  resetContainer();
  notified.calls = [];
});

describe("Сделки: перенос, массовое назначение, привязка клиента", () => {
  let log: string[];
  const deal = (n: number, over: Record<string, unknown> = {}) => ({ id: id(n), number: n, title: `Сделка ${n}`, assigneeId: "boss", clientId: null, unsorted: false, stageId: STAGE, ...over });
  let deals: ReturnType<typeof deal>[];

  beforeEach(() => {
    log = [];
    deals = [deal(1)];
    fake.sales = {
      deals: {
        findById: async (dealId: string) => deals.find((d) => d.id === dealId) ?? null,
        findByIds: async (ids: string[]) => deals.filter((d) => ids.includes(d.id)),
        stage: async (stageId: string) => ({ id: stageId, kind: stageId === id(902) ? "lost" : "open" }),
        move: async (dealId: string, stageId: string) => void log.push(`move:${dealId === id(1) ? 1 : dealId}:${stageId === STAGE ? "same" : "other"}`),
        acceptByStaff: async () => (log.push("accept"), { assigneeId: "boss" }),
        assign: async (dealId: string, to: string | null) => void log.push(`assign:${deals.find((d) => d.id === dealId)?.number}:${to}`),
        note: async (d: { number: number }, text: string) => void log.push(`note:${d.number}:${text}`),
        linkClient: async (_dealId: string, clientId: string | null) => void log.push(`link:${clientId}`),
      },
    };
    fake.messaging = { chats: { assignDealConversations: async () => void log.push("chats") } };
    fake.access = { ...fake.access, queries: { activeStaff: async (staffId: string) => (staffId === id(500) ? { id: staffId, name: "Аня", email: "a@b.kz" } : null) } };
  });

  it("неразобранную заявку бросили на её же этап — это «Принять», а не пустой перенос", async () => {
    signIn(owner);
    deals = [deal(1, { unsorted: true })];
    expect(await moveDealAction(id(1), STAGE)).toEqual({ ok: true });
    expect(log).toEqual(["accept", "chats"]);
  });

  it("отказ без причины и чужая сделка — текстом, а не исключением", async () => {
    signIn(owner);
    expect(await moveDealAction(id(1), id(902))).toEqual({ ok: false, message: "Укажите причину отказа" });
    signIn(lena);
    expect(await moveDealAction(id(1), id(903))).toMatchObject({ ok: false, message: expect.any(String) });
    expect(log).toEqual([]);
  });

  it("массовое назначение: только действующему сотруднику, запись в историю и одно уведомление на пачку", async () => {
    signIn(owner);
    deals = [deal(1), deal(2), deal(3, { assigneeId: id(500) })];
    expect(await bulkDealsAction([id(1)], { op: "assign", userId: id(777) })).toEqual({ done: 0, skipped: 1, error: "Сотрудник не найден" });
    expect(log).toEqual([]);
    expect(await bulkDealsAction([id(1), id(2), id(3)], { op: "assign", userId: id(500) })).toEqual({ done: 3, skipped: 0 });
    // Сделка Д3 уже была её — без записи и уведомления о ней.
    expect(log).toEqual([`note:1:Ответственный: Аня`, `assign:1:${id(500)}`, `note:2:Ответственный: Аня`, `assign:2:${id(500)}`, `assign:3:${id(500)}`]);
    expect(notified.calls).toEqual([{ to: [id(500)], title: "Вам передали сделки: 2", link: "/admin/deals?mine=1&view=list" }]);
  });

  it("массовое назначение одной сделки — уведомление ведёт на её карточку", async () => {
    signIn(owner);
    await bulkDealsAction([id(1)], { op: "assign", userId: id(500) });
    expect(notified.calls).toEqual([{ to: [id(500)], title: "Вам передали сделку Д1", link: `/admin/deals/${id(1)}` }]);
  });

  it("привязать к сделке можно только видимого клиента сайта: не сотрудника и не клиента другого менеджера", async () => {
    const people: Record<string, { id: string; role: string; managerId: string | null }> = {
      [id(10)]: { id: id(10), role: "user", managerId: null },
      [id(11)]: { id: id(11), role: "admin", managerId: null },
      [id(12)]: { id: id(12), role: "user", managerId: "anna" },
    };
    fake.reporting = { clientById: async (clientId: string) => people[clientId] ?? null };
    deals = [deal(1, { assigneeId: "kira" })];
    signIn(kira);
    expect(await linkDealClientAction(id(1), id(11))).toEqual({ ok: false, message: "Клиент не найден" });
    expect(await linkDealClientAction(id(1), id(12))).toEqual({ ok: false, message: "Клиент не найден" });
    expect(await linkDealClientAction(id(1), id(13))).toEqual({ ok: false, message: "Клиент не найден" });
    expect(log).toEqual([]);
    expect(await linkDealClientAction(id(1), id(10))).toEqual({ ok: true });
    expect(log).toEqual([`link:${id(10)}`]);
  });

  it("новая сделка на клиента: чужой клиент — отказ; номер скрыт ролью — сервер берёт его у клиента", async () => {
    const created: { contactPhone: string | null; clientId: string | null }[] = [];
    Object.assign(fake.sales.deals as object, { create: async (d: { contactPhone: string | null; clientId: string | null }) => (created.push(d), { id: id(50), number: 50, clientId: d.clientId }) });
    fake.reporting = {
      clientById: async (clientId: string) => (clientId === id(20) ? { id: id(20), role: "user", managerId: "kira", phone: "77011234567" } : { id: clientId, role: "user", managerId: "anna", phone: "77070000000" }),
    };
    signIn(kira);
    expect(await createDealAction({}, form({ title: "Книга маме", clientId: id(21) }))).toEqual({ error: "Клиент не найден" });
    await expect(createDealAction({}, form({ title: "Книга маме", clientId: id(20) }))).rejects.toBeInstanceOf(Redirect);
    expect(created).toMatchObject([{ clientId: id(20), contactPhone: "77011234567" }]);
  });
});

describe("Заказы и задачи: видимость и проверка оплат", () => {
  beforeEach(() => {
    // Заказ id(2) — чужого клиента, остальные — клиентов Анны.
    fake.reporting = { orderOwnership: async (orderId: string) => ({ managerId: orderId === id(2) ? "other" : anna.id, assigneeId: null }) };
  });

  it("ответственный за чужой заказ — отказ текстом, а не исключением", async () => {
    let assigned = 0;
    fake.ordering = { orders: { assign: async () => void assigned++ } };
    signIn(anna);
    expect(await assignOrderAction(id(2), null)).toEqual({ error: "Недостаточно прав для этого действия" });
    expect(await assignOrderAction(id(1), null)).toEqual({ ok: "Сохранено" });
    expect(assigned).toBe(1);
  });

  it("массовая смена статуса: пропущенные — по причинам, а не все «не оплачены»", async () => {
    fake.ordering = {
      orders: {
        changeStatus: async ({ orderId }: { orderId: string }) => {
          if (orderId === id(3)) throw new OrderingError("paymentRule", "не оплачен — в печать только с постоплатой");
        },
      },
    };
    signIn(anna);
    const res = await bulkStatusAction([id(1), id(2), id(3)], "in_production");
    expect(res).toEqual({ count: 1, skipped: 2, reasons: [{ reason: "нет доступа", count: 1 }, { reason: "не оплачен — в печать только с постоплатой", count: 1 }] });
    expect(bulkStatusText(res)).toBe("Обновлено заказов: 1; пропущено 2 (1 — нет доступа; 1 — не оплачен — в печать только с постоплатой)");
  });

  it("задача на чужую сделку или клиента у роли «только свои» — отказ, задача не создаётся", async () => {
    let created = 0;
    fake.clients = {
      links: { dealAssignee: async () => "anna" },
      clients: { find: async () => ({ managerId: "anna" }) },
      tasks: { create: async () => (created++, { clientId: null }) },
    };
    signIn(lena);
    expect(await createTaskAction({}, form({ title: "Перезвонить", dealId: id(5) }))).toEqual({ error: "Недостаточно прав для этого действия" });
    expect(await createTaskAction({}, form({ title: "Перезвонить", clientId: id(6) }))).toEqual({ error: "Недостаточно прав для этого действия" });
    expect(created).toBe(0);
  });

  it("ручную оплату проверяет другой сотрудник; руководитель может и свою", async () => {
    const reviewed: string[] = [];
    const payment = (createdById: string) => ({ id: id(70), orderId: id(1), amount: 5000, createdById });
    let current = payment("sasha");
    fake.ordering = { payments: { find: async () => current, review: async (_p: string, by: string) => (reviewed.push(by), current) } };
    signIn(sasha);
    expect(await reviewOrderPaymentAction(id(70))).toEqual({ error: "Проверяет другой сотрудник — свою запись подтвердить нельзя" });
    current = payment("boss");
    expect(await reviewOrderPaymentAction(id(70))).toEqual({ ok: "Отмечено: проверено" });
    signIn(owner);
    expect(await reviewOrderPaymentAction(id(70))).toEqual({ ok: "Отмечено: проверено" });
    expect(reviewed).toEqual(["sasha", "boss"]);
  });
});

describe("Клиентские помощники", () => {
  const card = (n: number, stageId = "s1") => ({ id: `c${n}`, number: n, title: "", contactName: "", stageId, amount: 0, source: "", assigneeId: null, assigneeLabel: null, daysInStage: 0, task: null, unread: 0, tags: [], unsorted: false, book: null, eventDate: null });

  it("restoreCard: откат возвращает только эту карточку, остальные — как пришли с сервера", () => {
    const before = card(1, "s1");
    const fresh = [card(1, "s2"), card(2, "s9")];
    expect(restoreCard(fresh, before)).toEqual([before, card(2, "s9")]);
    // Карточку убрали (отклонили) — возвращается в доску.
    expect(restoreCard([card(2)], before)).toEqual([card(2), before]);
  });

  it("keepVisible: выбор остаётся только на строках, которые на экране", () => {
    const sel = new Set(["a", "b", "c"]);
    expect([...keepVisible(sel, [{ id: "b" }, { id: "x" }])]).toEqual(["b"]);
    expect(keepVisible(sel, [{ id: "a" }, { id: "b" }, { id: "c" }])).toBe(sel);
  });

  it("textOn: на светлой плашке — чёрный текст, на тёмной — белый; контраст не ниже 4,5:1", () => {
    expect(textOn("#ffffff")).toBe("#000000");
    expect(textOn("#999")).toBe("#000000");
    expect(textOn("#8a1c2b")).toBe("#ffffff");
    expect(textOn("not-a-color")).toBe("#ffffff");
  });
});
