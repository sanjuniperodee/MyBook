import "server-only";
import { z } from "zod";
import { can, canSeeAssigned, canWork, staffViewer } from "@/server/access";
import { container } from "@/server/container";
import { uuid } from "@/server/input";
import { staffLabel } from "@/shared/domain/staff";
import { op } from "./op";

/** Сборщики «Чатов» CRM (ADR 0012, A5 — Раздел 5): строки списка и открытый диалог с контекстом, счетами и ботом. */
export const reads = {
  "chats.inbox": op(["chats.view"], z.object({ f: z.string().max(20), q: z.string().max(200).optional() }), async ({ f, q }, staff) => {
    const { getSetting } = await import("@/modules/workspace");
    const [list, admins, slaRaw, hoursRaw] = await Promise.all([
      container().reporting.inbox(staffViewer(staff), f as Parameters<ReturnType<typeof container>["reporting"]["inbox"]>[1], q),
      container().access.queries.allStaff(),
      getSetting("crm.slaMinutes"),
      getSetting("crm.workHours"),
    ]);
    return { list, admins, slaRaw, hoursRaw };
  }),

  "chats.page": op(["chats.view"], z.object({ selectedId: uuid.nullable() }), async ({ selectedId }, staff) => {
    const [admins, selected, phoneHolder] = await Promise.all([container().access.queries.allStaff(), selectedId ? container().messaging.queries.conversation(selectedId) : null, container().messaging.phoneHolder()]);
    const conv = selected && canSeeAssigned(staff, selected.assigneeId) ? selected : null;
    if (!conv) return { admins, phoneHolder, conv: null, open: null };
    const [{ mentionableStaff }, { invoiceViews }] = await Promise.all([import("@/modules/workspace"), import("@/server/invoice-views")]);
    const chat = container().messaging.view;
    const [messages, templates, vars, blocker, context, offers, mentionables, ai, invoiceRows, bot, kaspiWarning] = await Promise.all([
      chat.messages(conv.id),
      chat.templates(staff.user.id),
      chat.vars(conv, staffLabel(staff.user)),
      chat.sendBlocker(conv),
      container().reporting.conversationContext(conv),
      container().marketing.service.chatOffers(conv.clientId, can(staff, "promo.give")),
      mentionableStaff(),
      // Подсказка ответа: AI-помощник или (для диалогов со сделкой) модель продажника.
      Promise.all([container().assistant.service.configured(), container().assistant.seller.configured().catch(() => false)]).then(([a, s]) => a || s),
      conv.dealId && can(staff, "deals.view") ? container().ordering.invoices.listFor(conv.dealId) : Promise.resolve([]),
      container().messaging.botStatus(conv.id),
      // Кассир Kaspi отключён — плашка над полем ввода (без запроса к Kaspi: сохранённое состояние проверки).
      container().ordering.kaspiWatch.warning().catch(() => null),
    ]);
    // Вопросы клиента помощнику в кабинете — рядом с его WhatsApp (в самой беседе помощника — не нужно).
    const help = conv.clientId && !conv.meta.help ? await container().messaging.helpQuestionsOf(conv.clientId).catch(() => null) : null;
    // Счета сделки диалога: ссылка на оплату — тому, кто ведёт и диалог, и сделку.
    const mine = canWork(staff, conv.assigneeId);
    const dealWork = !context.dealRow || canWork(staff, context.dealRow.deal.assigneeId);
    const invoices = invoiceViews(invoiceRows, { now: new Date(), withLink: can(staff, "deals.edit") && mine && dealWork });
    const catalog = can(staff, "chats.send") && mine ? await container().messaging.catalogInChat(conv) : false;
    return { admins, phoneHolder, conv, open: { messages, templates, vars, blocker, context, offers, mentionables, ai, invoices, bot, kaspiWarning, help, catalog } };
  }),
};
