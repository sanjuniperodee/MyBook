/**
 * Протокол Wazzup API v3 (https://wazzup24.ru/help/api-ru/): разбор вебхуков без обращения к БД —
 * чтобы его можно было покрыть тестами.
 */

export interface WazzupIncoming {
  externalId: string;
  channelId: string;
  chatType: string;
  chatId: string;
  at: Date;
  /** Сообщение отправлено не из CRM, а с телефона/из приложения Wazzup (эхо). */
  isEcho: boolean;
  type: string;
  text: string;
  mediaUrl: string | null;
  contactName: string;
  avatarUrl: string | null;
  status: string | null;
}

export interface WazzupStatus {
  externalId: string;
  status: "sent" | "delivered" | "read" | "error";
  error: string | null;
}

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** Подпись к вложению, если текста нет: чтобы в списке чатов было понятно, что пришло. */
export function mediaCaption(type: string) {
  switch (type) {
    case "image":
      return "📷 Фото";
    case "video":
      return "🎬 Видео";
    case "audio":
      return "🎤 Голосовое сообщение";
    case "document":
      return "📎 Файл";
    case "vcard":
      return "👤 Контакт";
    case "geo":
      return "📍 Геопозиция";
    case "wapi_template":
      return "Шаблон WhatsApp";
    case "missing_call":
      return "📞 Пропущенный звонок в WhatsApp";
    default:
      return "Сообщение";
  }
}

export function parseWazzupWebhook(body: unknown): { test: boolean; messages: WazzupIncoming[]; statuses: WazzupStatus[] } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const messages: WazzupIncoming[] = [];
  for (const raw of Array.isArray(b.messages) ? b.messages : []) {
    const m = (raw ?? {}) as Record<string, unknown>;
    const externalId = str(m.messageId);
    const chatId = str(m.chatId);
    if (!externalId || !chatId) continue;
    const contact = (m.contact ?? {}) as Record<string, unknown>;
    const type = str(m.type) || "text";
    const text = str(m.text);
    const at = new Date(str(m.dateTime) || Date.now());
    messages.push({
      externalId,
      channelId: str(m.channelId),
      chatType: str(m.chatType) || "whatsapp",
      chatId,
      at: Number.isNaN(at.getTime()) ? new Date() : at,
      isEcho: m.isEcho === true,
      type,
      text: text || (type === "text" ? "" : mediaCaption(type)),
      mediaUrl: str(m.contentUri) || null,
      contactName: str(contact.name),
      avatarUrl: str(contact.avatarUri) || null,
      status: str(m.status) || null,
    });
  }
  const statuses: WazzupStatus[] = [];
  for (const raw of Array.isArray(b.statuses) ? b.statuses : []) {
    const s = (raw ?? {}) as Record<string, unknown>;
    const externalId = str(s.messageId);
    const status = mapStatus(str(s.status));
    if (!externalId || !status) continue;
    const err = (s.error ?? null) as Record<string, unknown> | null;
    statuses.push({ externalId, status, error: err ? str(err.description) || str(err.error) || "Ошибка доставки" : null });
  }
  return { test: b.test === true, messages, statuses };
}

export function mapStatus(s: string): WazzupStatus["status"] | null {
  switch (s) {
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "error":
      return "error";
    default:
      return null; // inbound, edited и прочее — не меняют статус исходящего
  }
}

/** Порядок статусов: «доставлено» не должно откатиться до «отправлено», если вебхуки пришли не по порядку. */
export const statusRank: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3, error: 4, received: 0 };
