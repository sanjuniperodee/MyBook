import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Блок «другие открытые сделки контакта» на карточке сделки (deals-d6): что видит менеджер у открытой и у закрытой сделки
// и что спрашивает подтверждение «Объединить сюда». Серверные действия и роутер подменены.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock("@/app/admin/deals/actions", () => ({}));
vi.mock("@/app/admin/crm-actions", () => ({}));

const { Duplicates } = await import("@/app/admin/deals/[id]/sections");
const { mergeQuestion } = await import("@/app/admin/deals/[id]/DealControls");

const created = new Date("2026-10-19T10:00:00Z");
const row = (number: number, merge: { cancels: string[] } | null) => ({
  deal: { id: `d${number}`, number, title: `Заявка ${number}`, amount: 0, createdAt: created, closedAt: null, assigneeId: null },
  stage: { name: "Новая", color: "#888" },
  merge,
});
const buttons = (html: string) => html.split("<button").length - 1;

describe("Другие открытые сделки контакта на карточке", () => {
  it("открытая сделка — «Похоже на дубль» и «Объединить сюда» у тех, кого можно слить", () => {
    const html = renderToStaticMarkup(<Duplicates dealId="t" closed={false} duplicates={[row(455, { cancels: [] }), row(456, null)]} />);
    expect(html).toContain("Похоже на дубль");
    expect(html).toContain("№455");
    expect(buttons(html)).toBe(1);
  });

  it("закрытая сделка — «Текущие заявки контакта» без кнопки: новые заявки ведут отдельно, а не вливают в прошлую покупку", () => {
    const html = renderToStaticMarkup(<Duplicates dealId="t" closed duplicates={[row(455, null)]} />);
    expect(html).toContain("Текущие заявки контакта");
    expect(html).toContain("Новые заявки — новые продажи: ведите их отдельно.");
    expect(html).not.toContain("Похоже на дубль");
    expect(html).not.toContain("Объединить сюда");
    expect(html).toContain('href="/admin/deals/d455"');
  });

  it("закрытая сделка заказа — кнопка только у заявки той же покупки, с пояснением", () => {
    const html = renderToStaticMarkup(<Duplicates dealId="t" closed duplicates={[row(455, { cancels: ["P77 на 15 000 ₸"] }), row(456, null)]} />);
    expect(buttons(html)).toBe(1);
    expect(html).toContain("Объединить можно только заявку той же покупки");
  });
});

describe("Подтверждение «Объединить сюда»", () => {
  it("в закрытую сделку — прямо: заявка уйдёт из работы, плана и воронки; отменяемые счета — поимённо", () => {
    const q = mergeQuestion(455, true, ["P77 на 15 000 ₸"]);
    expect(q).toContain("Влить заявку №455 в эту закрытую сделку?");
    expect(q).toContain("уйдёт из работы — в план и воронку как новая продажа она не попадёт");
    expect(q).toContain("Будет отменён открытый счёт P77 на 15 000 ₸ — ссылка на оплату у клиента перестанет работать.");
  });

  it("открытая сделка — без лишних предупреждений; счета, которые отменятся, — списком", () => {
    expect(mergeQuestion(8, false, [])).toBe("Объединить сделку №8 с этой? Переписка, звонки, задачи и история перейдут сюда, №8 удалится.");
    expect(mergeQuestion(8, false, ["P3 на 5 000 ₸", "P4 на 7 000 ₸"])).toContain("Будут отменены открытые счета P3 на 5 000 ₸, P4 на 7 000 ₸ — ссылки на оплату у клиента перестанут работать.");
  });
});
