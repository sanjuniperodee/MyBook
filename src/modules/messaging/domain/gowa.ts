import { mediaCaption, type WazzupIncoming as InboundMessage, type WazzupStatus as DeliveryStatus } from "./wazzup";

/**
 * Протокол GOWA — go-whatsapp-web-multidevice (github.com/aldinokemal/go-whatsapp-web-multidevice, docs/webhook-payload.md):
 * разбор вебхуков без сети и БД. Свой шлюз WhatsApp вместо Wazzup: номер магазина привязывается по QR.
 */

/** channelId диалогов, пришедших через GOWA (один номер магазина). */
export const GOWA_CHANNEL = "gowa";

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const record = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Группы, рассылки, статусы и каналы в CRM не нужны — только личные чаты. */
const PERSONAL = /@(s\.whatsapp\.net|lid)$/;

/**
 * Идентификатор собеседника в CRM: номер (77011234567) для обычного чата, как у Wazzup — так диалоги
 * связываются с клиентами по телефону. Скрытый номер (LID, «…@lid») храним целиком, чтобы на него можно было ответить.
 */
export function gowaChatId(jid: string): string {
  const [user, server] = jid.split("@");
  return server === "s.whatsapp.net" ? user.split(":")[0] : jid;
}

/** Обратно: кому отправлять в GOWA. */
export function gowaJid(chatId: string): string {
  return chatId.includes("@") ? chatId : `${chatId.replace(/\D/g, "")}@s.whatsapp.net`;
}

/** Вложение сообщения: тип в словаре CRM и путь к скачанному шлюзом файлу (statics/media/…). */
function attachment(p: Record<string, unknown>): { type: string; path: string | null } | null {
  const kinds: [string, string][] = [
    ["image", "image"],
    ["sticker", "image"],
    ["video", "video"],
    ["video_note", "video"],
    ["audio", "audio"],
    ["document", "document"],
  ];
  for (const [key, type] of kinds) {
    if (!(key in p)) continue;
    const v = p[key];
    const path = typeof v === "string" ? v : str(record(v).path);
    return { type, path: path && /^statics\/media\/[\w.\-]+$/.test(path) ? path : null };
  }
  if ("contact" in p || "contacts_array" in p) return { type: "vcard", path: null };
  if ("location" in p || "live_location" in p) return { type: "geo", path: null };
  return null;
}

/** Получатель статуса — сам аккаунт магазина (он прочитал входящее): такие отметки к нашим сообщениям не относятся. */
const ownJid = (deviceId: string) => deviceId.split("@")[0].split(":")[0];

/**
 * Вебхук GOWA → входящие (и отправленные с телефона — эхо) и статусы доставки в формате инбокса.
 * mediaUrl — как CRM откроет вложение (шлюз доступен только из внутренней сети, файлы отдаёт наш прокси).
 */
export function parseGowaWebhook(body: unknown, mediaUrl: (path: string) => string): { messages: InboundMessage[]; statuses: DeliveryStatus[] } {
  const b = record(body);
  const event = str(b.event);
  const p = record(b.payload);
  const deviceId = str(b.device_id);
  if (event === "message") {
    const chatJid = str(p.chat_id);
    const externalId = str(p.id);
    if (!externalId || !PERSONAL.test(chatJid) || "poll" in p) return { messages: [], statuses: [] };
    const media = attachment(p);
    const type = media?.type ?? "text";
    const text = str(p.body).trim();
    if (!text && !media) return { messages: [], statuses: [] }; // служебные сообщения без содержимого
    const at = new Date(str(p.timestamp));
    const isEcho = p.is_from_me === true;
    return {
      messages: [
        {
          externalId,
          channelId: GOWA_CHANNEL,
          chatType: "whatsapp",
          chatId: gowaChatId(chatJid),
          at: Number.isNaN(at.getTime()) ? new Date() : at,
          isEcho,
          type,
          text: text || mediaCaption(type),
          mediaUrl: media?.path ? mediaUrl(media.path) : null,
          contactName: isEcho ? "" : str(p.from_name),
          avatarUrl: null,
          status: null,
        },
      ],
      statuses: [],
    };
  }
  if (event === "message.ack") {
    const status = str(p.receipt_type) === "read" ? "read" : str(p.receipt_type) === "delivered" ? "delivered" : null;
    if (!status || (deviceId && ownJid(str(p.from)) === ownJid(deviceId))) return { messages: [], statuses: [] };
    const ids = Array.isArray(p.ids) ? p.ids.map(str).filter(Boolean) : [];
    return { messages: [], statuses: ids.map((externalId) => ({ externalId, status, error: null })) };
  }
  return { messages: [], statuses: [] };
}
