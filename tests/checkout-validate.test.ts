import { describe, expect, it } from "vitest";
import { fieldOfServerError, stepOfField, validateCheckout, type CheckoutValues } from "../src/app/(app)/books/[id]/checkout/form/validate";
import { ru } from "@/i18n/messages/ru";

const e = ru.checkout.errors;
const ok: CheckoutValues = { contactName: "Алия", contactPhone: "+7 700 123 45 67", contactEmail: "a@b.kz", country: "", city: "Алматы", address: "Абая 10", postalCode: "", giftNote: "", consent: true };
const check = (v: Partial<CheckoutValues>, ctx: Parameters<typeof validateCheckout>[1] = { printed: true, delivery: "courier" }) => validateCheckout({ ...ok, ...v }, ctx, e);

describe("проверка оформления в браузере — те же правила, что у сервера", () => {
  it("всё заполнено — ошибок нет", () => {
    expect(check({})).toEqual({});
  });

  it("имя, телефон, почта и согласие", () => {
    expect(check({ contactName: " А " }).contactName).toBe(e.contactName);
    expect(check({ contactPhone: "123" }).contactPhone).toBe(e.phone);
    expect(check({ contactPhone: "+7 (700) 123-45-67" }).contactPhone).toBeUndefined();
    expect(check({ contactEmail: "почта" }).contactEmail).toBe(e.email);
    expect(check({ consent: false }).consent).toBe(e.consent);
  });

  it("адрес нужен при любой доставке, кроме самовывоза; у электронной версии доставки нет", () => {
    expect(check({ city: "", address: "ул" })).toMatchObject({ city: e.city, address: e.address });
    expect(check({ city: "", address: "" }, { printed: true, delivery: "pickup" })).toEqual({});
    expect(check({ city: "", address: "" }, { printed: false, delivery: "courier" })).toEqual({});
  });

  it("за границу — ещё страна и индекс", () => {
    expect(check({}, { printed: true, delivery: "abroad" })).toMatchObject({ country: e.country, postalCode: e.postalCode });
    expect(check({ country: "Россия", postalCode: "101000" }, { printed: true, delivery: "abroad" })).toEqual({});
  });

  it("текст открытки — до 500 знаков", () => {
    expect(check({ giftNote: "я".repeat(501) }).giftNote).toBe(e.giftNote);
    expect(check({ giftNote: "я".repeat(500) }).giftNote).toBeUndefined();
  });

  it("ошибку с сервера привязываем к полю и шагу", () => {
    expect(fieldOfServerError(e.city, e)).toBe("city");
    expect(fieldOfServerError(e.phone, e)).toBe("contactPhone");
    expect(fieldOfServerError(e.consent, e)).toBe("consent");
    expect(fieldOfServerError("Заказ уже оформлен", e)).toBeNull();
    expect(stepOfField("city")).toBe(1);
    expect(stepOfField("consent")).toBe(2);
  });
});
