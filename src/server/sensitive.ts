import "server-only";
import { findSensitive, type SensitiveFinding } from "@/modules/messaging";
import { container } from "./container";

/**
 * Чужой номер, карта, IBAN или ссылка на перевод Kaspi в тексте, который сотрудник отправляет клиенту этого диалога:
 * сообщение, правка, подпись к файлу (chats-d4). Можно номер самого клиента (чат, номера сделки) и номер магазина —
 * иначе проверка ругалась бы на них. deal — если вызывающий его уже загрузил.
 */
export async function sensitiveFor(
  conv: { chatId: string; meta: { phone?: string | null }; dealId: string | null },
  text: string,
  deal?: { contactPhone: string | null; extraPhones: string[] } | null,
): Promise<SensitiveFinding[]> {
  if (!text.trim()) return [];
  const d = deal !== undefined ? deal : conv.dealId ? await container().sales.deals.findById(conv.dealId) : null;
  return findSensitive(text, [conv.chatId, conv.meta.phone, d?.contactPhone, ...(d?.extraPhones ?? []), await container().marketing.service.shopWhatsapp()]);
}

export { sensitiveWhat } from "@/modules/messaging";
