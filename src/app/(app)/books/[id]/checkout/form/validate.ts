import type { DeliveryId } from "@/config/site";
import { isAbroadDelivery } from "@/config/site";

/** Значения полей оформления, которые проверяются в браузере до отправки (те же правила, что в схеме createOrderAction). */
export interface CheckoutValues {
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  country: string;
  city: string;
  address: string;
  postalCode: string;
  giftNote: string;
  consent: boolean;
}

export type CheckoutField = keyof CheckoutValues;
export type CheckoutErrors = Partial<Record<CheckoutField, string>>;

/** Тексты ошибок — checkout.errors (те же, что вернёт сервер). */
export interface ErrorTexts {
  contactName: string;
  phone: string;
  email: string;
  giftNote: string;
  consent: string;
  city: string;
  address: string;
  country: string;
  postalCode: string;
}

/** Шаг мастера, на котором лежит поле: 1 — доставка и контакты, 2 — проверка и оплата. */
export const stepOfField = (f: CheckoutField): 1 | 2 => (f === "consent" ? 2 : 1);

const PHONE = /^[+\d][\d\s()-]{9,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Проверка полей: printed — печатный тариф (нужна доставка), delivery — выбранный способ. Тот же порядок и те же
 * правила, что у сервера; сервер остаётся последней инстанцией.
 */
export function validateCheckout(v: CheckoutValues, ctx: { printed: boolean; delivery: DeliveryId }, e: ErrorTexts): CheckoutErrors {
  const out: CheckoutErrors = {};
  if (v.contactName.trim().length < 2) out.contactName = e.contactName;
  if (!PHONE.test(v.contactPhone.trim())) out.contactPhone = e.phone;
  if (!EMAIL.test(v.contactEmail.trim())) out.contactEmail = e.email;
  if (v.giftNote.trim().length > 500) out.giftNote = e.giftNote;
  if (ctx.printed && ctx.delivery !== "pickup") {
    const abroad = isAbroadDelivery(ctx.delivery);
    if (abroad && v.country.trim().length < 2) out.country = e.country;
    if (!v.city.trim()) out.city = e.city;
    if (v.address.trim().length < 5) out.address = e.address;
    if (abroad && !v.postalCode.trim()) out.postalCode = e.postalCode;
  }
  if (!v.consent) out.consent = e.consent;
  return out;
}

/** Какому полю принадлежит текст ошибки, пришедший с сервера (одна строка без кода). */
export function fieldOfServerError(message: string, e: ErrorTexts): CheckoutField | null {
  const map: [string, CheckoutField][] = [
    [e.contactName, "contactName"],
    [e.phone, "contactPhone"],
    [e.email, "contactEmail"],
    [e.giftNote, "giftNote"],
    [e.consent, "consent"],
    [e.city, "city"],
    [e.address, "address"],
    [e.country, "country"],
    [e.postalCode, "postalCode"],
  ];
  return map.find(([text]) => text === message)?.[1] ?? null;
}
