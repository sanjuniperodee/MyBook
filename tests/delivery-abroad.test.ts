import { describe, expect, it } from "vitest";
import { applyCatalog, getDeliveryOptions, isQuotedDelivery, sanitizeOverrides } from "@/config/site";
import { calculatePrice, quoteCheckout } from "@/modules/ordering/domain/Pricing";
import type { OrderPlaced } from "@/modules/ordering/domain";
import { deliveryAddress } from "@/modules/ordering/ui/labels";
import { catalogVars } from "@/modules/messaging/domain/botFaq";
import { businessContext } from "@/modules/assistant/domain/prompts";
import { messagesFor } from "@/i18n/messages";
import { setup } from "./doubles/ordering";

/**
 * Доставка в другую страну: клиент выбирает её при оформлении, стоимость в заказ не входит — менеджер считает её
 * отдельно по адресу и получает задачу; клиенту везде написано «рассчитает менеджер».
 */
const abroad = { method: "abroad" as const, country: " Россия ", city: "Москва", address: "Тверская, 1", postalCode: "125009" };

describe("способ «в другую страну»", () => {
  it("есть в каталоге, цены нет и задать её в админке нельзя", () => {
    applyCatalog(null);
    expect(getDeliveryOptions().find((d) => d.id === "abroad")).toMatchObject({ price: 0, quoted: true });
    expect(isQuotedDelivery("abroad")).toBe(true);
    expect(isQuotedDelivery("pickup")).toBe(false);
    expect(isQuotedDelivery(null)).toBe(false);
    expect(sanitizeOverrides({ delivery: { abroad: { price: 15000 }, post: { price: 4000 }, pickup: { price: 500 } } })).toEqual({ delivery: { pickup: { price: 500 } } });
  });

  it("в сумму заказа доставка не входит; бесплатная доставка по договорённости её не касается", () => {
    const p = calculatePrice("hardcover", 1, "abroad", null, ["giftwrap"]);
    expect(p).toMatchObject({ deliveryAmount: 0, addonsAmount: 5000, amount: 35000 });
    const gift = calculatePrice("hardcover", 1, "abroad", null, [], { agreedTotal: 30000, prepaid: 0, gifts: ["delivery"] });
    expect(gift.gifted).toBeUndefined();
    expect(gift.deliveryAmount).toBe(0);
  });

  it("клиенту и в письме — «рассчитает менеджер», на обоих языках", () => {
    for (const locale of ["ru", "kk"] as const) {
      const m = messagesFor(locale);
      expect(m.common.delivery.abroad.name).toBeTruthy();
      expect(m.checkout.quoted.note.length).toBeGreaterThan(40);
      expect(m.checkout.errors.country).toBeTruthy();
      expect(m.orders.order.quotedNote).toBeTruthy();
      expect(m.mail.order.created.quoted("Россия")).toContain("Россия");
    }
    expect(messagesFor("ru").checkout.quoted.price).toBe("рассчитывается индивидуально");
  });
});

describe("заказ с доставкой в другую страну", () => {
  it("страна сохраняется, в журнале — что доставку считает менеджер, в событии — для задачи менеджеру; форма и сервер считают одинаково", async () => {
    const t = setup();
    const order = await t.place({ delivery: abroad, addons: ["giftwrap"] });
    const s = order.snapshot();
    expect(s.delivery).toEqual({ ...abroad, country: "Россия" });
    expect(s.price.deliveryAmount).toBe(0);
    const quote = quoteCheckout({ plan: "hardcover", quantity: 1, delivery: "abroad", discount: null, addons: ["giftwrap"], agreement: null });
    expect(s.price).toEqual(quote.price);
    const history = t.orders.history.map((h) => h.note).join("\n");
    expect(history).toContain("доставка (Россия, Москва) — в сумму не входит, стоимость рассчитывается индивидуально");
    const placed = t.uow.published.find((e) => e.type === "ordering.order_placed") as OrderPlaced;
    expect(placed.payload.deliveryQuoted).toEqual({ method: "abroad", country: "Россия", city: "Москва" });
  });

  it("по Казахстану страна не хранится; доставка тоже по расчёту — в сумму не входит, менеджеру задача", async () => {
    const t = setup();
    const order = await t.place({ delivery: { ...abroad, method: "post", city: "Караганда" } });
    expect(order.snapshot().delivery.country).toBeNull();
    expect(order.snapshot().price.deliveryAmount).toBe(0);
    const placed = t.uow.published.find((e) => e.type === "ordering.order_placed") as OrderPlaced;
    expect(placed.payload.deliveryQuoted).toEqual({ method: "post", country: null, city: "Караганда" });
  });

  it("доставку по Казахстану отдали бесплатно по договорённости — она бесплатная, а не «по расчёту»", () => {
    expect(isQuotedDelivery("courier")).toBe(true);
    expect(isQuotedDelivery("courier", ["delivery"])).toBe(false);
    expect(isQuotedDelivery("abroad", ["delivery"])).toBe(true);
  });

  it("адрес одной строкой: страна, индекс, город, адрес", () => {
    expect(deliveryAddress({ country: "Россия", postalCode: "125009", city: "Москва", address: "Тверская, 1" })).toBe("Россия, 125009, Москва, Тверская, 1");
    expect(deliveryAddress({ country: null, postalCode: null, city: "Алматы", address: "Абая, 1" })).toBe("Алматы, Абая, 1");
  });
});

describe("боты знают о доставке в другие страны", () => {
  const catalog = { plans: [{ id: "hardcover", price: 30000 }], delivery: [{ id: "courier", price: 0, quoted: true }, { id: "pickup", price: 0 }, { id: "abroad", price: 0 }], addons: [], productionDays: { standard: "5–7", premium: "3–4" } };
  it("шаблонный бот: «рассчитывается индивидуально», а не «бесплатно»; без способа в каталоге — пусто", () => {
    expect(catalogVars(catalog, "ru")["доставка.заграница"]).toBe("стоимость рассчитывается индивидуально");
    expect(catalogVars(catalog, "ru")["доставка.курьер"]).toBe("стоимость рассчитывается индивидуально");
    expect(catalogVars(catalog, "ru")["доставка.самовывоз"]).toBe("бесплатно");
    expect(catalogVars(catalog, "kk")["доставка.заграница"]).toBe("құны жеке есептеледі");
    expect(catalogVars({ ...catalog, delivery: [] }, "ru")["доставка.заграница"]).toBe("");
  });

  it("AI: доставку в другую страну считает менеджер, цену не называть", () => {
    applyCatalog(null);
    const text = businessContext();
    expect(text).toContain("в другие страны");
    expect(text).toContain("рассчитывается индивидуально");
    expect(text).not.toMatch(/в другие страны[^;]*бесплатно/);
    expect(text).not.toMatch(/курьер[^;]*₸/);
  });
});
