import { normalizePhone } from "@/shared/domain/phone";

/** Служебный домен для клиента без почты: зарезервирован (RFC 2606), письма на него никуда не уходят. */
export const PHONE_EMAIL_DOMAIN = "phone.invalid";

/** Адрес-заглушка для клиента без почты: в аккаунте e-mail обязателен, а входит такой клиент по телефону. */
export const phoneEmail = (phone: string) => `${normalizePhone(phone)}@${PHONE_EMAIL_DOMAIN}`;

/** Адрес-заглушка (не настоящая почта клиента): ему нельзя слать письма и не стоит показывать как контакт. */
export const isPhoneEmail = (email: string | null | undefined) => !!email && email.trim().toLowerCase().endsWith(`@${PHONE_EMAIL_DOMAIN}`);

export type LoginId = { kind: "email"; value: string } | { kind: "phone"; value: string };

/** Что ввели в поле «логин»: адрес почты или номер телефона (8 775…, +7 775…, 775… — всё приводится к 7775…). */
export function parseLoginId(raw: string): LoginId | null {
  const text = raw.trim();
  if (!text) return null;
  if (text.includes("@")) {
    const value = text.toLowerCase();
    return value.length <= 200 ? { kind: "email", value } : null;
  }
  const digits = normalizePhone(text);
  return digits.length >= 10 && digits.length <= 15 ? { kind: "phone", value: digits } : null;
}
