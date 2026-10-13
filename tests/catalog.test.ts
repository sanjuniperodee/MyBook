import { afterEach, describe, expect, it } from "vitest";
import { applyCatalog, applySiteFlags, registrationOpen, availableAddons, getAddons, getCatalogOverrides, getDeliveryOptions, getPlan, getPlans, getVisiblePlans, sanitizeOverrides } from "@/config/site";
import { calculatePrice } from "@/modules/ordering/domain/Pricing";

afterEach(() => {
  applyCatalog(null);
  applySiteFlags({ registration: true });
});

describe("цены из админки", () => {
  it("по умолчанию действуют заводские цены; «Премиум» скрыт", () => {
    expect(getPlan("hardcover")).toMatchObject({ price: 30000, extraCopyPrice: 17900 });
    expect(getVisiblePlans().map((p) => p.id)).toEqual(["digital", "hardcover"]);
    expect(getAddons().map((a) => [a.id, a.price])).toEqual([["express", 5000], ["giftwrap", 5000]]);
    expect(getDeliveryOptions().map((d) => [d.id, d.price])).toEqual([["courier", 2000], ["post", 3500], ["pickup", 0]]);
  });

  it("переопределения меняют цены, допы, доставку и видимость; расчёт заказа идёт по ним", () => {
    applyCatalog({ plans: { hardcover: { price: 28000, extraCopyPrice: 15000 }, premium: { hidden: false } }, addons: { giftwrap: { price: 4000 } }, delivery: { courier: { price: 2500 } } });
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
    applyCatalog({ plans: { hardcover: { price: 28000 } }, delivery: { courier: { price: 3000 } } });
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
