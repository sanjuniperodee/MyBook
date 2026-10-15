import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccessError } from "@/modules/access/domain";
import { IdentityError } from "@/modules/identity/domain";
import { PaymentError, ReceiptError } from "@/modules/sales";
import { SalesError } from "@/modules/sales/domain";
import { WazzupError } from "@/modules/messaging";
import { OrderingError } from "@/modules/ordering/domain";
import { actionError } from "@/server/errors";
import { request, resetRequest } from "./doubles/web";

vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);

beforeEach(() => resetRequest());

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

describe("actionError(): ошибка домена в server action → текст для формы", () => {
  it("не ошибка домена и не та ошибка, которую ждёт действие, — null (действие пробросит её)", async () => {
    expect(await actionError(new Error("db down"))).toBeNull();
    expect(await actionError("строка")).toBeNull();
    expect(await actionError(new OrderingError("notFound"), IdentityError)).toBeNull();
    expect(await actionError(new IdentityError("email"), AccessError, OrderingError)).toBeNull();
    expect(await actionError(new IdentityError("email"), AccessError, IdentityError)).toBe("Проверьте адрес почты");
    expect(await actionError(new IdentityError("email"))).toBe("Проверьте адрес почты");
  });

  it("IdentityError: текст auth.errors на языке запроса; код без текста — «неверный логин или пароль»", async () => {
    expect(await actionError(new IdentityError("exists"), IdentityError)).toBe("Этот e-mail уже зарегистрирован. Войдите в аккаунт.");
    expect(await actionError(new IdentityError("tooMany"), IdentityError)).toBe("Неверный логин или пароль");
    request.cookies.set("mb_locale", "kk");
    expect(await actionError(new IdentityError("credentials"), IdentityError)).toBe("Логин немесе құпиясөз қате");
  });

  it("OrderingError: оформление — checkout.promo и checkout.errors на языке клиента, notReady несёт свой текст", async () => {
    expect(await actionError(new OrderingError("notFound"), OrderingError)).toBe("Такого промокода нет");
    expect(await actionError(new OrderingError("promoGone"), OrderingError)).toBe("Промокод больше не действует");
    expect(await actionError(new OrderingError("notReady", "Добавьте хотя бы один ответ"), OrderingError)).toBe("Добавьте хотя бы один ответ");
    request.cookies.set("mb_locale", "kk");
    expect(await actionError(new OrderingError("alreadyOrdered"), OrderingError)).toBe("Бұл кітапқа тапсырыс берілген");
  });

  it("OrderingError: действия сотрудника над заказом — словари api и admin", async () => {
    expect(await actionError(new OrderingError("orderNotFound"), OrderingError)).toBe("Заказ не найден");
    expect(await actionError(new OrderingError("invalidTransition", "pending_payment → delivered"), OrderingError)).toBe("Такой переход статуса невозможен");
    expect(await actionError(new OrderingError("staffNotFound"), OrderingError)).toBe("Ответственным может быть только сотрудник CRM");
    expect(await actionError(new OrderingError("promoExists"), OrderingError)).toBe("Такой промокод уже есть");
  });

  it("остальные ошибки домена: message — готовый текст для сотрудника", async () => {
    expect(await actionError(new AccessError("lastOwner", "Должен остаться хотя бы один руководитель"), AccessError)).toBe("Должен остаться хотя бы один руководитель");
    expect(await actionError(new SalesError("stageHasDeals", "На этапе 3 сделок — сначала перенесите их"))).toBe("На этапе 3 сделок — сначала перенесите их");
  });
});
