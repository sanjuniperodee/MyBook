/**
 * Коммерческое предложение (КП / предложения клиенту из чата): ссылка на оплату заказа, ссылка на книгу в работе
 * и персональная скидка с одноразовым промокодом. Те же права и действие sendOfferAction, что в чате CRM.
 */
import { apiStaff, HttpError } from "@/server/api";
import { sendOfferAction } from "@/server/crm-actions/chats";
import { can, canWork } from "@/server/access";
import { container } from "@/server/container";
import { DISCOUNT_HOURS } from "@/modules/marketing/domain/offers";
import { discountPercents, offerHourOptions } from "@/modules/messaging/ui/crm-chat-view";
import { refusedResponse } from "@/modules/sales/ui/crm-forms";
import type { Handlers } from "../../app";

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
      hourOptions: offerHourOptions(DISCOUNT_HOURS),
      canSend: can(staff, "chats.send") && canWork(staff, conv.assigneeId),
    };
  },

  async crmChatOfferSend({ req, input }) {
    await apiStaff(req, "chats.view", "chats.send");
    const b = input.body;
    if (b.kind === "discount" && (b.percent === undefined || b.hours === undefined)) return refusedResponse("Укажите размер скидки и срок");
    const r = await sendOfferAction(input.chatId, b.kind === "discount" ? { kind: "discount", percent: b.percent!, hours: b.hours! } : { kind: b.kind });
    if (!r.ok) return refusedResponse(r.message);
    return { ok: true as const, message: r.message };
  },
};
