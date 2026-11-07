import "server-only";
import { container } from "@/server/container";
import { contactView, type Staff } from "@/server/access";
import { staffLabel } from "@/shared/domain/staff";
import { formatPhone } from "@/shared/domain/phone";
import { storeTimeZone } from "@/shared/domain/time";
import { parseWorkHours } from "@/shared/domain/schedule";
import { getSetting } from "@/modules/workspace";
import { responseWait, slaMinutes } from "@/modules/reporting/ui/response-wait";
import type { ChatFilter, ChatListItem } from "@/components/admin/chat/inbox-model";

/** Время в строке списка: сегодня — часы, раньше — «5 нояб.» (по поясу магазина). */
export const shortTime = (d: Date | null) => {
  if (!d) return "";
  const tz = storeTimeZone();
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: tz });
  return day(d) === day(new Date()) ? d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: tz }) : d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: tz });
};

/** Имя диалога: имя контакта, иначе телефон или почта (с маской по праву «видеть контакты»). */
export const chatTitle = (staff: Staff, c: { contactName: string; chatId: string; channel: string; meta: { phone?: string } }) =>
  c.contactName ||
  (c.channel === "email" ? contactView(staff, { email: c.chatId }).email : c.channel === "site" ? (c.meta.phone ? contactView(staff, { phone: formatPhone(c.meta.phone) }).phone : "Посетитель сайта") : contactView(staff, { phone: formatPhone(c.chatId) }).phone || c.chatId);

/**
 * Строки списка «Чатов» — одна сборка для страницы и для живого обновления списка (/api/admin/chats/inbox): ожидание
 * клиента в рабочих минутах против норматива, кто ведёт, бот, закрепление.
 */
export async function inboxItems(staff: Staff, f: ChatFilter, q: string | undefined): Promise<ChatListItem[]> {
  const [list, admins, slaRaw, hoursRaw] = await Promise.all([
    container().reporting.inbox({ userId: staff.user.id, seesAll: staff.scope === "all" }, f, q),
    container().access.queries.allStaff(),
    getSetting("crm.slaMinutes"),
    getSetting("crm.workHours"),
  ]);
  const sla = slaMinutes(slaRaw);
  const hours = parseWorkHours(hoursRaw);
  const now = new Date();
  const names = new Map(admins.map((a) => [a.id, staffLabel(a)]));
  return list.map((c) => {
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
}
