/**
 * Коммерческое предложение (КП / предложения клиенту из чата): ссылка на оплату заказа, ссылка на книгу в работе
 * и персональная скидка с одноразовым промокодом. Те же права и действие sendOfferAction, что в чате CRM.
 */
import { apiStaff, HttpError } from "@/server/api";
import { sendOfferAction } from "@/server/crm-actions/chats";
import { can, canWork } from "@/server/access";
import { container } from "@/server/container";
import { DISCOUNT_HOURS } from "@/modules/marketing/domain/offers";
import { refused } from "./common";
import type { Handlers } from "../../app";

const HOUR_LABELS: Record<number, string> = {
  24: "на сутки",
  48: "на 2 дня",
  72: "на 3 дня",
  168: "на неделю",
};

const hourLabel = (h: number) => HOUR_LABELS[h] ?? (h % 24 === 0 ? `на ${h / 24} дн.` : `на ${h} ч`);

/** Варианты процента скидки как в ChatPanel (шаг 5% до maxDiscount; если предел не кратен 5 — добавляем его). */
function discountPercents(max: number): number[] {
  if (max <= 0) return [];
  const list = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50].filter((p) => p <= max);
  if (!list.includes(max)) list.push(max);
  return list;
}

export const crmKpHandlers: Pick<Handlers, "crmChatOffers" | "crmChatOfferSend"> = {
  async crmChatOffers({ req, input }) {
    const staff = await apiStaff(req, "chats.view");
    const conv = await container().messaging.queries.conversation(input.chatId);
    if (!conv || !staff.context.canSee(conv.assigneeId)) throw new HttpError(404, "notFound");
    const o = await container().marketing.service.chatOffers(conv.clientId, can(staff, "promo.give"));
    return {
      order: o.order,
      book: o.book,
      maxDiscount: o.maxDiscount,
      percents: discountPercents(o.maxDiscount),
      hours: [...DISCOUNT_HOURS],
      hourOptions: DISCOUNT_HOURS.map((h) => ({ hours: h, label: hourLabel(h) })),
      canSend: can(staff, "chats.send") && canWork(staff, conv.assigneeId),
    };
  },

  async crmChatOfferSend({ req, input }) {
    await apiStaff(req, "chats.view", "chats.send");
    const b = input.body;
    if (b.kind === "discount" && (b.percent === undefined || b.hours === undefined)) return refused("Укажите размер скидки и срок");
    const r = await sendOfferAction(input.chatId, b.kind === "discount" ? { kind: "discount", percent: b.percent!, hours: b.hours! } : { kind: b.kind });
    if (!r.ok) return refused(r.message);
    return { ok: true as const, message: r.message };
  },
};
