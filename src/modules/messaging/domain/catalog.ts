/**
 * Каталог товаров WhatsApp Business номера магазина (docs/whatsapp-catalog.md): товары живут в WhatsApp (источник
 * правды), CRM держит их копию для списка и выбора в чате. Здесь — правила без сети и БД: цены, разбор ответов шлюза
 * и карточки товаров/корзин в переписке.
 */

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : 0);
const record = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Валюта каталога по умолчанию — тенге. */
export const CATALOG_CURRENCY = "KZT";
/** Каталог хранит цену в тысячных долях (как priceAmount1000 карточки товара): 25 000 ₸ → 25000000. */
export const WA_PRICE_FACTOR = 1000;
/** Ограничения WhatsApp на поля товара (приложение WhatsApp Business не даёт больше). */
export const CATALOG_LIMITS = { name: 150, description: 5000, retailerId: 100, url: 2000, images: 10, imageBytes: 8 * 1024 * 1024 } as const;

/** Товар каталога WhatsApp. Цена — в целых единицах валюты (тенге), null — без цены. */
export interface CatalogProduct {
  id: string;
  name: string;
  description: string;
  price: number | null;
  currency: string;
  retailerId: string;
  url: string;
  hidden: boolean;
  /** Фото в WhatsApp (адреса mmg.whatsapp.net); первое — обложка. */
  imageUrls: string[];
  /** Видео товара в WhatsApp (добавляются в приложении WhatsApp Business; из CRM — сохраняются при правке). */
  videoUrls: string[];
  /** Проверка товара WhatsApp: APPROVED, PENDING, REJECTED… Пусто — шлюз не сказал. */
  review: string;
}

/**
 * Товар из GraphQL каталога WhatsApp (graph.whatsapp.com — чтение, graph.facebook.com — ответы правок). Цена приходит
 * строкой в тысячных долях («25000000»), is_hidden — флагом или «ISHIDDEN_TRUE», фото — media.images.
 */
export function parseGraphProduct(raw: unknown): CatalogProduct | null {
  const p = record(raw);
  const id = str(p.id).trim();
  if (!/^\d{1,40}$/.test(id)) return null;
  const images = Array.isArray(record(p.media).images) ? (record(p.media).images as unknown[]).map(record) : [];
  const imageUrls = images.map((i) => str(i.original_image_url) || str(i.request_image_url)).filter(Boolean);
  const videos = Array.isArray(record(p.media).videos) ? (record(p.media).videos as unknown[]).map(record) : [];
  const videoUrls = videos.map((v) => str(v.original_video_url)).filter(Boolean);
  const rawPrice = num(p.price);
  const hidden = p.is_hidden === true || /TRUE$/i.test(str(p.is_hidden));
  return {
    id,
    name: str(p.name),
    description: str(p.description),
    price: rawPrice > 0 ? rawPrice / WA_PRICE_FACTOR : null,
    currency: str(p.currency) || CATALOG_CURRENCY,
    retailerId: str(p.retailer_id),
    url: str(p.url),
    hidden,
    imageUrls,
    videoUrls,
    review: str(record(p.status_info).status).toUpperCase(),
  };
}

/**
 * product_info для мутаций добавления и правки товара (как productModelToGraphQLInput в WhatsApp Web): фото — адреса
 * загруженных в WhatsApp картинок, цена — в тысячных долях строкой; пустые описание, ссылка и артикул не передаются.
 */
export function productInfo(d: ProductDraft, imageUrls: string[], videoUrls: string[] = []): Record<string, unknown> {
  const media: Record<string, unknown> = { image: imageUrls.map((url) => ({ url })) };
  if (videoUrls.length) media.video = videoUrls.map((url) => ({ url }));
  const info: Record<string, unknown> = { name: d.name.trim(), media, is_hidden: d.hidden };
  if (d.description.trim()) info.description = d.description.trim();
  if (d.url.trim()) info.url = d.url.trim();
  if (d.retailerId.trim()) info.retailer_id = d.retailerId.trim();
  if (d.price != null && d.price > 0) {
    info.currency = d.currency;
    info.price = String(toWaPrice(d.price));
  }
  return info;
}

/** Ошибка GraphQL-ответа понятным текстом; null — ошибок нет. */
export function graphError(body: unknown): string | null {
  const b = record(body);
  const one = record(b.error);
  if (Object.keys(one).length) return str(one.error_user_msg) || str(one.message) || `код ${str(one.code)}`;
  const many = Array.isArray(b.errors) ? b.errors.map(record) : [];
  if (many.length) return many.map((e) => str(e.description) || str(e.summary) || str(e.message) || `код ${str(e.code)}`).join("; ");
  return null;
}

/** Ответ GraphQL: data.<поле>. */
export function graphData(body: unknown, field: string): Record<string, unknown> {
  return record(record(record(body).data)[field]);
}

/** Цена для WhatsApp из тенге: целое число тысячных долей. */
export const toWaPrice = (price: number) => Math.round(price * WA_PRICE_FACTOR);

/** Статус проверки товара WhatsApp — по-русски для списка. */
export function reviewLabel(review: string): { label: string; tone: "ok" | "wait" | "bad" | "none" } {
  switch (review) {
    case "APPROVED":
      return { label: "Одобрен", tone: "ok" };
    case "PENDING":
    case "IN_REVIEW":
      return { label: "На проверке", tone: "wait" };
    case "OUTDATED":
      return { label: "На повторной проверке", tone: "wait" };
    case "REJECTED":
      return { label: "Отклонён WhatsApp", tone: "bad" };
    case "":
      return { label: "", tone: "none" };
    default:
      return { label: review.toLowerCase(), tone: "none" };
  }
}

const CURRENCY_SIGN: Record<string, string> = { KZT: "₸", RUB: "₽", USD: "$", EUR: "€" };

/** «25 000 ₸»; без цены — пусто. */
export function formatPrice(price: number | null, currency = CATALOG_CURRENCY): string {
  if (price == null || !Number.isFinite(price) || price <= 0) return "";
  const amount = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(price).replace(/ /g, " ");
  return `${amount} ${CURRENCY_SIGN[currency] ?? currency}`;
}

/** Ввод товара сотрудником (страница каталога). */
export interface ProductDraft {
  name: string;
  description: string;
  price: number | null;
  currency: string;
  retailerId: string;
  url: string;
  hidden: boolean;
}

/** Проверка товара перед отправкой в WhatsApp; текст ошибки — для сотрудника. */
export function validateDraft(d: ProductDraft): string | null {
  if (!d.name.trim()) return "Укажите название товара";
  if (d.name.trim().length > CATALOG_LIMITS.name) return `Название — не длиннее ${CATALOG_LIMITS.name} символов`;
  if (d.description.length > CATALOG_LIMITS.description) return `Описание — не длиннее ${CATALOG_LIMITS.description} символов`;
  if (d.price != null && (!Number.isFinite(d.price) || d.price < 0 || d.price > 1e9)) return "Цена — число от 0";
  if (!/^[A-Z]{3}$/.test(d.currency)) return "Валюта — три буквы, например KZT";
  if (d.retailerId.length > CATALOG_LIMITS.retailerId) return `Артикул — не длиннее ${CATALOG_LIMITS.retailerId} символов`;
  if (d.url && !/^https?:\/\/\S+$/i.test(d.url)) return "Ссылка должна начинаться с http:// или https://";
  return null;
}

/**
 * Карточка в переписке (crm_messages.card): товар, который отправил менеджер или прислал клиент, корзина клиента
 * или ссылка на весь каталог. Фото — в mediaUrl сообщения.
 */
export type MessageCard =
  | { kind: "product"; productId: string; name: string; description?: string; price: number | null; currency: string; retailerId?: string; url?: string; body?: string }
  | { kind: "order"; orderId: string; token?: string; title: string; itemCount: number; total: number | null; currency: string; note?: string; items?: { name: string; quantity: number; price: number | null }[] }
  | { kind: "catalog"; url: string };

/** Карточка из сохранённого значения (jsonb): неизвестное и битое — null. */
export function parseCard(raw: unknown): MessageCard | null {
  const c = record(raw);
  if (c.kind === "product" && str(c.productId)) {
    const price = c.price == null ? null : num(c.price);
    return { kind: "product", productId: str(c.productId), name: str(c.name), description: str(c.description) || undefined, price: price && price > 0 ? price : null, currency: str(c.currency) || CATALOG_CURRENCY, retailerId: str(c.retailerId) || undefined, url: str(c.url) || undefined, body: str(c.body) || undefined };
  }
  if (c.kind === "order" && str(c.orderId)) {
    const items = Array.isArray(c.items)
      ? c.items.map(record).map((i) => ({ name: str(i.name), quantity: Math.max(1, Math.round(num(i.quantity))), price: num(i.price) > 0 ? num(i.price) : null }))
      : undefined;
    const total = c.total == null ? null : num(c.total);
    return { kind: "order", orderId: str(c.orderId), token: str(c.token) || undefined, title: str(c.title), itemCount: Math.max(0, Math.round(num(c.itemCount))), total: total && total > 0 ? total : null, currency: str(c.currency) || CATALOG_CURRENCY, note: str(c.note) || undefined, items };
  }
  if (c.kind === "catalog" && /^https:\/\/wa\.me\/c\/\d+$/.test(str(c.url))) return { kind: "catalog", url: str(c.url) };
  return null;
}

/** Строка карточки для списка чатов и текста сообщения в CRM. */
export function cardLine(card: MessageCard): string {
  if (card.kind === "product") return ["🛍️", card.name || "Товар", formatPrice(card.price, card.currency) ? `— ${formatPrice(card.price, card.currency)}` : ""].filter(Boolean).join(" ");
  if (card.kind === "order") {
    const items = card.itemCount ? `${card.itemCount} ${plural(card.itemCount, "товар", "товара", "товаров")}` : "корзина";
    const total = formatPrice(card.total, card.currency);
    return `🛒 Заказ из каталога: ${items}${total ? `, ${total}` : ""}`;
  }
  return "🗂️ Каталог товаров";
}

function plural(n: number, one: string, few: string, many: string) {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}

/**
 * Карточка входящего сообщения GOWA: клиент прислал товар (переслал карточку) или корзину из каталога. В вебхуке шлюз
 * отдаёт product (BusinessProduct) и order (OrderMessage как есть).
 */
export function cardFromGowaPayload(payload: Record<string, unknown>): MessageCard | null {
  if ("product" in payload) {
    const p = record(payload.product);
    const id = str(p.product_id);
    if (!id) return null;
    const price = num(p.sale_price_amount_1000) || num(p.price_amount_1000);
    return { kind: "product", productId: id, name: str(p.title), description: str(p.description) || undefined, price: price > 0 ? price / 1000 : null, currency: str(p.currency_code) || CATALOG_CURRENCY, retailerId: str(p.retailer_id) || undefined, url: str(p.url) || undefined, body: str(p.body) || undefined };
  }
  if ("order" in payload) {
    const o = record(payload.order);
    const id = str(o.orderID ?? o.order_id);
    if (!id) return null;
    const total = num(o.totalAmount1000 ?? o.total_amount_1000);
    return { kind: "order", orderId: id, token: str(o.token) || undefined, title: str(o.orderTitle ?? o.order_title), itemCount: Math.max(0, Math.round(num(o.itemCount ?? o.item_count))), total: total > 0 ? total / 1000 : null, currency: str(o.totalCurrencyCode ?? o.total_currency_code) || CATALOG_CURRENCY, note: str(o.message) || undefined };
  }
  return null;
}

/** Состав корзины из ответа шлюза (GET /catalog/order — whatsmeow GetOrderDetails, цены в тысячных). */
export function orderItemsFromGateway(raw: unknown): { items: { name: string; quantity: number; price: number | null }[]; total: number | null; currency: string } {
  const r = record(raw);
  const items = (Array.isArray(r.products) ? r.products : []).map(record).map((p) => ({ name: str(p.name), quantity: Math.max(1, Math.round(num(p.quantity))), price: num(p.price) > 0 ? num(p.price) / 1000 : null }));
  const price = record(r.price);
  const total = num(price.total);
  return { items, total: total > 0 ? total / 1000 : null, currency: str(price.currency) || CATALOG_CURRENCY };
}

/** Настройки каталога в чатах («Интеграции» → «Мессенджеры» → «Каталог WhatsApp»). */
export interface CatalogSettings {
  /** Кнопка «Товар из каталога» в чате. */
  enabled: boolean;
  /** Текст над ссылкой на весь каталог. */
  linkText: string;
  /** Заголовок и описание превью ссылки на каталог (обложка — фото первого товара). */
  linkTitle: string;
  linkDescription: string;
  /** Подпись под карточкой товара (можно {name}, {price}); пусто — без подписи. */
  productText: string;
  /** Валюта новых товаров. */
  currency: string;
  /** Показывать скрытые товары в выборе в чате (по умолчанию — нет: клиент их не откроет). */
  sendHidden: boolean;
}

export const DEFAULT_CATALOG_SETTINGS: CatalogSettings = {
  enabled: true,
  linkText: "Посмотрите наш каталог в WhatsApp:",
  linkTitle: "Каталог MyBooks",
  linkDescription: "Книги-истории о близких — выберите формат",
  productText: "",
  currency: CATALOG_CURRENCY,
  sendHidden: false,
};

export function parseCatalogSettings(raw: string | null | undefined): CatalogSettings {
  let v: Record<string, unknown> = {};
  try {
    v = record(raw ? JSON.parse(raw) : {});
  } catch {
    v = {};
  }
  const d = DEFAULT_CATALOG_SETTINGS;
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : d.enabled,
    linkText: typeof v.linkText === "string" ? v.linkText.slice(0, 1000) : d.linkText,
    linkTitle: typeof v.linkTitle === "string" ? v.linkTitle.slice(0, 100) : d.linkTitle,
    linkDescription: typeof v.linkDescription === "string" ? v.linkDescription.slice(0, 200) : d.linkDescription,
    productText: typeof v.productText === "string" ? v.productText.slice(0, 1000) : d.productText,
    currency: typeof v.currency === "string" && /^[A-Z]{3}$/.test(v.currency) ? v.currency : d.currency,
    sendHidden: typeof v.sendHidden === "boolean" ? v.sendHidden : d.sendHidden,
  };
}

/** Подпись под карточкой: {name} и {price} из товара. */
export function productCaption(template: string, p: Pick<CatalogProduct, "name" | "price" | "currency">): string {
  return template.replace(/\{name\}/g, p.name).replace(/\{price\}/g, formatPrice(p.price, p.currency)).trim();
}

/** Ссылка на каталог номера: wa.me/c/<номер>. */
export const catalogLink = (phone: string) => `https://wa.me/c/${phone.replace(/\D/g, "")}`;

/** Коллекция каталога WhatsApp (группа товаров, клиент видит её разделом каталога). */
export interface CatalogCollection {
  id: string;
  name: string;
  /** Проверка WhatsApp: APPROVED, PENDING, REJECTED (приставку STATUS_ ответов мутаций убираем). */
  review: string;
  productIds: string[];
}

/** Коллекция из GraphQL (xfb_whatsapp_catalog_collections / xwa_product_catalog_get_collections). */
export function parseGraphCollection(raw: unknown): CatalogCollection | null {
  const c = record(raw);
  const id = str(c.id).trim();
  if (!/^\d{1,40}$/.test(id)) return null;
  const products = Array.isArray(c.products) ? c.products.map(record) : [];
  return {
    id,
    name: str(c.name),
    review: str(record(c.status_info).status).toUpperCase().replace(/^STATUS_/, ""),
    productIds: products.map((p) => str(p.id)).filter((x) => /^\d{1,40}$/.test(x)),
  };
}

/** Что изменить в коллекции, чтобы в ней были именно wanted: какие товары добавить и какие убрать. */
export function collectionDiff(current: string[], wanted: string[]): { add: string[]; remove: string[] } {
  const now = new Set(current);
  const next = new Set(wanted);
  return { add: wanted.filter((id) => !now.has(id)), remove: current.filter((id) => !next.has(id)) };
}

/** Документы GraphQL каталога (doc_id сборки WhatsApp Web); в настройках каждый можно заменить, когда WhatsApp их сменит. */
export const CATALOG_DOC_KEYS = ["read", "owner", "add", "edit", "remove", "collections", "collectionsPublic", "createCollection", "updateCollection", "deleteCollections"] as const;
export type CatalogDocKey = (typeof CATALOG_DOC_KEYS)[number];

/** Замены doc_id из настройки whatsapp.catalogDocs: только известные ключи и числа. */
export function parseCatalogDocs(raw: string | null | undefined): Partial<Record<CatalogDocKey, string>> {
  let v: Record<string, unknown> = {};
  try {
    v = record(raw ? JSON.parse(raw) : {});
  } catch {
    return {};
  }
  const out: Partial<Record<CatalogDocKey, string>> = {};
  for (const k of CATALOG_DOC_KEYS) {
    const val = str(v[k]).trim();
    if (/^\d{6,30}$/.test(val)) out[k] = val;
  }
  return out;
}

/**
 * Похоже ли на устаревший doc_id: WhatsApp сменил сохранённый запрос, и сервер его больше не знает. Тогда сотруднику —
 * подсказка обновить doc_id в настройках, а не «повторите позже».
 */
export function looksLikeStaleDoc(message: string): boolean {
  return /persisted|doc_id|document|query not found|unknown query|1675012|noncoercible/i.test(message);
}
