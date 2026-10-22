import { afterEach, describe, expect, it } from "vitest";
import { applyCatalog, applySiteFlags, getAiPack, getAiPacks, registrationOpen, availableAddons, getAddons, getCatalogOverrides, getDeliveryOptions, getPlan, getPlans, getVisiblePlans, sanitizeOverrides } from "@/config/site";
import { calculatePrice } from "@/modules/ordering/domain/Pricing";
import { addonLabels, deliveryLabels, planLabels } from "@/modules/ordering/ui/labels";

afterEach(() => {
  applyCatalog(null);
  applySiteFlags({ registration: true });
});

describe("цены из админки", () => {
  it("по умолчанию действуют заводские цены; «Премиум» скрыт", () => {
    expect(getPlan("hardcover")).toMatchObject({ price: 30000, extraCopyPrice: 17900 });
    expect(getVisiblePlans().map((p) => p.id)).toEqual(["digital", "hardcover"]);
    expect(getAddons().map((a) => [a.id, a.price])).toEqual([["express", 5000], ["giftwrap", 5000]]);
    // Доставка не константа: курьер, по Казахстану и в другую страну — по расчёту, самовывоз бесплатный.
    expect(getDeliveryOptions().map((d) => [d.id, d.price, !!d.quoted])).toEqual([["courier", 0, true], ["post", 0, true], ["pickup", 0, false], ["abroad", 0, true]]);
  });

  it("цена доставки из админки делает её фиксированной; старая сохранённая цена без отметки — нет", () => {
    applyCatalog({ delivery: { courier: { price: 2500 }, post: { price: 3500 } } });
    expect(getDeliveryOptions().find((d) => d.id === "courier")).toMatchObject({ price: 0, quoted: true });
    expect(calculatePrice("hardcover", 1, "courier", null, []).deliveryAmount).toBe(0);
    applyCatalog({ delivery: { courier: { price: 2500, fixed: true } } });
    expect(getDeliveryOptions().find((d) => d.id === "courier")).toEqual({ id: "courier", price: 2500, maxDays: 2 });
    expect(getDeliveryOptions().find((d) => d.id === "post")).toMatchObject({ quoted: true });
    expect(calculatePrice("hardcover", 1, "courier", null, []).deliveryAmount).toBe(2500);
  });

  it("переопределения меняют цены, допы, доставку и видимость; расчёт заказа идёт по ним", () => {
    applyCatalog({ plans: { hardcover: { price: 28000, extraCopyPrice: 15000 }, premium: { hidden: false } }, addons: { giftwrap: { price: 4000 } }, delivery: { courier: { price: 2500, fixed: true } } });
    expect(getPlan("hardcover")).toMatchObject({ price: 28000, extraCopyPrice: 15000 });
    expect(getVisiblePlans().map((p) => p.id)).toEqual(["digital", "hardcover", "premium"]);
    const p = calculatePrice("hardcover", 2, "courier", null, ["giftwrap"]);
    expect(p).toMatchObject({ itemsAmount: 28000 + 15000, deliveryAmount: 2500, addonsAmount: 4000, amount: 43000 + 2500 + 4000 });
    // скрытый тариф остаётся доступным по id: старые заказы и сертификаты читаются как раньше
    applyCatalog({ plans: { hardcover: { hidden: true }, digital: { hidden: false } } });
    expect(getVisiblePlans().map((x) => x.id)).toEqual(["digital"]);
    expect(getPlan("hardcover")).toBeDefined();
  });

  it("сброс возвращает заводские значения; повторное применение того же значения ничего не меняет", () => {
    applyCatalog({ plans: { hardcover: { price: 1 * 28000 } } });
    const first = getPlans();
    applyCatalog({ plans: { hardcover: { price: 28000 } } });
    expect(getPlans()).toBe(first);
    applyCatalog(null);
    expect(getPlan("hardcover")!.price).toBe(30000);
    expect(getCatalogOverrides()).toEqual({});
  });

  it("договорённая цена книги, доставка сверху и фиксированный тариф работают поверх новых цен", () => {
    applyCatalog({ plans: { hardcover: { price: 28000 } }, delivery: { courier: { price: 3000, fixed: true } } });
    const p = calculatePrice("hardcover", 1, "courier", null, [], { agreedTotal: 20000, prepaid: 10000 });
    expect(p).toMatchObject({ itemsAmount: 28000, discountAmount: 8000, deliveryAmount: 3000, prepaidAmount: 10000, amount: 13000 });
    expect(availableAddons("premium")).toEqual([]);
  });

  it("санитайзер отбрасывает неверное: дроби, отрицательные, строки, лишние ключи; допэкземпляр у электронной не нужен; все тарифы скрыть нельзя", () => {
    expect(
      sanitizeOverrides({
        plans: { hardcover: { price: 1500.5, extraCopyPrice: -3, hidden: "yes" }, digital: { price: 8000, extraCopyPrice: 100 }, hacker: { price: 1 } },
        addons: { express: { price: "5000" }, giftwrap: { price: 0 } },
        delivery: { courier: { price: 99_999_999 }, pickup: { price: 0 } },
        extra: 1,
      }),
    ).toEqual({ plans: { digital: { price: 8000 } }, addons: { giftwrap: { price: 0 } }, delivery: { pickup: { price: 0 } } });
    expect(sanitizeOverrides(null)).toEqual({});
    expect(sanitizeOverrides("мусор")).toEqual({});
    // нельзя скрыть всё: переопределение тарифов отбрасывается целиком
    expect(sanitizeOverrides({ plans: { digital: { hidden: true }, hardcover: { hidden: true }, premium: { hidden: true } } })).toEqual({});
  });
});

describe("подписи каталога в CRM", () => {
  it("одна подпись на каждый тариф, доп и способ доставки; порядок доставки — как в списках выбора", () => {
    expect(planLabels).toEqual({ digital: "Электронная версия", hardcover: "Твёрдая обложка", premium: "Премиум" });
    expect(addonLabels).toEqual({ express: "Экспресс-печать", giftwrap: "Подарочная упаковка" });
    expect(Object.entries(deliveryLabels)).toEqual([["courier", "Курьер по городу"], ["post", "Доставка по Казахстану"], ["pickup", "Самовывоз"], ["abroad", "В другую страну (стоимость считает менеджер)"]]);
    expect(Object.keys(planLabels).sort()).toEqual(getPlans().map((p) => p.id).sort());
    expect(Object.keys(addonLabels).sort()).toEqual(getAddons().map((a) => a.id).sort());
    expect(Object.keys(deliveryLabels).sort()).toEqual(getDeliveryOptions().map((d) => d.id).sort());
  });
});

describe("переключатели сайта", () => {
  it("регистрация по умолчанию открыта; закрывается и открывается из админки", () => {
    expect(registrationOpen()).toBe(true);
    applySiteFlags({ registration: false });
    expect(registrationOpen()).toBe(false);
    applySiteFlags({});
    expect(registrationOpen()).toBe(false);
    applySiteFlags({ registration: true });
    expect(registrationOpen()).toBe(true);
  });
});

describe("пакеты запросов к ИИ-дизайнеру", () => {
  it("заводская сетка: 10/990, 30/2 490 (выгоднее), 100/5 990", () => {
    expect(getAiPacks().map((p) => [p.id, p.requests, p.price, !!p.featured, !!p.hidden])).toEqual([
      ["small", 10, 990, false, false],
      ["medium", 30, 2490, true, false],
      ["large", 100, 5990, false, false],
    ]);
  });

  it("цена, число запросов и продажа — из админки; неверное отбрасывается", () => {
    expect(sanitizeOverrides({ aiPacks: { small: { price: 1490, requests: 15 }, large: { hidden: true, requests: 0 }, giant: { price: 1 } } })).toEqual({ aiPacks: { small: { price: 1490, requests: 15 }, large: { hidden: true } } });
    applyCatalog({ aiPacks: { small: { price: 1490, requests: 15 }, large: { hidden: true } } });
    expect(getAiPack("small")).toMatchObject({ price: 1490, requests: 15 });
    expect(getAiPack("large")?.hidden).toBe(true);
    expect(getAiPack("medium")).toMatchObject({ price: 2490, requests: 30 });
  });
});
