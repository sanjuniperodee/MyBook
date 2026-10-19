import type { OrderStatus } from "@/shared/domain/orders";
import { orderStatusLabel } from "./status";

/** Включённое правило на событие заказа, которое пишет клиенту. */
export interface OrderNoticeRule {
  trigger: string;
  /** Условие «статус» (null — любой). */
  orderStatus: string | null;
  /** Условие «только в рабочее время» (work) или «только вне рабочего» (off); null — всегда. */
  hours?: string | null;
  /**
   * О чём правило этому заказу уже писало — повторно не напишет (однократность по журналу срабатываний): статусы
   * («Статус заказа изменился»), трек-номера («Заказ отправлен с трек-номером»), «paid» («Заказ оплачен»).
   */
  done?: readonly string[];
}

/** Что известно о каналах клиента — для подписи под формой статуса в карточке заказа (automation-d8). */
export interface OrderNoticeFacts {
  /** У заказа настоящая почта, а не заглушка клиента из WhatsApp (@phone.invalid): письма о статусе уходят. */
  realEmail: boolean;
  rules: readonly OrderNoticeRule[];
  /** С клиентом есть переписка в WhatsApp: правило пишет только в неё. */
  whatsappChat: boolean;
  /** Клиент просил не писать первым (стоп-лист): правила ему не пишут. */
  noMarketing: boolean;
  /** Сейчас рабочее время отдела продаж — для условия правила «только в рабочее / вне рабочего». */
  workTime: boolean;
  /**
   * Почему правила сейчас не пишут клиентам первым — окно или суточный лимит («вне окна 09:00–21:00 (Алматы)»); null —
   * пишут. Правило при этом срабатывает, сообщение пропускается и повторно не уходит.
   */
  pause: string | null;
}

/** Что сотрудник сохраняет формой: из какого статуса в какой и трек-номер в поле формы (пусто — трек сотрётся). */
export interface OrderChange {
  from: OrderStatus;
  to: OrderStatus;
  track?: string | null;
  /** Трек-номер, который сейчас сохранён у заказа. */
  savedTrack?: string | null;
}

/** Статусы, о которых клиенту уходит письмо (OrderingMailer). */
const MAILED: ReadonlySet<OrderStatus> = new Set(["paid", "in_production", "shipped", "delivered", "cancelled"]);

/**
 * События при сохранении формы — как в OrdersService.update: сначала трек (Order.setTrackingNumber), потом статус
 * (Order.changeStatus). Новый трек у отправленного или доставленного — сразу «трек-номер»; перевод в «Отправлен» с треком —
 * тоже. Ожидающий оплаты → «Оплачен» — «Заказ оплачен», отмена — своё событие, «Статус заказа изменился» — остальное.
 */
function changeEvents(c: OrderChange) {
  const track = c.track?.trim() || null;
  const paid = c.from === "pending_payment" && c.to === "paid";
  const status = c.from !== c.to && c.to !== "cancelled" && !paid;
  const afterShipping = !!track && track !== (c.savedTrack?.trim() || null) && (c.from === "shipped" || c.from === "delivered");
  const tracked = afterShipping || (status && c.to === "shipped" && !!track);
  // Письмо — о новом статусе; о треке после отправки — если заказ остаётся отправленным.
  const mail = (c.from !== c.to && MAILED.has(c.to)) || (afterShipping && c.to === "shipped");
  return { track, paid, status, tracked, mail };
}

const inHours = (r: OrderNoticeRule, workTime: boolean) => !(r.hours === "work" && !workTime) && !(r.hours === "off" && workTime);

/**
 * Что из правил WhatsApp сработает: topics — о чём уйдёт сообщение; skipped — почему правило на это событие не напишет
 * (трек не вписан, уже писало, не то время суток); expected — есть правило на это событие (клиенту стоит знать).
 */
function whatsappPlan(f: OrderNoticeFacts, c: OrderChange, e: ReturnType<typeof changeEvents>) {
  const topics: string[] = [];
  const skipped: string[] = [];
  let expected = false;
  const of = (trigger: string, status?: string) => f.rules.filter((r) => r.trigger === trigger && (!status || !r.orderStatus || r.orderStatus === status));
  const consider = (topic: string, about: string, rules: OrderNoticeRule[], key: string) => {
    if (!rules.length) return;
    expected = true;
    const now = rules.filter((r) => inHours(r, f.workTime));
    if (!now.length) return void skipped.push(`правило ${about} пишет только ${rules[0].hours === "work" ? "в рабочее время" : "вне рабочего времени"}`);
    if (now.every((r) => r.done?.includes(key))) return void skipped.push(`правило уже писало клиенту ${about} и повторно не отправит`);
    topics.push(topic);
  };
  if (e.paid) consider("об оплате", "об оплате", of("order.paid"), "paid");
  if (e.status) consider(`«${orderStatusLabel(c.to)}»`, `о статусе «${orderStatusLabel(c.to)}»`, of("order.status_changed", c.to), c.to);
  if (e.tracked && e.track) consider("трек-номер", "об этом трек-номере", of("order.tracking_added"), e.track);
  else if (c.to === "shipped" && !e.track && of("order.tracking_added").length) {
    expected = true;
    skipped.push("трек-номер не вписан, а без него правило о трек-номере не пишет");
  }
  return { topics, skipped, expected };
}

/**
 * Подпись под формой статуса: что реально уйдёт клиенту, если сохранить форму (статус и трек-номер в ней), — письмо
 * (если почта настоящая) и/или WhatsApp (правило включено, подходит по статусу и времени суток, ещё не писало об этом,
 * есть переписка, клиент не просил не писать первым, окно и суточный лимит открыты). warn — клиент ничего не узнает или
 * сообщение в WhatsApp сейчас пропадёт (окно, лимит): менеджеру написать самому.
 */
export function orderNotice(f: OrderNoticeFacts, c: OrderChange): { text: string; warn: boolean } {
  const e = changeEvents(c);
  if (c.from === c.to && !e.tracked) return { text: "Статус тот же — клиенту ничего не уйдёт.", warn: false };
  const wa = whatsappPlan(f, c, e);
  const paused = wa.topics.length > 0 && !f.noMarketing && f.whatsappChat && !!f.pause;
  const block = !wa.topics.length
    ? null
    : f.noMarketing
      ? "клиент просил не писать первым"
      : !f.whatsappChat
        ? "с клиентом нет переписки в WhatsApp, а первым CRM не пишет"
        : paused
          ? `сейчас ${f.pause}, правило сработает без сообщения и повторно его не отправит`
          : null;
  const channels = [f.realEmail && e.mail ? "письмо" : null, wa.topics.length && !block ? `сообщение в WhatsApp (${wa.topics.join(", ")})` : null].filter(Boolean);
  const noEmail = e.mail && !f.realEmail ? "у клиента нет почты" : null;
  const whatsappWhy = [block, ...wa.skipped].filter(Boolean).join("; ");
  const writeYourself = paused ? "Напишите ему сами или сохраните статус позже." : "Напишите ему сами.";
  if (channels.length) {
    const text = [`Клиент получит ${channels.join(" и ")}.`, noEmail ? `Письма не будет — ${noEmail}.` : null, whatsappWhy ? `В WhatsApp не уйдёт: ${whatsappWhy}.` : null, paused ? writeYourself : null];
    return { text: text.filter(Boolean).join(" "), warn: paused };
  }
  if (!e.mail && !wa.expected) return { text: "Клиенту ничего не уйдёт.", warn: false };
  // Ничего не уйдёт, хотя клиенту стоит знать: почты нет, а WhatsApp — выключен, заблокирован или о таком не пишет.
  const off = c.to === "cancelled" ? "об отмене правила не пишут" : e.status || e.paid ? "правило о таком статусе выключено («Автоматизации»)" : "правило о трек-номере выключено («Автоматизации»)";
  return { text: `Клиент ничего не получит: ${[noEmail, `в WhatsApp — ${whatsappWhy || off}`].filter(Boolean).join(", ")}. ${writeYourself}`, warn: true };
}
