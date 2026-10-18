/**
 * Коммерческие настройки проекта: бренд, контакты, цены, доставка.
 * Всё, что обычно меняет владелец бизнеса, собрано здесь.
 */

import { AGREEMENT_GIFTS, readGifts, type AgreementGift } from "@/shared/domain/agreementGifts";

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
export type DeliveryId = "pickup" | "courier" | "post";
export type AddonId = "express" | "giftwrap";

export interface Plan {
  id: PlanId;
  price: number;
  /** Цена каждого дополнительного экземпляра (для печатных тарифов). */
  extraCopyPrice?: number;
  printed: boolean;
  /** Выделить на витрине («Популярный выбор»). */
  featured?: boolean;
  /** Не продаётся: нет на витрине, в оформлении, сертификатах, SEO и ответах помощника. Старые заказы с таким тарифом читаются как раньше. */
  hidden?: boolean;
}

export interface DeliveryOption {
  id: DeliveryId;
  price: number;
  /** Максимальный срок доставки, дней — для расчёта «успеть к дате». */
  maxDays: number;
}

/** Дополнения к печатному заказу. hiddenFor — тарифы, где услуга уже включена. */
export interface Addon {
  id: AddonId;
  price: number;
  hiddenFor: PlanId[];
}

/*
 * Цены и тарифы, как они заданы в коде, — «заводские». Владелец меняет их в админке («Цены и тарифы»): значения хранятся
 * в настройках (crm_settings, ключ catalog.overrides) и накладываются поверх. Читайте цены только через функции ниже
 * (getPlans, getAddons…), а не из этих констант: так изменения из админки подхватываются без перезапуска.
 */
const defaultPlans: readonly Plan[] = [
  {
    id: "digital",
    price: 9900,
    printed: false,
  },
  {
    id: "hardcover",
    price: 30000,
    extraCopyPrice: 17900,
    printed: true,
    featured: true,
  },
  {
    id: "premium",
    price: 35000,
    extraCopyPrice: 24900,
    printed: true,
    hidden: true,
  },
];

const defaultDelivery: readonly DeliveryOption[] = [
  { id: "courier", price: 2000, maxDays: 2 },
  { id: "post", price: 3500, maxDays: 7 },
  { id: "pickup", price: 0, maxDays: 0 },
];

const defaultAddons: readonly Addon[] = [
  { id: "express", price: 5000, hiddenFor: ["digital", "premium"] },
  { id: "giftwrap", price: 5000, hiddenFor: ["digital", "premium"] },
];

/** Что владелец поменял в админке: только цены и видимость тарифов, остальное (сроки, состав) — в коде и словарях. */
export interface CatalogOverrides {
  plans?: Partial<Record<PlanId, { price?: number; extraCopyPrice?: number; hidden?: boolean }>>;
  addons?: Partial<Record<AddonId, { price?: number }>>;
  delivery?: Partial<Record<DeliveryId, { price?: number }>>;
}

export const MAX_PRICE = 10_000_000;

const price = (v: unknown): number | undefined => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_PRICE ? v : undefined);

/** Приводит сырое значение (JSON из настроек, данные формы) к допустимым переопределениям: всё лишнее и неверное отбрасывается. */
export function sanitizeOverrides(raw: unknown): CatalogOverrides {
  const out: CatalogOverrides = {};
  const o = raw && typeof raw === "object" ? (raw as Record<string, Record<string, Record<string, unknown>> | undefined>) : {};
  for (const d of defaultPlans) {
    const r = o.plans?.[d.id];
    if (!r || typeof r !== "object") continue;
    const e: { price?: number; extraCopyPrice?: number; hidden?: boolean } = {};
    if (price(r.price) !== undefined) e.price = price(r.price);
    if (d.printed && price(r.extraCopyPrice) !== undefined) e.extraCopyPrice = price(r.extraCopyPrice);
    if (typeof r.hidden === "boolean") e.hidden = r.hidden;
    if (Object.keys(e).length) (out.plans ??= {})[d.id] = e;
  }
  for (const d of defaultAddons) {
    const v = price(o.addons?.[d.id]?.price);
    if (v !== undefined) (out.addons ??= {})[d.id] = { price: v };
  }
  for (const d of defaultDelivery) {
    const v = price(o.delivery?.[d.id]?.price);
    if (v !== undefined) (out.delivery ??= {})[d.id] = { price: v };
  }
  // Хотя бы один тариф должен продаваться: иначе оформить заказ нельзя.
  if (defaultPlans.every((d) => (out.plans?.[d.id]?.hidden ?? d.hidden) === true)) delete out.plans;
  return out;
}

interface Effective {
  json: string;
  overrides: CatalogOverrides;
  plans: Plan[];
  visible: Plan[];
  addons: Addon[];
  delivery: DeliveryOption[];
}

function build(overrides: CatalogOverrides): Effective {
  const plans = defaultPlans.map((d) => ({ ...d, ...overrides.plans?.[d.id] }));
  return {
    json: JSON.stringify(overrides),
    overrides,
    plans,
    visible: plans.filter((p) => !p.hidden),
    addons: defaultAddons.map((d) => ({ ...d, ...overrides.addons?.[d.id] })),
    delivery: defaultDelivery.map((d) => ({ ...d, ...overrides.delivery?.[d.id] })),
  };
}

/**
 * Действующий каталог живёт в globalThis: Next.js грузит этот модуль в разные слои бандла (страницы, server actions,
 * серверный рендер клиентских компонентов), а цены должны быть общими. В браузере его задаёт сервер через пропсы страницы.
 */
const store = globalThis as unknown as { __mybookCatalog?: Effective };
const current = () => (store.__mybookCatalog ??= build({}));

/** Применить цены из админки (null — заводские). Повторный вызов с тем же значением ничего не делает. */
export function applyCatalog(raw: CatalogOverrides | null | undefined) {
  const overrides = sanitizeOverrides(raw ?? {});
  if (current().json === JSON.stringify(overrides)) return;
  store.__mybookCatalog = build(overrides);
}

export const getCatalogOverrides = (): CatalogOverrides => current().overrides;
/** Заводские значения — для подсказок в админке. */
export const factoryCatalog = { plans: defaultPlans, addons: defaultAddons, delivery: defaultDelivery };

/**
 * Переключатели сайта из админки («Сайт»). Живут в globalThis по той же причине, что и каталог цен: общие для всех слоёв
 * бандла; в браузер их передаёт CatalogSync. Регистрация по умолчанию открыта.
 */
interface SiteFlags {
  registration: boolean;
}
const flagStore = globalThis as unknown as { __mybookFlags?: SiteFlags };
const flags = () => (flagStore.__mybookFlags ??= { registration: true });

export function applySiteFlags(next: Partial<SiteFlags>) {
  const cur = flags();
  if (next.registration !== undefined && next.registration !== cur.registration) flagStore.__mybookFlags = { ...cur, registration: next.registration };
}

/** Можно ли регистрироваться на сайте. Закрыто — страница регистрации объясняет это, ссылки на неё скрыты, новые аккаунты не создаются. */
export const registrationOpen = (): boolean => flags().registration;

/** Все тарифы, включая скрытые (старые заказы и сертификаты читаются по ним). */
export const getPlans = (): readonly Plan[] => current().plans;
/** Тарифы, которые сейчас можно купить. */
export const getVisiblePlans = (): readonly Plan[] => current().visible;
export const getAddons = (): readonly Addon[] => current().addons;
export const getDeliveryOptions = (): readonly DeliveryOption[] => current().delivery;

export function availableAddons(plan: PlanId) {
  return getAddons().filter((a) => !a.hiddenFor.includes(plan));
}

/**
 * Что по договорённости можно отдать бесплатно на этом тарифе (и оставить из списка gifts): подарочную упаковку — если
 * она есть среди допов тарифа, доставку — у печатных. У электронной книги — ничего.
 */
export function giftsForPlan(planId: string, gifts: readonly AgreementGift[] = AGREEMENT_GIFTS): AgreementGift[] {
  const plan = getPlan(planId);
  if (!plan) return [];
  return readGifts(gifts).filter((g) => (g === "delivery" ? plan.printed : availableAddons(plan.id).some((a) => a.id === g)));
}

/** Сроки производства печатной книги в рабочих днях. */
export const productionDays = { standard: "5–7", premium: "3–4" };
/** Верхняя граница сроков производства (рабочие дни) — по ней считаем «закажите до». */
export const productionWorkdays = { standard: 7, premium: 4 };

export function formatPrice(amount: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(amount)} ${site.currencySign}`;
}

export function getPlan(id: string): Plan | undefined {
  return getPlans().find((p) => p.id === id);
}
