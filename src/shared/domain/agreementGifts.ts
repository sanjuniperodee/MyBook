/**
 * Что по договорённости идёт клиенту бесплатно: подарочная упаковка и (или) доставка. Менеджер отмечает это в счёте, при
 * заведении клиента или в карточке сделки. Сами допы клиент выбирает при оформлении заказа как обычно — отмеченное
 * менеджером стоит 0 ₸. Модуль без зависимостей: его читают продажи, заказы, счета и интерфейс.
 */
export const AGREEMENT_GIFTS = ["giftwrap", "delivery"] as const;
export type AgreementGift = (typeof AGREEMENT_GIFTS)[number];

export const isAgreementGift = (v: unknown): v is AgreementGift => typeof v === "string" && (AGREEMENT_GIFTS as readonly string[]).includes(v);

/** Значение из базы или формы → список без повторов и неизвестного, в постоянном порядке. */
export function readGifts(raw: unknown): AgreementGift[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  return AGREEMENT_GIFTS.filter((g) => list.some((x) => typeof x === "string" && x.trim() === g));
}
