import { describe, expect, it } from "vitest";
import { quoteCheckout } from "@/modules/ordering/domain/Pricing";
import { applyCatalog, getPlan, type DeliveryId, type PlanId } from "@/config/site";
import { addPromo, admin, setup } from "./doubles/ordering";

/**
 * Форма оформления (CheckoutForm) показывает итог функцией quoteCheckout, сервер (OrdersService.place) считает цену
 * заказа сам — тарифом и договорённостью из checkoutTerms. Суммы и тариф должны совпадать для любого сочетания (D6).
 */
const deliveryOf = (method: DeliveryId) => ({ method, city: method === "pickup" ? null : "Алматы", address: method === "pickup" ? null : "Абая, 1", postalCode: null });

describe("Оформление: форма и сервер считают одинаково", () => {
  const plans: PlanId[] = ["digital", "hardcover", "premium"];
  const deliveries: DeliveryId[] = ["courier", "post", "pickup", "abroad"];
  const agreements = [null, { agreedTotal: 20_000, prepaid: 5_000, plan: null }, { agreedTotal: 25_000, prepaid: 30_000, plan: "premium" as PlanId }];
  const promos = [null, { code: "SALE10", kind: "percent" as const, value: 10 }, { code: "MINUS", kind: "fixed" as const, value: 50_000 }];

  it("тариф, допы, экземпляры, доставка, промокод, договорённость и «аванс»", async () => {
    let cases = 0;
    for (const plan of plans)
      for (const delivery of deliveries)
        for (const agreement of agreements)
          for (const mode of ["agreed", "advance"] as const)
            for (const promo of promos)
              for (const [quantity, addons] of [[1, []], [3, ["express", "giftwrap"]]] as const) {
                if (!agreement && mode === "advance") continue;
                const t = setup();
                if (promo) await addPromo(t.promos, promo.code, { kind: promo.kind, value: promo.value });
                t.setAgreement(agreement && { dealId: "d1", dealNumber: 6, deadline: null, ...agreement });
                const input = { plan, quantity, delivery: deliveryOf(delivery), addons: [...addons], promoCode: promo?.code, agreementMode: mode };
                const quote = quoteCheckout({ plan, quantity, delivery, discount: promo && { kind: promo.kind, value: promo.value }, addons, agreement, mode });
                // Скрытый тариф — только по договорённости, где он закреплён; иначе ошибка, а не подмена (deals-d17).
                if (getPlan(quote.plan)?.hidden && quote.lockedPlan !== quote.plan) {
                  await expect(t.place(input)).rejects.toMatchObject({ code: "planUnavailable" });
                  continue;
                }
                const order = await t.place(input);
                const server = order.snapshot();
                expect({ plan: quote.plan, price: quote.price }, JSON.stringify({ plan, delivery, agreement, mode, promo, quantity })).toEqual({ plan: server.plan, price: { prepaidAmount: undefined, ...server.price } });
                cases++;
              }
    expect(cases).toBeGreaterThan(200);
  });

  it("дозаказ печатной версии к электронной: оплата электронной — аванс, договорённость не применяется", async () => {
    const t = setup();
    const digital = await t.place({ plan: "digital", delivery: deliveryOf("pickup") });
    await t.svc.confirmPayment({ orderId: digital.id, paymentId: null }, admin);
    const credit = (await t.svc.upgradeOffer(digital.id, "user-1"))!.credit;
    t.setAgreement({ dealId: "d1", dealNumber: 6, deadline: null, agreedTotal: 1_000, prepaid: 999, plan: "premium" });
    const order = await t.place({ plan: "hardcover", upgradeFromOrderId: digital.id, delivery: deliveryOf("courier"), addons: ["giftwrap"] });
    const quote = quoteCheckout({ plan: "hardcover", quantity: 1, delivery: "courier", discount: null, addons: ["giftwrap"], agreement: null, upgradeCredit: credit });
    expect({ plan: quote.plan, price: quote.price }).toEqual({ plan: order.snapshot().plan, price: order.snapshot().price });
    expect(quote.price.prepaidAmount).toBe(credit);
  });

  it("deals-d17: тариф скрыли, пока клиент оформлял, — ошибка «тариф недоступен», а не заказ с другим тарифом", async () => {
    try {
      applyCatalog({ plans: { hardcover: { hidden: true } } });
      const t = setup();
      await expect(t.place({ plan: "hardcover", delivery: deliveryOf("courier") })).rejects.toMatchObject({ code: "planUnavailable" });
      t.setAgreement({ dealId: "d1", dealNumber: 6, deadline: null, agreedTotal: 20_000, prepaid: 0, plan: "hardcover" });
      expect((await t.place({ plan: "digital", delivery: deliveryOf("courier"), agreementMode: "agreed" })).snapshot().plan).toBe("hardcover");
      const advance = setup();
      advance.setAgreement({ dealId: "d1", dealNumber: 6, deadline: null, agreedTotal: 20_000, prepaid: 0, plan: "hardcover" });
      await expect(advance.place({ plan: "hardcover", delivery: deliveryOf("courier"), agreementMode: "advance" })).rejects.toMatchObject({ code: "planUnavailable" });
    } finally {
      applyCatalog(null);
    }
  });
});
