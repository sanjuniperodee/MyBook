import { describe, expect, it } from "vitest";
import { PaymentError, ReceiptError } from "@/modules/sales";
import { SalesError } from "@/modules/sales/domain";
import { WazzupError } from "@/modules/messaging";
import { OrderingError } from "@/modules/ordering/domain";

// Единые ошибки (E4): проверка через XError.is() по метке и контексту, а не instanceof — классы в слоях бандла Next.js разные.

describe("XError.is(): ошибки платежей, чеков и Wazzup", () => {
  it("своя ошибка узнаётся, чужая — нет (контексты не пересекаются)", () => {
    const payment = new PaymentError("refundTooBig");
    const receipt = new ReceiptError("tooBig");
    const wazzup = new WazzupError("Неверный API-ключ Wazzup");
    expect([PaymentError.is(payment), ReceiptError.is(receipt), WazzupError.is(wazzup)]).toEqual([true, true, true]);
    expect([PaymentError.is(receipt), ReceiptError.is(payment), WazzupError.is(payment), SalesError.is(payment), OrderingError.is(wazzup)]).toEqual([false, false, false, false, false]);
    expect([PaymentError.is(new Error("amount")), ReceiptError.is(null), WazzupError.is("строка")]).toEqual([false, false, false]);
  });

  it("код и текст сохраняются: code — причина, message — понятный сотруднику текст (у Wazzup) или код", () => {
    expect(new PaymentError("amount")).toMatchObject({ code: "amount", message: "amount", name: "PaymentError" });
    expect(new ReceiptError("type")).toMatchObject({ code: "type", name: "ReceiptError" });
    expect(new WazzupError("Wazzup недоступен, попробуйте ещё раз")).toMatchObject({ code: "wazzup", message: "Wazzup недоступен, попробуйте ещё раз", name: "WazzupError" });
  });

  it("метка работает и у ошибки из другой копии класса (другой слой бандла)", () => {
    const otherLayer = Object.assign(new Error("копия"), { context: "payments", code: "date", [Symbol.for("mybook.domain-error")]: true });
    expect(PaymentError.is(otherLayer)).toBe(true);
    expect(otherLayer instanceof PaymentError).toBe(false);
  });
});
