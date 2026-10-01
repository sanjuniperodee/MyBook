import { isPhoneLike, normalizePhone } from "@/shared/domain/phone";
import { statusRank } from "@/modules/messaging/domain/wazzup";

export type { WazzupIncoming as InboundMessage, WazzupStatus as DeliveryStatus } from "@/modules/messaging/domain/wazzup";

export interface ConversationMeta {
  /** Чат с сайта: страница, с которой написали, и контакты, которые оставил посетитель. */
  page?: string;
  phone?: string;
  email?: string;
  /** Почта: тема последнего письма и Message-ID для In-Reply-To. */
  subject?: string;
  lastMessageId?: string;
}

/** Диалог с клиентом в одном канале (WhatsApp, Instagram, Telegram, сайт, почта). */
export interface Conversation {
  id: string;
  channel: string;
  channelId: string;
  chatId: string;
  contactName: string;
  avatarUrl: string | null;
  clientId: string | null;
  dealId: string | null;
  assigneeId: string | null;
  botStep: number | null;
  meta: ConversationMeta;
}

export const channelLabels: Record<string, string> = {
  whatsapp: "WhatsApp",
  wapi: "WhatsApp API",
  instagram: "Instagram",
  telegram: "Telegram",
  tgapi: "Telegram",
  vk: "ВКонтакте",
  avito: "Avito",
  viber: "Viber",
  site: "Чат на сайте",
  email: "E-mail",
};
export const channelLabel = (c: string) => channelLabels[c] ?? c;

/** Строка для списка чатов. */
export const preview = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 160);

/** Телефон собеседника: идентификатор чата (WhatsApp) или номер, который оставил посетитель. */
export function contactPhone(c: Pick<Conversation, "chatId" | "meta">): string | null {
  if (isPhoneLike(c.chatId)) return normalizePhone(c.chatId);
  return c.meta.phone ? normalizePhone(c.meta.phone) : null;
}

export function contactEmail(c: Pick<Conversation, "channel" | "chatId" | "meta">): string | null {
  return c.channel === "email" ? c.chatId : (c.meta.email ?? null);
}

/** Имя контакта для новой заявки: имя из канала, иначе телефон, иначе понятная подпись. */
export function contactTitle(c: Pick<Conversation, "channel" | "chatId" | "clientId" | "meta">, name: string, formatPhone: (p: string) => string) {
  const phone = contactPhone(c as Conversation);
  if (name) return name;
  if (c.clientId) return "";
  if (phone) return formatPhone(phone);
  return c.channel === "site" ? "Посетитель сайта" : c.chatId;
}

/** Нужно ли обновить карточку диалога данными из нового сообщения. */
export function contactChanges(c: Conversation, m: { contactName: string; avatarUrl: string | null; isEcho: boolean }, extra: { meta?: ConversationMeta; clientId?: string | null }) {
  const meta = extra.meta ? { ...c.meta, ...extra.meta } : c.meta;
  const clientId = c.clientId ?? extra.clientId ?? null;
  const renamed = !!m.contactName && m.contactName !== c.contactName && !m.isEcho;
  const changed = renamed || (!!m.avatarUrl && m.avatarUrl !== c.avatarUrl) || !!extra.meta || clientId !== c.clientId;
  if (!changed) return null;
  return { contactName: m.isEcho ? c.contactName : m.contactName || c.contactName, avatarUrl: m.avatarUrl ?? c.avatarUrl, meta, clientId };
}

/** «Доставлено» не откатывается до «отправлено», если вебхуки пришли не по порядку; ошибка — всегда. */
export function shouldApplyStatus(current: string, next: string) {
  return next === "error" || (statusRank[next] ?? 0) > (statusRank[current] ?? 0);
}
