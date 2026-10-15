import { describe, expect, it } from "vitest";
import { ClientOnboardingService, type OnboardingInput, type OnboardingSales } from "@/modules/clients/application";
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
    tagDeal: async (id, tag) => void log.push(`sales.tagDeal ${id} ${tag}`),
    addPayment: async (p) => (log.push(`sales.addPayment ${p.dealId} ${p.amount}`), { id: "pay-1" }),
  };
  const service = new ClientOnboardingService(
    { provisionClient: async (i) => (log.push(`accounts.provisionClient ${i.name} ${i.phone} ${i.email ?? "—"}`), { id: "new-client", login: "77011234567" }) },
    sales,
    t.clients,
    t.notes,
    t.tasks,
  );
  return { t, log, service };
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
    const r = await service.onboard(input({ agreed: 30_000, prepaid: 10_000, deadline: "2026-11-20", stageId: "", comment: "Хочет к годовщине", plan: "hardcover", planLabel: "твёрдая обложка" }), head);

    expect(r).toEqual({ clientId: "new-client", login: "77011234567", deal: { id: "deal-9", number: 9 }, paymentId: "pay-1", tasks: 2 });
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
    expect(r).toEqual({ clientId: "new-client", login: "77011234567", deal: null, paymentId: null, tasks: 0 });
    expect(log).toEqual(["accounts.provisionClient Айжан +7 701 123 45 67 —"]);
    expect(t.mem.notes.rows.size).toBe(0);
    expect(t.mem.tasks.rows.size).toBe(0);
  });

  it("сделка без предоплаты и срока, этап выбран: платежа нет, задача одна — остаток", async () => {
    const { t, log, service } = harness();
    const r = await service.onboard(input({ agreed: 25_000, prepaid: 0, deadline: "", stageId: "st-new", comment: "", plan: "digital", planLabel: "электронная" }), head);
    expect(r.paymentId).toBeNull();
    expect(log.filter((l) => l.startsWith("sales.addPayment"))).toEqual([]);
    expect(log.find((l) => l.startsWith("sales.createDeal"))).toContain("· st-new ·");
    expect([...t.mem.tasks.rows.values()].map((x) => x.title)).toEqual([`Получить остаток ${formatPrice(25_000)} от Айжан`]);
  });
});
