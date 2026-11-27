/**
 * Заказ и сертификат: справочники, которые лежат в колонках БД и нужны сразу нескольким слоям —
 * домену заказов, производству, отчётам, интерфейсу и схеме. Схема (общее ядро) не знает модулей,
 * поэтому значения, которые она хранит, объявлены здесь.
 */

/** Жизненный цикл заказа. Единственный источник списка статусов. */
export const ORDER_STATUSES = ["pending_payment", "paid", "in_production", "shipped", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Параметры печатных файлов заказа на момент последней сборки (колонка orders.print_spec). */
export interface OrderPrintSpec {
  format: string;
  pageCount: number;
  spineMm: number;
  coverWidthMm: number;
  coverHeightMm: number;
  generatedAt: string;
  /** Из какой версии книги собраны (отпечаток печати); у сборок до 27.11.2026 — нет. */
  fingerprint?: string;
}

export type GiftStatus = "pending_payment" | "paid" | "cancelled";

/**
 * Объект срабатывания правила CRM на событие заказа (crm_automation_runs.subject): «Статус заказа изменился» — один раз
 * на статус (откат и повторный перевод клиенту не повторяются), «Заказ отправлен с трек-номером» — один раз на номер,
 * «Заказ оплачен» — один раз на заказ (subject — id заказа). По ним подпись в карточке заказа знает, о чём правило
 * клиенту уже писало.
 */
export const orderRuleSubject = {
  status: (orderId: string, status: string) => `order:status:${orderId}:${status}`,
  track: (orderId: string, trackingNumber: string) => `order:track:${orderId}:${trackingNumber}`,
} as const;

/** Cookie с кодом активированного сертификата — подставляется в оформление заказа. */
export const GIFT_COOKIE = "mb_gift";

/** Cookie с кодом приглашения друга — подставляется в оформление заказа. */
export const INVITE_COOKIE = "mb_invite";

/** Адрес доставки одной строкой: страна (для другой страны), индекс, город, адрес; пусто — «—» решает вызывающий. */
export function deliveryAddress(o: { country?: string | null; postalCode: string | null; city: string | null; address: string | null }): string {
  return [o.country, o.postalCode, o.city, o.address].filter(Boolean).join(", ");
}

/**
 * Ссылка на оплату счёта из чата: /pay/<token>. Токен — 32 случайных байта base64url (43 знака); всё остальное
 * отсекается регуляркой до запроса в базу (страница, «Я оплатил(а)», роуты Kaspi).
 */
export const PAY_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function isPayToken(raw: unknown): raw is string {
  return typeof raw === "string" && PAY_TOKEN.test(raw);
}

/**
 * Запрос ссылки сборщиком превью мессенджера или поисковым роботом, а не человеком (deals-12): WhatsApp, Telegram,
 * Facebook и Instagram, Slack, Discord, Skype, Viber, VK, поисковики, curl. Иначе «клиент открыл счёт» ставила бы
 * сама отправка ссылки в чат. Пустой User-Agent — тоже не человек.
 */
export function isLinkPreviewAgent(ua: string | null | undefined): boolean {
  if (!ua?.trim()) return true;
  return /whatsapp|telegrambot|facebookexternalhit|facebot|meta-externalagent|instagram.*bot|twitterbot|slackbot|discordbot|skypeuripreview|viber|vkshare|linkedinbot|googlebot|bingbot|yandex(bot|images)|applebot|bot\b|crawler|spider|curl\/|wget\/|python-requests|headlesschrome/i.test(ua);
}

/** Комментарий к платежу в Kaspi по счёту из чата («MyBooks P12»): по нему счёт находят в выписке. */
export const payComment = (label: string) => `MyBooks ${label}`;

/**
 * Какие счета отменит слияние сделок from → to (правило moveAll; карточка сделки называет их в подтверждении): closeOpen
 * (целевая закрыта или по ней заказ) — все открытые обеих; иначе открыт у обеих — открытый счёт from; иначе — никакие.
 */
export function mergeCancels<T extends { dealId: string; status: string }>(invoices: readonly T[], from: string, closeOpen: boolean): T[] {
  const open = invoices.filter((i) => i.status === "pending_payment");
  return closeOpen ? open : open.length > 1 ? open.filter((i) => i.dealId === from) : [];
}
