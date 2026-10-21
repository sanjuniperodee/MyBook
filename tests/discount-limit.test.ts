import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyCatalog, formatPrice } from "@/config/site";
import { DiscountError, DiscountPolicy, percentLabel } from "@/shared/domain/discount";
import { allPermissions } from "@/shared/domain/permissions";
import { checkDealPrice, dealListPrice, dealPrice } from "@/modules/sales/domain";
import { ClientOnboardingService, type OnboardingSales } from "@/modules/clients/application";
import { staffActionError } from "@/server/errors";
import { createDealAction, setDealAgreedPlanAction, updateDealAction } from "@/app/admin/deals/actions";
import { createClientDealsAction } from "@/app/admin/clients/new/actions";
import { botInvoices } from "@/server/deal-invoices";
import { Redirect, fake, kira, lena, owner, resetContainer, resetRequest, rita, signIn } from "./doubles/web";
import { setup as clientsSetup } from "./doubles/clients";

vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);
vi.mock("next/navigation", async () => (await import("./doubles/web")).nextNavigation);
vi.mock("next/cache", async () => (await import("./doubles/web")).nextCache);
vi.mock("@/server/container", async () => (await import("./doubles/web")).containerModule);
/** Настройки CRM без базы: лимит скидки; своих полей сделки нет. */
const settings: Record<string, string> = {};
vi.mock("@/modules/workspace", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/workspace")>()),
  getSetting: async (key: string) => settings[key] ?? "",
  getSettings: async (keys: string[]) => Object.fromEntries(keys.map((k) => [k, settings[k] ?? ""])),
  listFields: async () => [],
}));

// Единый лимит скидки (P0-3, deals-11 и deals-d5): одно правило DiscountPolicy во всех точках продажи, право
// prices.discount_unlimited снимает лимит, цена ниже прайса — в журнал deal.discount. Прайс по умолчанию: электронная 9 900,
// твёрдая 30 000 (премиум снят с продажи).

const DEAL = "0d0d0d0d-0000-4000-8000-000000000001";
/** Текст отказа для твёрдой обложки (30 000 ₸) при лимите 15%. */
const OVER = `Цена ниже прайса (${formatPrice(30_000)}) больше чем на 15% — согласуйте с руководителем`;
const CLIENT = "0d0d0d0d-0000-4000-8000-000000000004";

describe("DiscountPolicy: граница лимита", () => {
  it("15% от 30 000: 25 500 — можно, на тенге ниже — DiscountError с лимитом и прайсом; без лимита — любая цена", () => {
    expect(DiscountPolicy.floor(30_000, 15)).toBe(25_500);
    expect(DiscountPolicy.check({ listPrice: 30_000, price: 25_500, maxPercent: 15 })).toBe(15);
    expect(() => DiscountPolicy.check({ listPrice: 30_000, price: 25_499, maxPercent: 15 })).toThrow(expect.objectContaining({ code: "discountOverLimit", params: [15, 30_000, false] }));
    expect(DiscountPolicy.check({ listPrice: 30_000, price: 1_000, maxPercent: null })).toBe(96.7);
    expect(DiscountPolicy.check({ listPrice: 30_000, price: 31_000, maxPercent: 0 })).toBe(0);
    expect(() => DiscountPolicy.check({ listPrice: 30_000, price: 29_999, maxPercent: 0 })).toThrow(DiscountError);
  });

  it("процент — до десятой; лимит из настройки — целое 0…100, мусор — 0", () => {
    expect(DiscountPolicy.percent(30_000, 25_000)).toBe(16.7);
    expect(percentLabel(16.7)).toBe("16,7%");
    expect(DiscountPolicy.percent(0, 100)).toBe(0);
    expect([DiscountPolicy.readLimit("15"), DiscountPolicy.readLimit(""), DiscountPolicy.readLimit("abc"), DiscountPolicy.readLimit("150"), DiscountPolicy.readLimit("-5")]).toEqual([15, 0, 0, 100, 0]);
  });

  it("текст сотруднику — из словаря admin: с прайсом и лимитом; без тарифа — подсказка указать тариф", () => {
    expect(staffActionError(new DiscountError("discountOverLimit", undefined, [15, 30_000, false]), DiscountError)).toBe(OVER);
    expect(staffActionError(new DiscountError("discountOverLimit", undefined, [15, 30_000, true]), DiscountError)).toContain("Укажите тариф договорённости в блоке «Оплата»");
  });

  it("право prices.discount_unlimited — в словаре прав (редактор ролей), руководитель получает его со всеми", () => {
    expect(allPermissions).toContain("prices.discount_unlimited");
  });
});

describe("прайс сделки", () => {
  beforeEach(() => applyCatalog(null));

  it("тариф договорённости — его цена из «Цен и тарифов»: подняли прайс — лимит считается от нового", () => {
    expect(dealListPrice("hardcover", "whatsapp")).toEqual({ listPrice: 30_000, planless: false });
    applyCatalog({ plans: { hardcover: { price: 36_000 } } });
    expect(dealListPrice("hardcover", "whatsapp")).toEqual({ listPrice: 36_000, planless: false });
    expect(() => checkDealPrice("hardcover", "whatsapp", 30_000, 15)).toThrow(DiscountError);
  });

  it("«вручную» без тарифа — самый дорогой из продающихся (цена действует на любой тариф); заявка без тарифа — бюджет-оценка", () => {
    expect(dealListPrice(null, "manual")).toEqual({ listPrice: 30_000, planless: true });
    expect(() => checkDealPrice(null, "manual", 9_900, 15)).toThrow(expect.objectContaining({ params: [15, 30_000, true] }));
    expect(checkDealPrice("digital", "manual", 9_900, 15)).toMatchObject({ percent: 0, planless: false });
    expect(dealListPrice(null, "whatsapp")).toBeNull();
    expect(checkDealPrice(null, "whatsapp", 1_000, 15)).toBeNull();
    expect(dealPrice("hardcover", "site", 0)).toBeNull();
  });
});

describe("точки продажи: лимит сотрудника и журнал", () => {
  let deal: { id: string; number: number; title: string; contactName: string; clientId: string | null; assigneeId: string | null; orderId: string | null; amount: number; source: string; customFields: Record<string, unknown>; extraPhones: string[] };
  let log: { limits: (number | null)[]; plans: (string | null)[]; audit: { action: string; details?: Record<string, unknown> }[]; notes: string[] };

  beforeEach(() => {
    resetRequest();
    resetContainer();
    applyCatalog(null);
    for (const k of Object.keys(settings)) delete settings[k];
    settings["crm.maxDiscount"] = "15";
    deal = { id: DEAL, number: 7, title: "Книга", contactName: "Айгерим", clientId: CLIENT, assigneeId: "lena", orderId: null, amount: 30_000, source: "manual", customFields: {}, extraPhones: [] };
    log = { limits: [], plans: [], audit: [], notes: [] };
    fake.access.audit = { record: async (e: { action: string; details?: Record<string, unknown> }) => void log.audit.push(e) };
    // Сценарии продаж — по правилу домена: тариф договорённости сделки — твёрдая обложка.
    fake.sales = {
      deals: {
        findById: async (id: string) => (id === DEAL ? deal : null),
        edit: async (_id: string, patch: { amount: number; source: string }, _actor: string, limit: number | null) => (log.limits.push(limit), checkDealPrice("hardcover", patch.source, patch.amount, limit)),
        changeAgreedPlan: async (_id: string, plan: string | null, limit: number | null) => (log.limits.push(limit), { before: "digital", price: checkDealPrice(plan, "manual", deal.amount, limit) }),
        create: async (input: { source: string; amount: number; maxDiscountPercent: number | null; agreedPlan: string | null }) => (log.limits.push(input.maxDiscountPercent), log.plans.push(input.agreedPlan), checkDealPrice(input.agreedPlan, input.source, input.amount, input.maxDiscountPercent), { id: DEAL, number: 8, clientId: null }),
        note: async (_d: unknown, text: string) => void log.notes.push(text),
        absorbRequests: async () => [],
      },
    };
  });

  const dealForm = (over: Record<string, string> = {}) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ id: DEAL, title: "Книга", contactName: "Айгерим", amount: "25000", source: "manual", tags: "", ...over })) f.set(k, v);
    return f;
  };
  const discounts = () => log.audit.filter((a) => a.action === "deal.discount").map((a) => a.details);

  it("бюджет: менеджер — лимит из настройки, сверх — текст и ничего в журнал; в пределах — deal.discount с процентом", async () => {
    signIn(lena);
    expect(await updateDealAction({}, dealForm({ amount: "25000" }))).toEqual({ error: OVER });
    expect(discounts()).toEqual([]);
    expect(await updateDealAction({}, dealForm({ amount: "26000" }))).toEqual({ ok: "Сохранено" });
    expect(log.limits).toEqual([15, 15]);
    expect(discounts()).toEqual([{ via: "budget", percent: 13.3, listPrice: 30_000, price: 26_000, plan: "hardcover", limit: 15, number: 7, from: 30_000 }]);
  });

  it("право без лимита (роль со старым deals.delete после миграции, руководитель) — цена ниже прайса проходит и пишется в журнал", async () => {
    for (const who of [rita, owner]) {
      signIn(who);
      deal.assigneeId = who.id;
      expect(await updateDealAction({}, dealForm({ amount: "15000" }))).toEqual({ ok: "Сохранено" });
    }
    expect(log.limits).toEqual([null, null]);
    expect(discounts().map((d) => [d?.percent, d?.limit])).toEqual([[50, null], [50, null]]);
  });

  it("тариф договорённости: дорогой тариф по цене дешёвого — отказ; без лимита — сохраняется, журнал от прежнего тарифа", async () => {
    signIn(lena);
    deal.amount = 9_900;
    expect(await setDealAgreedPlanAction(DEAL, "hardcover")).toEqual({ ok: false, message: OVER });
    expect(log.notes).toEqual([]);
    signIn(owner);
    deal.assigneeId = "boss";
    expect(await setDealAgreedPlanAction(DEAL, "hardcover")).toEqual({ ok: true });
    expect(log.notes).toEqual(["Тариф договорённости: digital → hardcover"]);
    expect(discounts()).toEqual([{ via: "plan", percent: 67, listPrice: 30_000, price: 9_900, plan: "hardcover", limit: null, number: 7, from: "digital" }]);
  });

  it("новая сделка «вручную» с бюджетом без тарифа — сравнение с самым дорогим тарифом; заявка из WhatsApp — без проверки", async () => {
    signIn(lena);
    const form = (amount: string, source = "manual") => {
      const f = new FormData();
      for (const [k, v] of Object.entries({ title: "Книга маме", amount, source })) f.set(k, v);
      return f;
    };
    const error = (await createDealAction({}, form("20000"))).error;
    expect(error).toContain("Без тарифа договорённости эта цена действует на любой тариф");
    // Блока «Оплата» у сделки ещё нет — тариф выбирают здесь же, в форме.
    expect(error).toContain("Выберите тариф договорённости в этой форме или согласуйте цену с руководителем");
    expect(error).not.toContain("«Оплата»");
    await expect(createDealAction({}, form("20000", "whatsapp"))).rejects.toBeInstanceOf(Redirect);
    await expect(createDealAction({}, form("26000"))).rejects.toBeInstanceOf(Redirect);
    expect(log.limits).toEqual([15, 15, 15]);
    expect(discounts()).toEqual([{ via: "deal", percent: 13.3, listPrice: 30_000, price: 26_000, plan: null, planless: true, limit: 15, number: 8 }]);
  });

  it("новая сделка «вручную» с тарифом: электронная за 9 900 создаётся сразу, тариф уходит в сделку; дорогой тариф по цене дешёвого — отказ", async () => {
    signIn(lena);
    const form = (amount: string, plan: string) => {
      const f = new FormData();
      for (const [k, v] of Object.entries({ title: "Электронная по телефону", amount, source: "manual", plan })) f.set(k, v);
      return f;
    };
    await expect(createDealAction({}, form("9900", "digital"))).rejects.toBeInstanceOf(Redirect);
    expect(await createDealAction({}, form("9900", "hardcover"))).toEqual({ error: OVER });
    expect(await createDealAction({}, form("9900", "gold"))).toEqual({ error: "Выберите тариф из списка" });
    expect(log.plans).toEqual(["digital", "hardcover"]);
    expect(discounts()).toEqual([]);
    await expect(createDealAction({}, form("9000", "digital"))).rejects.toBeInstanceOf(Redirect);
    expect(discounts()).toEqual([{ via: "deal", percent: 9.1, listPrice: 9_900, price: 9_000, plan: "digital", limit: 15, number: 8 }]);
  });

  describe("«Сделки по договорённости» существующему клиенту", () => {
    let created: string[];
    beforeEach(() => {
      const t = clientsSetup();
      created = [];
      const sales: OnboardingSales = {
        stages: async () => [{ id: "st-work", kind: "open", name: "Взяли в работу" }],
        createDeal: async (d) => (created.push(d.title), { id: `deal-${created.length}`, number: 40 + created.length }),
        setAgreedPlan: async () => {},
        setAgreedGifts: async () => {},
        setBatch: async () => {},
        tagDeal: async () => {},
        addPayment: async () => ({ id: "pay-1" }),
        linkClient: async () => {},
        absorbRequests: async () => [],
        linkRequests: async () => {},
      };
      fake.clients = {
        clients: { find: async (id: string) => (id === CLIENT ? { id: CLIENT, name: "Айжан", email: "a@b.kz", phone: "77011234567", managerId: null } : null) },
        onboarding: new ClientOnboardingService({ provisionClient: async () => expect.unreachable("аккаунт уже есть") }, sales, t.clients, t.notes, t.tasks),
      };
    });
    // Оплачено полностью и без срока — задач нет (исполнитель задач в двойнике клиентов не нужен).
    const form = (agreed: string) => {
      const f = new FormData();
      for (const [k, v] of Object.entries({ clientId: CLIENT, count: "2", plan: "hardcover", agreed, prepaid: String(Number(agreed) * 2) })) f.set(k, v);
      return f;
    };

    it("сверх лимита — ни одной сделки и текст; без лимита — сделки и deal.discount по клиенту", async () => {
      signIn(kira);
      expect(await createClientDealsAction({}, form("20000"))).toMatchObject({ error: OVER });
      expect(created).toEqual([]);
      signIn(rita);
      expect((await createClientDealsAction({}, form("20000"))).done?.parts).toHaveLength(2);
      expect(created).toHaveLength(2);
      expect(discounts()).toEqual([{ via: "client_deals", percent: 33.3, listPrice: 30_000, price: 20_000, plan: "hardcover", limit: null, deals: [41, 42] }]);
    });
  });
});

describe("счёт бота — тоже точка продажи", () => {
  beforeEach(() => {
    resetRequest();
    resetContainer();
    for (const k of Object.keys(settings)) delete settings[k];
    settings["crm.maxDiscount"] = "15";
    settings["pay.transferPhone"] = "+7 700 111 22 33";
  });

  it("цену бот берёт из «Цен и тарифов», лимит — общий; прайс подняли между ходом и счётом сверх лимита — ошибка текстом, счёт выставит менеджер", async () => {
    const limits: unknown[] = [];
    fake.messaging = { queries: { conversation: async () => ({ id: "c1", channel: "whatsapp", chatId: "77011234567" }) } };
    fake.ordering = {
      kaspi: { available: async () => false },
      // Прайс твёрдой уже 36 000, а ход бота считался по 30 000.
      invoices: { issue: async (input: { agreedTotal: number; maxDiscountPercent: number | null }) => (limits.push(input.maxDiscountPercent), DiscountPolicy.check({ listPrice: 36_000, price: input.agreedTotal, maxPercent: input.maxDiscountPercent }), expect.unreachable()) },
    };
    const r = await botInvoices.issue({ conversationId: "c1", dealId: DEAL, plan: "hardcover", agreedTotal: 30_000, amount: 10_000, locale: "ru", clientName: "Айгерим", key: "bot:c1:3" });
    expect(limits).toEqual([15]);
    expect(r).toEqual({ error: `Цена ниже прайса (${formatPrice(36_000)}) больше чем на 15% — согласуйте с руководителем` });
  });
});
