/**
 * Коммерческие настройки проекта: бренд, контакты, цены, доставка.
 * Всё, что обычно меняет владелец бизнеса, собрано здесь.
 */

export const site = {
  name: "MyBooks",
  currency: "KZT",
  currencySign: "₸",
  contacts: {
    email: "hello@mybook.kz",
    phone: "+7 700 000 00 00",
    whatsapp: "https://wa.me/77000000000",
    telegram: "https://t.me/mybook_support",
    instagram: "https://instagram.com/mybook",
  },
  company: {
    // Реквизиты для оферты и футера — заполните своими данными. Адрес и название на двух языках — в словарях.
    legalName: "ИП «MyBooks»",
    bin: "000000000000",
  },
  /** Отзывы на лендинге. Секция скрыта, пока список пуст — добавляйте только реальные отзывы клиентов. */
  testimonials: [] as { name: string; text: string; occasion?: string }[],
};

/*
 * Тексты тарифов, доставки, допов и реквизиты перевода живут в словарях (src/i18n/messages/<язык>/common.ts):
 * здесь только цифры, чтобы цена не могла разойтись между языками.
 */

export type PlanId = "digital" | "hardcover" | "premium";

export interface Plan {
  id: PlanId;
  price: number;
  /** Цена каждого дополнительного экземпляра (для печатных тарифов). */
  extraCopyPrice?: number;
  printed: boolean;
  /** Выделить на витрине («Популярный выбор»). */
  featured?: boolean;
}

export const plans: Plan[] = [
  {
    id: "digital",
    price: 9900,
    printed: false,
  },
  {
    id: "hardcover",
    price: 24900,
    extraCopyPrice: 17900,
    printed: true,
    featured: true,
  },
  {
    id: "premium",
    price: 34900,
    extraCopyPrice: 24900,
    printed: true,
  },
];

export type DeliveryId = "pickup" | "courier" | "post";

export const deliveryOptions: { id: DeliveryId; price: number; /** Максимальный срок доставки, дней — для расчёта «успеть к дате». */ maxDays: number }[] = [
  { id: "courier", price: 2000, maxDays: 2 },
  { id: "post", price: 3500, maxDays: 7 },
  { id: "pickup", price: 0, maxDays: 0 },
];

export type AddonId = "express" | "giftwrap";

/** Дополнения к печатному заказу. hiddenFor — тарифы, где услуга уже включена. */
export const addons: { id: AddonId; price: number; hiddenFor: PlanId[] }[] = [
  { id: "express", price: 5000, hiddenFor: ["digital", "premium"] },
  { id: "giftwrap", price: 3000, hiddenFor: ["digital", "premium"] },
];

export function availableAddons(plan: PlanId) {
  return addons.filter((a) => !a.hiddenFor.includes(plan));
}

/** Сроки производства печатной книги в рабочих днях. */
export const productionDays = { standard: "5–7", premium: "3–4" };
/** Верхняя граница сроков производства (рабочие дни) — по ней считаем «закажите до». */
export const productionWorkdays = { standard: 7, premium: 4 };

export function formatPrice(amount: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(amount)} ${site.currencySign}`;
}

export function getPlan(id: string): Plan | undefined {
  return plans.find((p) => p.id === id);
}
