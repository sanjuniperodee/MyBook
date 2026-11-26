import "server-only";
import { z } from "zod";
import { can, canSeeAssigned, canWork, contactView, staffViewer, type Staff } from "@/server/access";
import type { ChatListItem } from "@/lib/crm/inbox-model";
import { responseWait, slaMinutes } from "@/modules/reporting/ui/response-wait";
import { formatPhone } from "@/shared/domain/phone";
import { parseWorkHours } from "@/shared/domain/schedule";
import { storeTimeZone } from "@/shared/domain/time";
import { container } from "@/server/container";
import { uuid } from "@/server/input";
import { staffLabel } from "@/shared/domain/staff";
import { op } from "./op";

/** Время в строке списка: сегодня — часы, раньше — «5 нояб.» (по поясу магазина). */
const shortTime = (d: Date | null) => {
  if (!d) return "";
  const tz = storeTimeZone();
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: tz });
  return day(d) === day(new Date()) ? d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: tz }) : d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: tz });
};

/** Имя диалога: имя контакта, иначе телефон или почта (с маской по праву «видеть контакты»). */
const chatTitle = (staff: Staff, c: { contactName: string; chatId: string; channel: string; meta: { phone?: string } }) =>
  c.contactName ||
  (c.channel === "email" ? contactView(staff, { email: c.chatId }).email : c.channel === "site" ? (c.meta.phone ? contactView(staff, { phone: formatPhone(c.meta.phone) }).phone : "Посетитель сайта") : contactView(staff, { phone: formatPhone(c.chatId) }).phone || c.chatId);

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
    // Строки списка — одна сборка для страницы и живого обновления (/api/admin/chats/inbox): ожидание клиента в рабочих
    // минутах против норматива, кто ведёт, бот, закрепление.
    const sla = slaMinutes(slaRaw);
    const hours = parseWorkHours(hoursRaw);
    const now = new Date();
    const names = new Map(admins.map((a) => [a.id, staffLabel(a)]));
    return list.map((c): ChatListItem => {
      const wait = c.awaitingSince ? responseWait(c.awaitingSince, now, hours, sla) : null;
      const phase = (c.botState as { phase?: string } | null)?.phase;
      return {
        id: c.id,
        title: chatTitle(staff, c),
        avatarUrl: c.avatarUrl,
        channel: c.channel,
        time: shortTime(c.lastMessageAt),
        preview: c.lastMessageText,
        unread: c.unread,
        assignee: c.assigneeId ? (names.get(c.assigneeId) ?? null) : null,
        waitMinutes: wait?.minutes ?? null,
        waitLabel: wait?.label ?? null,
        overdue: !!wait?.overdue,
        bot: phase === "active" || phase === "waiting",
        pinned: !!c.pinnedAt,
      };
    });
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
