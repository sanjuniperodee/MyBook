/**
 * Коммерческие настройки проекта: бренд, контакты, цены, доставка.
 * Всё, что обычно меняет владелец бизнеса, собрано здесь.
 */

import { AGREEMENT_GIFTS, readGifts, type AgreementGift } from "@/shared/domain/agreementGifts";
import { formatPhone, normalizePhone } from "@/shared/domain/phone";

export const site = {
  name: "MyBooks",
  currency: "KZT",
  currencySign: "₸",
  contacts: {
    email: "hello@mybook.kz",
    /** Телефон и WhatsApp магазина — из «Реквизитов продавца» в админке (applySeller), пока не заданы — заводские ниже. */
    get phone() {
      return formatPhone(seller().phone);
    },
    get whatsapp() {
      return `https://wa.me/${seller().whatsapp}`;
    },
    telegram: "https://t.me/mybook_support",
    instagram: "https://instagram.com/mybook",
  },
  /** Реквизиты для оферты, футера и упаковочного листа — из «Реквизитов продавца» в админке. Адрес на двух языках — в словарях. */
  company: {
    get legalName() {
      return seller().legalName;
    },
    get bin() {
      return seller().bin;
    },
  },
  /** Отзывы на лендинге. Секция скрыта, пока список пуст — добавляйте только реальные отзывы клиентов. */
  testimonials: [] as { name: string; text: string; occasion?: string }[],
};

/*
 * Тексты тарифов, доставки, допов и реквизиты перевода живут в словарях (src/i18n/messages/<язык>/common.ts):
 * здесь только цифры, чтобы цена не могла разойтись между языками.
 */

export type PlanId = "digital" | "hardcover" | "premium";
export type DeliveryId = "pickup" | "courier" | "post" | "abroad";
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
  /**
   * Стоимость рассчитывается индивидуально (курьер, по Казахстану, другая страна): зависит от города и перевозчика
   * (СДЭК, Казпочта, InDriver), в сумму заказа не входит, цены в админке нет — её называет менеджер.
   */
  quoted?: boolean;
}

/** Дополнения к печатному заказу. hiddenFor — тарифы, где услуга уже включена. */
export interface Addon {
  id: AddonId;
  price: number;
  hiddenFor: PlanId[];
  /** Снят с продажи в админке: клиенты его не видят и выбрать не могут. */
  hidden?: boolean;
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

// Доставка — не константа (InDriver может выйти дороже): пока расценки не проверены, её стоимость считает менеджер.
const defaultDelivery: readonly DeliveryOption[] = [
  { id: "courier", price: 0, maxDays: 2, quoted: true },
  { id: "post", price: 0, maxDays: 7, quoted: true },
  { id: "pickup", price: 0, maxDays: 0 },
  { id: "abroad", price: 0, maxDays: 21, quoted: true },
];

const defaultAddons: readonly Addon[] = [
  { id: "express", price: 5000, hiddenFor: ["digital", "premium"] },
  { id: "giftwrap", price: 5000, hiddenFor: ["digital", "premium"] },
];

/**
 * Пакеты запросов к ИИ-дизайнеру сверх 5 бесплатных на клиента. Купленные запросы не сгорают. Сетка: чем больше пакет, тем
 * дешевле запрос (99 → 83 → 60 ₸); цену, число запросов и продажу пакета владелец меняет в «Ценах и тарифах».
 */
export type AiPackId = "small" | "medium" | "large";
export interface AiPack {
  id: AiPackId;
  requests: number;
  price: number;
  /** Выделить в предложении («выгоднее всего»). */
  featured?: boolean;
  hidden?: boolean;
}
const defaultAiPacks: readonly AiPack[] = [
  { id: "small", requests: 10, price: 990 },
  { id: "medium", requests: 30, price: 2490, featured: true },
  { id: "large", requests: 100, price: 5990 },
];
export const MAX_AI_PACK_REQUESTS = 1000;

/** Доставка в другую страну: нужны страна и индекс, стоимость всегда считает менеджер. */
export const isAbroadDelivery = (id: string | null | undefined): boolean => id === "abroad";

/** Что владелец поменял в админке: только цены и видимость тарифов, остальное (сроки, состав) — в коде и словарях. */
export interface CatalogOverrides {
  plans?: Partial<Record<PlanId, { price?: number; extraCopyPrice?: number; hidden?: boolean }>>;
  addons?: Partial<Record<AddonId, { price?: number; hidden?: boolean }>>;
  /**
   * Цена доставки. У способов «по расчёту» (курьер, по Казахстану) цена действует только с fixed: true — её владелец
   * вписал сам в «Ценах и тарифах»; старые сохранённые цены без отметки не возвращают фиксированную доставку.
   */
  delivery?: Partial<Record<DeliveryId, { price?: number; fixed?: boolean }>>;
  aiPacks?: Partial<Record<AiPackId, { price?: number; requests?: number; hidden?: boolean }>>;
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
    const r = o.addons?.[d.id];
    const e: { price?: number; hidden?: boolean } = {};
    if (price(r?.price) !== undefined) e.price = price(r?.price);
    if (typeof r?.hidden === "boolean") e.hidden = r.hidden;
    if (Object.keys(e).length) (out.addons ??= {})[d.id] = e;
  }
  for (const d of defaultDelivery) {
    // В другую страну — всегда по расчёту менеджера.
    if (isAbroadDelivery(d.id)) continue;
    const v = price(o.delivery?.[d.id]?.price);
    const fixed = o.delivery?.[d.id]?.fixed === true;
    if (v === undefined || (d.quoted && !fixed)) continue;
    (out.delivery ??= {})[d.id] = d.quoted ? { price: v, fixed: true } : { price: v };
  }
  for (const d of defaultAiPacks) {
    const r = o.aiPacks?.[d.id];
    if (!r || typeof r !== "object") continue;
    const e: { price?: number; requests?: number; hidden?: boolean } = {};
    if (price(r.price) !== undefined) e.price = price(r.price);
    if (typeof r.requests === "number" && Number.isInteger(r.requests) && r.requests >= 1 && r.requests <= MAX_AI_PACK_REQUESTS) e.requests = r.requests;
    if (typeof r.hidden === "boolean") e.hidden = r.hidden;
    if (Object.keys(e).length) (out.aiPacks ??= {})[d.id] = e;
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
  aiPacks: AiPack[];
}

function build(overrides: CatalogOverrides): Effective {
  const plans = defaultPlans.map((d) => ({ ...d, ...overrides.plans?.[d.id] }));
  return {
    json: JSON.stringify(overrides),
    overrides,
    plans,
    visible: plans.filter((p) => !p.hidden),
    addons: defaultAddons.map((d) => ({ ...d, ...overrides.addons?.[d.id] })),
    // Владелец вписал цену доставки «по расчёту» — она становится фиксированной.
    delivery: defaultDelivery.map((d) => {
      const o = overrides.delivery?.[d.id];
      return o ? { id: d.id, maxDays: d.maxDays, price: o.price ?? d.price, ...(d.quoted && !o.fixed ? { quoted: true } : {}) } : { ...d };
    }),
    aiPacks: defaultAiPacks.map((d) => ({ ...d, ...overrides.aiPacks?.[d.id] })),
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
export const factoryCatalog = { plans: defaultPlans, addons: defaultAddons, delivery: defaultDelivery, aiPacks: defaultAiPacks };

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

/**
 * Реквизиты продавца: юр. название, БИН, телефон и номер WhatsApp (цифры). Владелец вводит их в админке («Сайт»), значения
 * хранятся в настройках CRM; пока значение не задано, действует заводское — заглушка ниже (сервер пишет предупреждение в лог).
 * Живут в globalThis, как цены: общие для слоёв бандла; в браузер их передаёт CatalogSync.
 */
export interface SellerDetails {
  legalName: string;
  bin: string;
  phone: string;
  whatsapp: string;
}
export const SELLER_FIELDS = ["legalName", "bin", "phone", "whatsapp"] as const satisfies readonly (keyof SellerDetails)[];
export const factorySeller: Readonly<SellerDetails> = { legalName: "ИП «MyBooks»", bin: "000000000000", phone: "77000000000", whatsapp: "77000000000" };
export const SELLER_NAME_MAX = 120;

/** Номер-заглушка вида 7 700 000 00 00: семь нулей в конце. */
const placeholderPhone = (digits: string) => /0{7}$/.test(digits);
const phoneOk = (digits: string) => digits.length >= 10 && digits.length <= 15 && !placeholderPhone(digits);

/** Отбрасывает пустое и неверное (нулевой БИН, номер-заглушку): такое значение считается незаданным. */
export function sanitizeSeller(raw: Partial<Record<keyof SellerDetails, string | null | undefined>>): Partial<SellerDetails> {
  const out: Partial<SellerDetails> = {};
  const name = String(raw.legalName ?? "").replace(/\s+/g, " ").trim();
  if (name && name.length <= SELLER_NAME_MAX) out.legalName = name;
  const bin = String(raw.bin ?? "").replace(/\D/g, "");
  if (/^\d{12}$/.test(bin) && !/^0+$/.test(bin)) out.bin = bin;
  const phone = normalizePhone(raw.phone);
  if (phoneOk(phone)) out.phone = phone;
  const whatsapp = normalizePhone(raw.whatsapp);
  if (phoneOk(whatsapp)) out.whatsapp = whatsapp;
  return out;
}

/** Какие реквизиты не заданы (на сайте — заглушка). */
export const missingSeller = (overrides: Partial<SellerDetails>): (keyof SellerDetails)[] => SELLER_FIELDS.filter((k) => !overrides[k]);

const sellerStore = globalThis as unknown as { __mybookSeller?: { json: string; overrides: Partial<SellerDetails>; value: SellerDetails } };
function seller(): SellerDetails {
  return (sellerStore.__mybookSeller ??= { json: "{}", overrides: {}, value: { ...factorySeller } }).value;
}

/** Применить реквизиты из настроек (неверные и пустые — заводские). Повторный вызов с тем же значением ничего не делает. */
export function applySeller(raw: Partial<Record<keyof SellerDetails, string | null | undefined>> | null | undefined) {
  const overrides = sanitizeSeller(raw ?? {});
  const json = JSON.stringify(overrides);
  if (sellerStore.__mybookSeller?.json === json) return;
  sellerStore.__mybookSeller = { json, overrides, value: { ...factorySeller, ...overrides } };
}

/** Заданные в админке реквизиты (без заводских) — для CatalogSync и формы. */
export const getSellerOverrides = (): Partial<SellerDetails> => {
  seller();
  return sellerStore.__mybookSeller!.overrides;
};

/** Все тарифы, включая скрытые (старые заказы и сертификаты читаются по ним). */
export const getPlans = (): readonly Plan[] => current().plans;
/** Тарифы, которые сейчас можно купить. */
export const getVisiblePlans = (): readonly Plan[] => current().visible;
export const getAddons = (): readonly Addon[] => current().addons;
/** Все пакеты ИИ-запросов, включая снятые с продажи (оплаченные покупки читаются по ним). */
export const getAiPacks = (): readonly AiPack[] => current().aiPacks;
export const getAiPack = (id: string): AiPack | undefined => current().aiPacks.find((p) => p.id === id);
export const getDeliveryOptions = (): readonly DeliveryOption[] => current().delivery;
/**
 * Стоимость доставки рассчитывается индивидуально: в заказе 0 ₸, клиенту — «рассчитывается индивидуально». Доставку по
 * Казахстану менеджер мог отдать бесплатно по договорённости (gifts) — тогда она бесплатная, а не «по расчёту».
 */
export const isQuotedDelivery = (id: string | null | undefined, gifts: readonly string[] = []): boolean =>
  !!id && current().delivery.some((d) => d.id === id && d.quoted) && !(!isAbroadDelivery(id) && gifts.includes("delivery"));

export function availableAddons(plan: PlanId) {
  return getAddons().filter((a) => !a.hiddenFor.includes(plan));
}

/** Допы, которые клиент может выбрать при оформлении: доступные на тарифе и не снятые с продажи. */
export function soldAddons(plan: PlanId) {
  return availableAddons(plan).filter((a) => !a.hidden);
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
