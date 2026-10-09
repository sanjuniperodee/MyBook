import type { Locale } from "@/i18n/config";

/** Что менеджер может отправить клиенту из чата одной кнопкой. */
export interface ChatOffers {
  order: { number: number } | null;
  book: { title: string } | null;
  maxDiscount: number;
}

export type OfferRequest = { kind: "order" } | { kind: "book" } | { kind: "discount"; percent: number; hours: number };

export const DISCOUNT_HOURS = [24, 48, 72, 168];
/** Потолок скидки из настроек, но не больше 50%. */
export const discountCap = (setting: number) => Math.min(50, Math.max(0, setting || 0));

/** Тексты — на языке клиента (из его профиля на сайте). */
export const offerTexts = {
  ru: {
    order: (n: number, url: string) => `Ваш заказ №${n}: ${url}\nТам можно оплатить и следить за статусом.`,
    book: (title: string, url: string) => `Ваша книга «${title}» — продолжить можно здесь: ${url}`,
    discount: (p: number, code: string, until: string, url: string) => `Дарим персональную скидку ${p}% — промокод ${code}, действует до ${until}. Скидка применится сама по ссылке: ${url}`,
  },
  kk: {
    order: (n: number, url: string) => `Сіздің №${n} тапсырысыңыз: ${url}\nСол жерден төлеп, мәртебесін қадағалай аласыз.`,
    book: (title: string, url: string) => `«${title}» кітабыңызды осы жерден жалғастыра аласыз: ${url}`,
    discount: (p: number, code: string, until: string, url: string) => `Сізге жеке ${p}% жеңілдік — ${code} промокоды, жарамдылық мерзімі — ${until}. Сілтеме арқылы жеңілдік өзі қосылады: ${url}`,
  },
} satisfies Record<Locale, unknown>;
