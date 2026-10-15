import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccessError } from "@/modules/access/domain";
import { IdentityError, type IdentityErrorCode } from "@/modules/identity/domain";
import { PaymentError, ReceiptError } from "@/modules/sales";
import { SalesError } from "@/modules/sales/domain";
import { WazzupError } from "@/modules/messaging";
import { OrderingError, type OrderingErrorCode } from "@/modules/ordering/domain";
import { actionError, staffActionError } from "@/server/errors";
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
    expect(await actionError(new IdentityError("nope" as never), IdentityError)).toBe("Неверный логин или пароль");
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

  it("остальные ошибки домена: message — готовый текст для сотрудника; без message (только код) текста нет — null, код не показываем", async () => {
    expect(await actionError(new AccessError("lastOwner", "Должен остаться хотя бы один руководитель"), AccessError)).toBe("Должен остаться хотя бы один руководитель");
    expect(await actionError(new SalesError("stageHasDeals", "На этапе 3 сделок — сначала перенесите их"))).toBe("На этапе 3 сделок — сначала перенесите их");
    expect(await actionError(new SalesError("dealNotFound"), SalesError)).toBeNull();
  });

  it("B11: у каждого кода IdentityError и OrderingError есть текст на обоих языках — машинный код сотруднику не показывается", async () => {
    // satisfies Record<…> делает списки исчерпывающими: новый код без строки здесь не скомпилируется
    const identity = { email: 1, password: 1, exists: 1, phone: 1, credentials: 1, resetExpired: 1, twoFactorCode: 1, twoFactorExpired: 1, twoFactorAlreadyOn: 1 } satisfies Record<IdentityErrorCode, 1>;
    const ordering = {
      bookNotFound: 1, alreadyOrdered: 1, upgradeUnavailable: 1, notReady: 1, promoGone: 1, empty: 1, notFound: 1, expired: 1, used: 1, ownCode: 1, firstOrderOnly: 1, orderNotFound: 1,
      invalidTransition: 1, promoExists: 1, giftNotFound: 1, giftPastDate: 1, giftNeedEmail: 1, staffNotFound: 1, notPayable: 1, phoneInvalid: 1, invoiceNotFound: 1, kaspiNotConnected: 1, kaspiUnavailable: 1,
    } satisfies Record<OrderingErrorCode, 1>;
    for (const locale of ["ru", "kk"]) {
      request.cookies.set("mb_locale", locale);
      for (const code of Object.keys(identity) as IdentityErrorCode[]) {
        const text = await actionError(new IdentityError(code));
        expect([code, text?.length ? text : null]).toEqual([code, expect.any(String)]);
        expect(text).not.toBe(code);
      }
      for (const code of Object.keys(ordering) as OrderingErrorCode[]) {
        const text = await actionError(new OrderingError(code, "сообщение домена"));
        expect([code, text?.length ? text : null]).toEqual([code, expect.any(String)]);
        expect(text).not.toBe(code);
      }
    }
  });

  it("B11: 2FA сотрудника и платёжные коды — словари admin и api", async () => {
    expect(await actionError(new IdentityError("twoFactorAlreadyOn"), IdentityError)).toBe("2FA уже включена");
    expect(await actionError(new OrderingError("notPayable"), OrderingError)).toBe("Этот заказ уже не ждёт оплаты — обновите страницу");
    expect(await actionError(new OrderingError("kaspiNotConnected"), OrderingError)).toContain("Kaspi");
  });
});

describe("staffActionError(): действия сотрудника CRM — всегда по-русски, cookie языка сайта не влияет", () => {
  it("cookie mb_locale=kk без заголовка x-mb-locale (в /admin proxy его не ставит): тексты русские, у покупателя — казахские", async () => {
    request.cookies.set("mb_locale", "kk");
    expect(staffActionError(new OrderingError("orderNotFound"), OrderingError)).toBe("Заказ не найден");
    expect(staffActionError(new OrderingError("alreadyOrdered"), OrderingError)).toBe("По этой книге уже оформлен заказ");
    expect(staffActionError(new IdentityError("email"), IdentityError)).toBe("Проверьте адрес почты");
    expect(staffActionError(new IdentityError("twoFactorCode"), IdentityError)).toBe("Неверный код. Проверьте время на телефоне и попробуйте ещё раз.");
    expect(await actionError(new OrderingError("orderNotFound"), OrderingError)).toBe("Тапсырыс табылмады");
  });

  it("выбор ошибок и сообщение домена — как у actionError: чужая ошибка и не доменная — null, message — готовый текст", () => {
    expect(staffActionError(new Error("db down"))).toBeNull();
    expect(staffActionError(new OrderingError("notFound"), IdentityError)).toBeNull();
    expect(staffActionError(new SalesError("dealNotFound"), SalesError)).toBeNull();
    expect(staffActionError(new AccessError("lastOwner", "Должен остаться хотя бы один руководитель"), AccessError)).toBe("Должен остаться хотя бы один руководитель");
    expect(staffActionError(new IdentityError("twoFactorAlreadyOn"), IdentityError)).toBe("2FA уже включена");
  });
});
