import { getPlan } from "@/config/site";
import { isLocale, type Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import type { ManagerReplied } from "@/modules/messaging";
import type { OrderPaid, OrderStatusChanged, PrintFilesReady, TrackingAdded } from "@/modules/ordering";
import type { EventBus } from "@/shared/application";

export type ClientPushKind = "book_ready" | "order_paid" | "order_shipped" | "manager_reply";

export interface ClientPushMessage {
  kind: ClientPushKind;
  title: string;
  body: string;
  link: string;
  tag: string;
  data: {
    kind: ClientPushKind;
    bookId?: string;
    orderId?: string;
  };
}

export interface ClientPushDeps {
  /** Общий выключатель автоуведомлений (crm_settings: notify.auto): при off клиенту push не уходит. */
  autoEnabled: () => Promise<boolean>;
  /** Язык клиента (users.locale). */
  clientLocale: (userId: string) => Promise<Locale>;
  /** Название и язык книги (для пуша о готовности книги). */
  bookInfo: (bookId: string) => Promise<{ title: string; language: string | null } | null>;
  /** Состояние заказа (для проверки статуса при добавлении трек-номера и поиска книги по сделке). */
  orderInfo: (orderId: string) => Promise<{ status: string; bookId: string; number: number; trackingNumber: string | null } | null>;
  /** Сделка чата — чтобы найти клиента и связанный заказ при ответе менеджера. */
  dealInfo: (dealId: string) => Promise<{ clientId: string | null; orderId: string | null } | null>;
  /** Поиск клиента по телефону, если чат ещё не привязан к учётной записи. */
  findClientByPhone: (phone: string) => Promise<string | null>;
  /** Последняя книга клиента — цель навигации для ответа менеджера без привязанного заказа. */
  latestBookId: (userId: string) => Promise<string | null>;
  /** Доставка push на клиентские устройства (pushToClient). */
  send: (userId: string, payload: ClientPushMessage) => Promise<void>;
}

const HELP_CHAT_PREFIX = "help-";

/**
 * Push-уведомления клиенту в «MyBooks» на 4 события: книга готова, заказ оплачен, заказ отправлен
 * (включая добавление трек-номера после отправки) и ответ живого менеджера клиенту.
 * При notify.auto=off все автоматические клиентские push заблокированы.
 */
export function createClientPush(deps: ClientPushDeps) {
  const resolveLocale = async (userId: string, preferred?: string | null): Promise<Locale> => {
    if (preferred && isLocale(preferred)) return preferred;
    const raw = await deps.clientLocale(userId);
    return isLocale(raw) ? raw : "ru";
  };

  return {
    async onPrintFilesReady(e: PrintFilesReady) {
      if (!(await deps.autoEnabled())) return;
      const p = e.payload;
      const book = await deps.bookInfo(p.bookId);
      const locale = await resolveLocale(p.userId, book?.language);
      const t = messagesFor(locale).mail.push.bookReady;
      const title = book?.title.trim() ?? "";
      await deps.send(p.userId, {
        kind: "book_ready",
        title: t.title,
        body: title ? t.bodyWithTitle(title) : t.body(p.number),
        link: `/books/${p.bookId}`,
        tag: `book:${p.bookId}:ready`,
        data: { kind: "book_ready", bookId: p.bookId, orderId: p.orderId },
      });
    },

    async onOrderPaid(e: OrderPaid) {
      if (!(await deps.autoEnabled())) return;
      const p = e.payload;
      const locale = await resolveLocale(p.userId);
      const t = messagesFor(locale).mail.push.orderPaid;
      const printed = getPlan(p.plan)?.printed !== false;
      await deps.send(p.userId, {
        kind: "order_paid",
        title: t.title,
        body: printed ? t.bodyPrinted(p.number) : t.bodyDigital(p.number),
        link: `/orders/${p.orderId}`,
        tag: `order:${p.orderId}:paid`,
        data: { kind: "order_paid", orderId: p.orderId, bookId: p.bookId },
      });
    },

    async onOrderStatusChanged(e: OrderStatusChanged) {
      const p = e.payload;
      if (p.to !== "shipped") return;
      if (!(await deps.autoEnabled())) return;
      const locale = await resolveLocale(p.userId);
      const t = messagesFor(locale).mail.push.orderShipped;
      const track = p.trackingNumber?.trim() || "";
      await deps.send(p.userId, {
        kind: "order_shipped",
        title: t.title,
        body: track ? t.bodyTracking(p.number, track) : t.body(p.number),
        link: `/orders/${p.orderId}`,
        tag: `order:${p.orderId}:shipped`,
        data: { kind: "order_shipped", orderId: p.orderId, bookId: p.bookId },
      });
    },

    async onTrackingAdded(e: TrackingAdded) {
      const p = e.payload;
      if (!p.afterShipping) return;
      if (!(await deps.autoEnabled())) return;
      const order = await deps.orderInfo(p.orderId);
      if (!order || order.status !== "shipped") return;
      const locale = await resolveLocale(p.userId);
      const t = messagesFor(locale).mail.push.orderShipped;
      const track = p.trackingNumber.trim();
      await deps.send(p.userId, {
        kind: "order_shipped",
        title: t.title,
        body: track ? t.bodyTracking(p.number, track) : t.body(p.number),
        link: `/orders/${p.orderId}`,
        tag: `order:${p.orderId}:shipped`,
        data: { kind: "order_shipped", orderId: p.orderId, bookId: p.bookId },
      });
    },

    async onManagerReplied(e: ManagerReplied) {
      if (!(await deps.autoEnabled())) return;
      const p = e.payload;
      let userId = p.clientId;
      let orderId: string | null = null;
      const isHelp = p.channel === "site" && p.chatId.startsWith(HELP_CHAT_PREFIX);
      if (!userId && isHelp) userId = p.chatId.slice(HELP_CHAT_PREFIX.length) || null;
      if (p.dealId) {
        const deal = await deps.dealInfo(p.dealId);
        if (!userId && deal?.clientId) userId = deal.clientId;
        if (deal?.orderId) orderId = deal.orderId;
      }
      if (!userId && p.phone) userId = await deps.findClientByPhone(p.phone);
      if (!userId) return;

      let bookId: string | null = null;
      if (orderId) bookId = (await deps.orderInfo(orderId))?.bookId ?? null;
      if (!bookId) bookId = await deps.latestBookId(userId);

      const locale = await resolveLocale(userId);
      const t = messagesFor(locale).mail.push.managerReply;
      const snippet = p.text.trim().replace(/\s+/g, " ").slice(0, 140);
      const link = isHelp && bookId ? `/books/${bookId}?help=1` : orderId ? `/orders/${orderId}` : bookId ? `/books/${bookId}` : "/books";

      await deps.send(userId, {
        kind: "manager_reply",
        title: t.title,
        body: snippet || t.bodyFallback,
        link,
        tag: `chat:${p.conversationId}`,
        data: { kind: "manager_reply", ...(bookId ? { bookId } : {}), ...(orderId ? { orderId } : {}) },
      });
    },
  };
}

/** Регистрация всех подписчиков клиентских push на шине событий. */
export function registerClientPushSubscriptions(bus: EventBus, deps: ClientPushDeps) {
  const push = createClientPush(deps);
  bus.subscribe<PrintFilesReady>("ordering.print_files_ready", (e) => push.onPrintFilesReady(e), "client.push.book_ready");
  bus.subscribe<OrderPaid>("ordering.order_paid", (e) => push.onOrderPaid(e), "client.push.order_paid");
  bus.subscribe<OrderStatusChanged>("ordering.order_status_changed", (e) => push.onOrderStatusChanged(e), "client.push.order_shipped");
  bus.subscribe<TrackingAdded>("ordering.tracking_added", (e) => push.onTrackingAdded(e), "client.push.order_tracking");
  bus.subscribe<ManagerReplied>("messaging.manager_replied", (e) => push.onManagerReplied(e), "client.push.manager_reply");
  return push;
}
