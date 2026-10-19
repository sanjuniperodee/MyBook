import { describe, expect, it } from "vitest";
import { calculatePrice, checkoutTerms, quoteCheckout } from "@/modules/ordering/domain/Pricing";
import { DealInvoicesService } from "@/modules/ordering/application/DealInvoicesService";
import { ClientOnboardingService, type OnboardingSales } from "@/modules/clients/application";
import { paymentFactsText, type PaymentFacts } from "@/modules/messaging/domain/botPayments";
import { giftsForPlan } from "@/config/site";
import { readGifts } from "@/shared/domain/agreementGifts";
import { messagesFor } from "@/i18n/messages";
import { setup } from "./doubles/ordering";
import { setup as clientsSetup, head } from "./doubles/clients";
import { FakeInvoiceSales, MemDealInvoices } from "./doubles/kaspi";

/**
 * «Бесплатно по договорённости»: менеджер отмечает, что подарочная упаковка и/или доставка идут бесплатно. Сами они
 * в заказ не добавляются — клиент выбирает их при оформлении как обычно, и отмеченное стоит 0 ₸.
 */
const agreement = { agreedTotal: 20_000, prepaid: 0, plan: null, gifts: ["giftwrap", "delivery"] as const };

describe("цена заказа с бесплатным по договорённости", () => {
  it("упаковка бесплатна, только если клиент её выбрал; доставка — только платная", () => {
    const none = calculatePrice("hardcover", 1, "pickup", null, [], agreement);
    expect(none).toMatchObject({ deliveryAmount: 0, addonsAmount: 0, addons: [] });
    expect(none.gifted).toBeUndefined();

    const chosen = calculatePrice("hardcover", 1, "courier", null, ["giftwrap", "express"], agreement);
    const list = calculatePrice("hardcover", 1, "courier", null, ["giftwrap", "express"], { ...agreement, gifts: [] });
    expect(chosen).toMatchObject({ deliveryAmount: 0, addonsAmount: 5000, addons: ["express", "giftwrap"], gifted: ["giftwrap", "delivery"] });
    expect(list).toMatchObject({ deliveryAmount: 2000, addonsAmount: 10_000 });
    expect(list.amount - chosen.amount).toBe(7000);
  });

  it("только доставка в подарок: упаковка по прайсу", () => {
    const p = calculatePrice("hardcover", 1, "post", null, ["giftwrap"], { ...agreement, gifts: ["delivery"] });
    expect(p).toMatchObject({ deliveryAmount: 0, addonsAmount: 5000, gifted: ["delivery"] });
  });

  it("без договорённости и у электронной книги подарков нет", () => {
    expect(calculatePrice("hardcover", 1, "courier", null, ["giftwrap"], { ...agreement, agreedTotal: 0 })).toMatchObject({ deliveryAmount: 2000, addonsAmount: 5000 });
    const digital = calculatePrice("digital", 1, "courier", null, ["giftwrap"], agreement);
    expect(digital).toMatchObject({ deliveryAmount: 0, addonsAmount: 0 });
    expect(digital.gifted).toBeUndefined();
  });

  it("«с нуля» (аванс) и дозаказ печатной — без подарков: они часть договорной цены", () => {
    expect(checkoutTerms({ plan: "hardcover", agreement, mode: "agreed" }).agreement?.gifts).toEqual(["giftwrap", "delivery"]);
    expect(checkoutTerms({ plan: "hardcover", agreement, mode: "advance" }).agreement?.gifts).toBeUndefined();
    expect(checkoutTerms({ plan: "hardcover", agreement, upgradeCredit: 5000 }).agreement?.gifts).toBeUndefined();
    const advance = quoteCheckout({ plan: "hardcover", quantity: 1, delivery: "courier", discount: null, addons: ["giftwrap"], agreement, mode: "advance" });
    expect(advance.price).toMatchObject({ deliveryAmount: 2000, addonsAmount: 5000 });
  });

  it("форма и сервер считают одинаково, заказ помнит, что было бесплатно", async () => {
    const t = setup();
    t.setAgreement({ dealId: "d1", dealNumber: 6, deadline: null, ...agreement, gifts: [...agreement.gifts] });
    const order = await t.place({ plan: "hardcover", quantity: 2, delivery: { method: "courier", city: "Алматы", address: "Абая, 1", postalCode: null }, addons: ["giftwrap"], agreementMode: "agreed" });
    const quote = quoteCheckout({ plan: "hardcover", quantity: 2, delivery: "courier", discount: null, addons: ["giftwrap"], agreement });
    expect(order.snapshot().price).toEqual(quote.price);
    expect(order.snapshot().price).toMatchObject({ deliveryAmount: 0, addonsAmount: 0, gifted: ["giftwrap", "delivery"] });
  });
});

describe("что можно отдать бесплатно на тарифе", () => {
  it("печатная — упаковка и доставка; премиум — только доставка (упаковки среди допов нет); электронная — ничего", () => {
    expect(giftsForPlan("hardcover")).toEqual(["giftwrap", "delivery"]);
    expect(giftsForPlan("premium")).toEqual(["delivery"]);
    expect(giftsForPlan("digital")).toEqual([]);
    expect(giftsForPlan("nope")).toEqual([]);
    expect(giftsForPlan("hardcover", ["delivery"])).toEqual(["delivery"]);
  });

  it("сырое значение из формы и базы: лишнее отбрасывается, порядок постоянный", () => {
    expect(readGifts(["delivery", "x", "giftwrap", "delivery"])).toEqual(["giftwrap", "delivery"]);
    expect(readGifts("delivery, giftwrap")).toEqual(["giftwrap", "delivery"]);
    expect(readGifts(null)).toEqual([]);
  });
});

describe("счёт из чата", () => {
  function invoiceSetup(dealGifts: ("giftwrap" | "delivery")[] = []) {
    const base = setup();
    const deals = new MemDealInvoices();
    const sales = new FakeInvoiceSales();
    sales.addDeal("deal-1", { gifts: dealGifts });
    const invoices = new DealInvoicesService(deals, sales, base.uow, base.c);
    const issue = (over: { plan?: string; gifts?: ("giftwrap" | "delivery")[]; bot?: boolean }) =>
      invoices.issue({ dealId: "deal-1", conversationId: null, phone: null, clientName: "Айжан", locale: "ru", channel: "whatsapp", plan: over.plan ?? "hardcover", agreedTotal: 30000, ...(over.gifts ? { gifts: over.gifts } : {}), amount: 10000, purpose: "prepayment", actor: over.bot ? { userId: null, label: "bot" } : { userId: "staff-1", label: "staff" }, maxDiscountPercent: null });
    return { sales, issue };
  }

  it("менеджер отметил подарки: они в сделке и в счёте, недоступное тарифу отбрасывается", async () => {
    const t = invoiceSetup();
    const { invoice } = await t.issue({ plan: "premium", gifts: ["giftwrap", "delivery"] });
    expect(invoice.snapshot().gifts).toEqual(["delivery"]);
    expect(t.sales.agreements).toEqual([{ dealId: "deal-1", count: 1, agreedTotal: 30000, gifts: ["delivery"] }]);
  });

  it("менеджер снял все отметки — подарков больше нет", async () => {
    const t = invoiceSetup(["giftwrap"]);
    const { invoice } = await t.issue({ gifts: [] });
    expect(invoice.snapshot().gifts).toEqual([]);
    expect((await t.sales.deal("deal-1"))?.gifts).toEqual([]);
  });

  it("счёт бота не стирает то, что менеджер записал в сделку", async () => {
    const t = invoiceSetup(["giftwrap", "delivery"]);
    const { invoice } = await t.issue({ bot: true });
    expect(invoice.snapshot().gifts).toEqual(["giftwrap", "delivery"]);
    expect((await t.sales.deal("deal-1"))?.gifts).toEqual(["giftwrap", "delivery"]);
  });

  it("текст счёта называет подарки на языке клиента", () => {
    const msg = (locale: "ru" | "kk", gifts: string | null) => messagesFor(locale).pay.message({ name: "Айжан", label: "P-1", plan: "x", purpose: "y", amount: "1", link: "l", until: "u", kaspiPhone: null, kaspiOrg: null, gifts });
    expect(msg("ru", "подарочная упаковка, доставка")).toContain("🎁 Бесплатно по договорённости: подарочная упаковка, доставка.");
    expect(msg("kk", "жеткізу")).toContain("🎁 Келісім бойынша тегін: жеткізу.");
    expect(msg("ru", null)).not.toContain("🎁");
  });
});

describe("заведение клиента", () => {
  function harness() {
    const t = clientsSetup();
    const log: string[] = [];
    t.mem.clients.rows.set("new-client", { id: "new-client", name: "Айжан", email: "", phone: "77011234567", managerId: null, source: null, customFields: {} });
    const sales: OnboardingSales = {
      stages: async () => [{ id: "st-work", kind: "open", name: "Взяли в работу" }],
      createDeal: async () => ({ id: "deal-9", number: 9 }),
      setAgreedPlan: async () => {},
      setAgreedGifts: async (id, gifts) => void log.push(`gifts ${id} ${gifts.join(",")}`),
      setBatch: async () => {},
      tagDeal: async () => {},
      addPayment: async () => ({ id: "pay-1" }),
      linkClient: async () => {},
    };
    const service = new ClientOnboardingService({ provisionClient: async () => ({ id: "new-client", login: "77011234567" }) }, sales, t.clients, t.notes, t.tasks);
    const onboard = (plan: string, gifts: ("giftwrap" | "delivery")[]) =>
      service.onboard({ name: "Айжан", phone: "+7 701 123 45 67", email: "", locale: "ru", password: "secret123", city: "", recipient: "", channel: "instagram", assigneeId: "m1", deal: { agreed: 30_000, prepaid: 0, deadline: "", stageId: "", comment: "", plan, planLabel: plan, gifts, maxDiscountPercent: null } }, head);
    return { t, log, onboard };
  }

  it("подарки записываются в сделку и в заметку", async () => {
    const h = harness();
    await h.onboard("hardcover", ["giftwrap", "delivery"]);
    expect(h.log).toEqual(["gifts deal-9 giftwrap,delivery"]);
    const [note] = [...h.t.mem.notes.rows.values()];
    expect(note.text).toContain("бесплатно: подарочная упаковка, доставка; остальные допы — сверху");
  });

  it("электронной книге подарки не записываются", async () => {
    const h = harness();
    await h.onboard("digital", ["giftwrap", "delivery"]);
    expect(h.log).toEqual([]);
    const [note] = [...h.t.mem.notes.rows.values()];
    expect(note.text).toContain("доставка и допы — сверху");
  });
});

describe("AI-продажник знает о подарках", () => {
  const facts: PaymentFacts = { paid: 0, agreed: 30000, batchSize: null, payments: [], invoices: [], orders: [] };
  it("строка о бесплатном — только когда оно есть", () => {
    expect(paymentFactsText({ ...facts, gifts: ["giftwrap", "delivery"] }, "Asia/Almaty")).toContain("По договорённости бесплатно: подарочная упаковка, доставка");
    expect(paymentFactsText(facts, "Asia/Almaty")).not.toContain("бесплатно");
  });
});
