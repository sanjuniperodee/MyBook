/**
 * Коммерческие настройки проекта: бренд, контакты, цены, доставка.
 * Всё, что обычно меняет владелец бизнеса, собрано здесь.
 */

export const site = {
  name: "MyBook",
  tagline: "Книга о самом важном, написанная вами",
  description:
    "Персональная книга-подарок: отвечайте на вопросы, добавляйте фотографии, выбирайте обложку — мы напечатаем настоящую книгу в твёрдом переплёте.",
  locale: "ru_RU",
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
    // Реквизиты для оферты и футера — заполните своими данными.
    legalName: "ИП «MyBook»",
    bin: "000000000000",
    address: "г. Алматы",
  },
  /** Реквизиты для оплаты переводом (PAYMENT_PROVIDER=manual). Номер заказа клиент указывает в комментарии. */
  manualPayment: {
    title: "Kaspi перевод",
    steps: [
      "Откройте Kaspi.kz → Платежи → Переводы → По номеру телефона",
      "Номер получателя: +7 700 000 00 00 (ИП «MyBook»)",
      "В комментарии укажите номер заказа",
    ],
  },
  /** Отзывы на лендинге. Секция скрыта, пока список пуст — добавляйте только реальные отзывы клиентов. */
  testimonials: [] as { name: string; text: string; occasion?: string }[],
};

export type PlanId = "digital" | "hardcover" | "premium";

export interface Plan {
  id: PlanId;
  name: string;
  price: number;
  /** Цена каждого дополнительного экземпляра (для печатных тарифов). */
  extraCopyPrice?: number;
  printed: boolean;
  badge?: string;
  features: string[];
}

export const plans: Plan[] = [
  {
    id: "digital",
    name: "Электронная",
    price: 9900,
    printed: false,
    features: [
      "PDF-книга в высоком разрешении",
      "Файл готов к печати в любой типографии",
      "Все главы, фото и оглавление",
      "Доступ сразу после оплаты",
    ],
  },
  {
    id: "hardcover",
    name: "Твёрдая обложка",
    price: 24900,
    extraCopyPrice: 17900,
    printed: true,
    badge: "Популярный выбор",
    features: [
      "Твёрдый переплёт, шитый блок",
      "Плотная бумага 150 г/м²",
      "Полноцветная печать фото",
      "PDF-версия в подарок",
    ],
  },
  {
    id: "premium",
    name: "Премиум",
    price: 34900,
    extraCopyPrice: 24900,
    printed: true,
    features: [
      "Всё из тарифа «Твёрдая обложка»",
      "Дизайнерская бумага 170 г/м²",
      "Подарочная коробка и открытка",
      "Приоритетное производство",
    ],
  },
];

export type DeliveryId = "pickup" | "courier" | "post";

export const deliveryOptions: { id: DeliveryId; name: string; price: number; description: string; /** Максимальный срок доставки, дней — для расчёта «успеть к дате». */ maxDays: number }[] = [
  { id: "courier", name: "Курьер по городу", price: 2000, description: "Алматы и Астана, 1–2 дня после печати", maxDays: 2 },
  { id: "post", name: "Доставка по Казахстану", price: 3500, description: "Казпочта / СДЭК, 3–7 дней", maxDays: 7 },
  { id: "pickup", name: "Самовывоз", price: 0, description: "Из нашей студии в Алматы", maxDays: 0 },
];

export type AddonId = "express" | "giftwrap";

/** Дополнения к печатному заказу. hiddenFor — тарифы, где услуга уже включена. */
export const addons: { id: AddonId; name: string; description: string; price: number; hiddenFor: PlanId[] }[] = [
  { id: "express", name: "Экспресс-печать", description: "Печатаем вне очереди — за 3–4 рабочих дня", price: 5000, hiddenFor: ["digital", "premium"] },
  { id: "giftwrap", name: "Подарочная упаковка", description: "Крафтовая коробка, лента и открытка с вашим текстом", price: 3000, hiddenFor: ["digital", "premium"] },
];

export function addonName(id: string) {
  return addons.find((a) => a.id === id)?.name ?? id;
}

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
