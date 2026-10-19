import type { OrderStatus } from "@/shared/domain/orders";
import { orderStatusLabel } from "./status";

/** Что известно о каналах клиента — для подписи под формой статуса в карточке заказа (automation-d8). */
export interface OrderNoticeFacts {
  /** У заказа настоящая почта, а не заглушка клиента из WhatsApp (@phone.invalid): письма о статусе уходят. */
  realEmail: boolean;
  /** Включённые правила на события заказа, которые пишут клиенту: событие и условие «статус» (null — любой). */
  rules: readonly { trigger: string; orderStatus: string | null }[];
  /** С клиентом есть переписка в WhatsApp: правило пишет только в неё. */
  whatsappChat: boolean;
  /** Клиент просил не писать первым (стоп-лист): правила ему не пишут. */
  noMarketing: boolean;
}

/** Статусы, о которых клиенту уходит письмо (OrderingMailer). */
const MAILED: ReadonlySet<OrderStatus> = new Set(["paid", "in_production", "shipped", "delivered", "cancelled"]);

/** О чём напишут правила WhatsApp при переводе в статус to. */
function whatsappTopics(f: OrderNoticeFacts, to: OrderStatus): string[] {
  const has = (trigger: string, status?: OrderStatus) => f.rules.some((r) => r.trigger === trigger && (!status || !r.orderStatus || r.orderStatus === status));
  const out: string[] = [];
  if (to === "paid" && has("order.paid")) out.push("об оплате");
  if (to !== "paid" && to !== "pending_payment" && to !== "cancelled" && has("order.status_changed", to)) out.push(`«${orderStatusLabel(to)}»`);
  if (to === "shipped" && has("order.tracking_added")) out.push("трек-номер, если он вписан");
  return out;
}

/** Почему сообщение в WhatsApp не уйдёт; null — уйдёт. */
const whatsappBlock = (f: OrderNoticeFacts) => (f.noMarketing ? "клиент просил не писать первым" : !f.whatsappChat ? "с клиентом нет переписки в WhatsApp, а первым CRM не пишет" : null);

/**
 * Подпись под формой статуса: что реально уйдёт клиенту при переводе из from в to — письмо (если почта настоящая)
 * и/или WhatsApp (если правило включено и есть переписка). warn — клиент ничего не узнает: менеджеру написать самому.
 */
export function orderNotice(f: OrderNoticeFacts, from: OrderStatus, to: OrderStatus): { text: string; warn: boolean } {
  if (from === to) {
    if (from !== "shipped") return { text: "Статус тот же — клиенту ничего не уйдёт.", warn: false };
    const via = [f.realEmail ? "письмом" : null, f.rules.some((r) => r.trigger === "order.tracking_added") && !whatsappBlock(f) ? "в WhatsApp" : null].filter(Boolean);
    if (via.length) return { text: `Новый трек-номер клиент получит ${via.join(" и ")}.`, warn: false };
    return { text: "Новый трек-номер клиенту не уйдёт: почты нет, а в WhatsApp правило о трек-номере выключено или переписки нет. Напишите ему сами.", warn: true };
  }
  const mailed = MAILED.has(to);
  const topics = whatsappTopics(f, to);
  const block = topics.length ? whatsappBlock(f) : null;
  const channels = [f.realEmail && mailed ? "письмо" : null, topics.length && !block ? `сообщение в WhatsApp (${topics.join(", ")})` : null].filter(Boolean);
  const noEmail = mailed && !f.realEmail ? "у клиента нет почты" : null;
  if (channels.length) return { text: [`Клиент получит ${channels.join(" и ")}.`, noEmail ? `Письма не будет — ${noEmail}.` : null, block ? `В WhatsApp не уйдёт: ${block}.` : null].filter(Boolean).join(" "), warn: false };
  if (!mailed && !topics.length) return { text: "Клиенту ничего не уйдёт.", warn: false };
  // Ничего не уйдёт, хотя клиенту стоит знать: почты нет, а WhatsApp — выключен, заблокирован или о таком статусе не пишет.
  const whatsappWhy = block ?? (to === "cancelled" ? "об отмене правила не пишут" : "правило о таком статусе выключено («Автоматизации»)");
  return { text: `Клиент ничего не получит: ${[noEmail, `в WhatsApp — ${whatsappWhy}`].filter(Boolean).join(", ")}. Напишите ему сами.`, warn: true };
}
