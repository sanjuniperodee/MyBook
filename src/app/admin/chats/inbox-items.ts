import "server-only";
import { contactView, type Staff } from "@/web/access";
import { formatPhone } from "@/shared/domain/phone";
import { storeTimeZone } from "@/shared/domain/time";
import type { ChatFilter, ChatListItem } from "@/lib/crm/inbox-model";
import { crmRead } from "@/web/crm";

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

/** Строки списка «Чатов» — их собирает mybook-api (`chats.inbox`): та же сборка у страницы и живого обновления. */
export async function inboxItems(_staff: Staff, f: ChatFilter, q: string | undefined): Promise<ChatListItem[]> {
  return crmRead("chats.inbox", { f, q: q?.slice(0, 200) });
}
