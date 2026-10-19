import { describe, expect, it } from "vitest";
import { ClientOnboardingService, splitEven, type OnboardingInput, type OnboardingSales } from "@/modules/clients/application";
import { formatPrice } from "@/config/site";
import { head, setup } from "./doubles/clients";

/**
 * «Завести клиента» (E1): ClientOnboardingService вместо 90 строк в действии формы. Фейки записывают команды
 * по порядку — тот же порядок и те же тексты заметки и задач, что были в createClientAction.
 */
function harness() {
  const t = setup();
  const log: string[] = [];
  t.mem.clients.rows.set("new-client", { id: "new-client", name: "Айжан", email: "", phone: "77011234567", managerId: null, source: null, customFields: {} });
  const sales: OnboardingSales = {
    stages: async () => (log.push("sales.stages"), [{ id: "st-new", kind: "open", name: "Новая заявка" }, { id: "st-work", kind: "open", name: "Взяли в работу" }]),
    createDeal: async (d) => (log.push(`sales.createDeal ${d.title} · ${d.stageId} · ${d.amount} · ${JSON.stringify(d.customFields)}`), { id: "deal-9", number: 9 }),
    setAgreedPlan: async (id, plan) => void log.push(`sales.setAgreedPlan ${id} ${plan}`),
    setAgreedGifts: async (id, gifts) => void log.push(`sales.setAgreedGifts ${id} ${gifts.join(",")}`),
    setBatch: async (id, batch, i, n) => void log.push(`sales.setBatch ${id} ${i + 1}/${n}`),
    tagDeal: async (id, tag) => void log.push(`sales.tagDeal ${id} ${tag}`),
    addPayment: async (p) => (log.push(`sales.addPayment ${p.dealId} ${p.amount}`), { id: "pay-1" }),
    linkClient: async (dealId, clientId) => void log.push(`sales.linkClient ${dealId} ${clientId}`),
  };
  const service = new ClientOnboardingService(
    { provisionClient: async (i) => (log.push(`accounts.provisionClient ${i.name} ${i.phone} ${i.email ?? "—"}`), { id: "new-client", login: "77011234567" }) },
    sales,
    t.clients,
    t.notes,
    t.tasks,
  );
  return { t, log, service, sales };
}

const input = (deal: OnboardingInput["deal"]): OnboardingInput => ({
  name: "Айжан",
  phone: "+7 701 123 45 67",
  email: "",
  locale: "kk",
  password: "secret123",
  city: "Алматы",
  recipient: "Марат",
  channel: "instagram",
  assigneeId: "m1",
  deal,
});

describe("ClientOnboardingService.onboard", () => {
  it("со сделкой и предоплатой: аккаунт → профиль → канал → сделка «Взяли в работу» → тариф и метки → платёж → заметка → задачи", async () => {
    const { t, log, service } = harness();
    const r = await service.onboard(input({ agreed: 30_000, prepaid: 10_000, deadline: "2026-11-20", stageId: "", comment: "Хочет к годовщине", plan: "hardcover", planLabel: "твёрдая обложка", maxDiscountPercent: null }), head);

    expect(r).toEqual({ clientId: "new-client", login: "77011234567", deal: { id: "deal-9", number: 9 }, paymentId: "pay-1", parts: [{ dealId: "deal-9", dealNumber: 9, agreed: 30000, prepaid: 10000, paymentId: "pay-1" }], tasks: 2 });
    expect(log).toEqual([
      "accounts.provisionClient Айжан +7 701 123 45 67 —",
      "sales.stages",
      'sales.createDeal Книга — Айжан (Марат) · st-work · 30000 · {"recipient":"Марат","event_date":"2026-11-20"}',
      "sales.setAgreedPlan deal-9 hardcover",
      "sales.tagDeal deal-9 вручную",
      "sales.tagDeal deal-9 предоплата",
      "sales.tagDeal deal-9 алматы",
      "sales.addPayment deal-9 10000",
    ]);
    const client = t.mem.clients.rows.get("new-client")!;
    expect(client.managerId).toBe("m1");
    expect(client.source).toEqual({ source: "instagram", medium: "manual" });

    const [note] = [...t.mem.notes.rows.values()];
    expect(note.text.split("\n")).toEqual([
      "Канал: Instagram.",
      "Кому книга: Марат.",
      "Клиент: Айжан, г. Алматы, тел. +7 701 123 45 67, язык — казахский.",
      "Срок: до 20.11.2026 (желательно раньше).",
      "Тариф: твёрдая обложка (зафиксирован для заказа клиента).",
      `Договорились на ${formatPrice(30_000)} за книгу (доставка и допы — сверху); предоплата ${formatPrice(10_000)}; остаток ${formatPrice(20_000)}.`,
      "Хочет к годовщине",
      "Почты нет: клиент входит по телефону.",
    ]);
    expect([...t.mem.tasks.rows.values()].map((x) => `${x.title} · ${x.assigneeId}`)).toEqual([
      "Книга для клиента Айжан: готова и передана до 20.11.2026 — желательно раньше · m1",
      `Получить остаток ${formatPrice(20_000)} от Айжан · m1`,
    ]);
  });

  it("без сделки: только аккаунт, профиль и канал — ни сделки, ни платежа, ни заметки", async () => {
    const { t, log, service } = harness();
    const r = await service.onboard(input(null), head);
    expect(r).toEqual({ clientId: "new-client", login: "77011234567", deal: null, paymentId: null, parts: [], tasks: 0 });
    expect(log).toEqual(["accounts.provisionClient Айжан +7 701 123 45 67 —"]);
    expect(t.mem.notes.rows.size).toBe(0);
    expect(t.mem.tasks.rows.size).toBe(0);
  });

  it("сделка без предоплаты и срока, этап выбран: платежа нет, задача одна — остаток", async () => {
    const { t, log, service } = harness();
    const r = await service.onboard(input({ agreed: 25_000, prepaid: 0, deadline: "", stageId: "st-new", comment: "", plan: "digital", planLabel: "электронная", maxDiscountPercent: null }), head);
    expect(r.paymentId).toBeNull();
    expect(log.filter((l) => l.startsWith("sales.addPayment"))).toEqual([]);
    expect(log.find((l) => l.startsWith("sales.createDeal"))).toContain("· st-new ·");
    expect([...t.mem.tasks.rows.values()].map((x) => x.title)).toEqual([`Получить остаток ${formatPrice(25_000)} от Айжан`]);
  });
});

describe("ClientOnboardingService: лимит скидки от прайса тарифа", () => {
  const terms = (agreed: number, maxDiscountPercent: number | null) => ({ agreed, count: 2, prepaid: 0, deadline: "", stageId: "", comment: "", plan: "hardcover", planLabel: "твёрдая обложка", maxDiscountPercent });

  it("«Новый клиент»: цена сверх лимита — DiscountError до аккаунта, ничего не заведено; в пределах — как обычно", async () => {
    const { log, service } = harness();
    await expect(service.onboard(input(terms(25_499, 15)), head)).rejects.toMatchObject({ code: "discountOverLimit", params: [15, 30_000, false] });
    expect(log).toEqual([]);
    await service.onboard(input(terms(25_500, 15)), head);
    expect(log[0]).toBe("accounts.provisionClient Айжан +7 701 123 45 67 —");
  });

  it("«Сделки по договорённости»: сверх лимита — ни одной сделки; без лимита (право prices.discount_unlimited) — любая цена", async () => {
    const { log, service } = harness();
    const deals = (agreed: number, limit: number | null) => service.addDeals({ clientId: "new-client", name: "Айжан", phone: "77011234567", email: "", city: "", recipient: "", locale: "ru", assigneeId: "m1", deal: terms(agreed, limit) }, head);
    await expect(deals(10_000, 15)).rejects.toMatchObject({ code: "discountOverLimit" });
    expect(log.filter((l) => l.startsWith("sales.createDeal"))).toEqual([]);
    expect((await deals(10_000, null)).parts).toHaveLength(2);
  });
});

describe("ClientOnboardingService.onboardFromDeal: клиент прямо из сделки", () => {
  it("аккаунт по телефону сделки, ответственный сделки, канал; сделка привязана, заметка в ней", async () => {
    const { t, log, service } = harness();
    const r = await service.onboardFromDeal({ dealId: "deal-3", name: "Айжан", phone: "77011234567", email: "", locale: "kk", password: "secret123", channel: "instagram", assigneeId: "m1" }, { userId: "m1", name: "Мария", seesAll: false, allTasks: false });
    expect(r).toEqual({ clientId: "new-client", login: "77011234567" });
    expect(log).toEqual(["accounts.provisionClient Айжан 77011234567 —", "sales.linkClient deal-3 new-client"]);
    expect(t.mem.clients.rows.get("new-client")?.managerId).toBe("m1");
  });
});

describe("ClientOnboardingService.onboardFromPayment: клиента заводит оплата счёта из чата", () => {
  it("аккаунт по телефону (вход по телефону), ответственный сделки, канал из счёта; сделку здесь не трогаем", async () => {
    const { t, log, service } = harness();
    const r = await service.onboardFromPayment({ name: "Айжан", phone: "77011234567", locale: "kk", channel: "instagram", password: "random-unknown-1", assigneeId: "m1" });
    expect(r).toEqual({ clientId: "new-client", login: "77011234567" });
    expect(log).toEqual(["accounts.provisionClient Айжан 77011234567 —"]);
    expect(t.mem.clients.rows.get("new-client")).toMatchObject({ managerId: "m1", source: { source: "instagram", medium: "manual" } });
    expect(t.mem.clients.tags.get("new-client")).toEqual(["вручную"]);
  });

  it("ответственный отключён или его нет — аккаунт всё равно заводится; канал не из списка — без метки", async () => {
    const { t, service } = harness();
    await service.onboardFromPayment({ name: "Айжан", phone: "77011234567", locale: "ru", channel: "", password: "random-unknown-1", assigneeId: "x1" });
    expect(t.mem.clients.rows.get("new-client")).toMatchObject({ managerId: null, source: null });
  });
});

describe("служебные заметки и задачи CRM пишутся один раз", () => {
  it("addSystemOnce: одна запись с таким текстом по сделке, без автора", async () => {
    const t = setup();
    expect(await t.notes.addSystemOnce({ text: "Оплачен счёт P1", dealId: "deal-1" })).toBe(true);
    expect(await t.notes.addSystemOnce({ text: "Оплачен счёт P1", dealId: "deal-1" })).toBe(false);
    expect(await t.notes.addSystemOnce({ text: "Оплачен счёт P1", dealId: "deal-2" })).toBe(true);
    expect([...t.mem.notes.rows.values()].map((n) => [n.kind, n.authorId, n.dealId])).toEqual([["system", null, "deal-1"], ["system", null, "deal-2"]]);
  });

  it("createOnce: одна открытая задача с таким заголовком по сделке; закрытая не мешает новой", async () => {
    const t = setup();
    const actor = { userId: "m1", name: "CRM", seesAll: true, allTasks: true };
    expect(await t.tasks.createOnce(actor, { title: "Получить остаток", kind: "task", dealId: "deal-1", assigneeId: "m1" })).toBe(true);
    expect(await t.tasks.createOnce(actor, { title: "Получить остаток", kind: "task", dealId: "deal-1", assigneeId: "m1" })).toBe(false);
    await t.mem.tasks.setDone(t.mem.tasks.last().id, new Date());
    expect(await t.tasks.createOnce(actor, { title: "Получить остаток", kind: "task", dealId: "deal-1", assigneeId: "m1" })).toBe(true);
    expect(t.mem.tasks.rows.size).toBe(2);
  });

  it("несколько книг сразу: по сделке на книгу, цена и предоплата делятся, пакет связан, остаток — одной задачей", async () => {
    const { service, sales } = harness();
    let n = 9;
    const batches: string[] = [];
    const payments: string[] = [];
    sales.createDeal = async () => ({ id: `deal-${n}`, number: n++ });
    sales.setBatch = async (id, batch, i, size) => void batches.push(`${id} ${i + 1}/${size} ${batch.length > 10}`);
    sales.addPayment = async (p) => (payments.push(`${p.dealId}:${p.amount}`), { id: `pay-${p.dealId}` });
    const r = await service.onboard(input({ agreed: 20_000, count: 3, prepaid: 10_000, deadline: "", stageId: "", comment: "", plan: "hardcover", planLabel: "твёрдая обложка", maxDiscountPercent: null }), head);
    expect(r.parts.map((p) => [p.dealNumber, p.agreed, p.prepaid])).toEqual([[9, 20000, 3334], [10, 20000, 3333], [11, 20000, 3333]]);
    expect(payments).toEqual(["deal-9:3334", "deal-10:3333", "deal-11:3333"]);
    expect(batches).toEqual(["deal-9 1/3 true", "deal-10 2/3 true", "deal-11 3/3 true"]);
    expect(r.deal).toEqual({ id: "deal-9", number: 9 });
    expect(r.tasks).toBe(1); // остаток 50 000 — одна задача на весь пакет
  });
});

describe("splitEven", () => {
  it("части равны, остаток — первым, сумма сходится", () => {
    expect(splitEven(10, 3)).toEqual([4, 3, 3]);
    expect(splitEven(0, 4)).toEqual([0, 0, 0, 0]);
    expect(splitEven(7, 1)).toEqual([7]);
    expect(splitEven(100000, 7).reduce((a, b) => a + b, 0)).toBe(100000);
  });
});
