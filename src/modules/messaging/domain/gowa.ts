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

/** Сегмент пути к файлу шлюза: имя без «/», не «.» и не «..», не начинается с точки. */
const MEDIA_SEGMENT = /^[\w-][\w.-]*$/;

/**
 * Путь к файлу вложения в каталоге шлюза: statics/media/<файл> или вложенный statics/media/<номер>/<дата>/<файл>
 * (так GOWA кладёт файлы, скачанные по запросу). Проверяется по сегментам — выйти из каталога вложений нельзя.
 */
export function isGowaMediaPath(path: string): boolean {
  if (path.length > 300) return false;
  const parts = path.split("/");
  if (parts.length < 3 || parts.length > 8 || parts[0] !== "statics" || parts[1] !== "media") return false;
  return parts.slice(2).every((s) => s !== "." && s !== ".." && MEDIA_SEGMENT.test(s));
}

/** Как CRM открывает файл, скачанный шлюзом: шлюз доступен только из внутренней сети, файлы отдаёт наш прокси. */
export const gowaMediaUrl = (path: string) => `/api/admin/whatsapp/media?path=${encodeURIComponent(path)}`;

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
    return { type, path: path && isGowaMediaPath(path) ? path : null };
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

/** Вид вложения из хранилища чатов GOWA (media_type) в словаре CRM. */
const HISTORY_MEDIA: Record<string, string> = { image: "image", sticker: "image", video: "video", ptv: "video", audio: "audio", ptt: "audio", document: "document", contact: "vcard", location: "geo" };

/**
 * Сообщение из хранилища чатов GOWA (GET /chat/{jid}/messages) — история, которую WhatsApp передал шлюзу при привязке
 * номера. Вложения истории шлюз не скачивает: в CRM — подпись вида «📷 Фото» без файла. Пустые и служебные — null.
 */
export function parseGowaHistory(raw: unknown): InboundMessage | null {
  const p = record(raw);
  const externalId = str(p.id);
  const chatJid = str(p.chat_jid);
  if (!externalId || !PERSONAL.test(chatJid)) return null;
  const type = HISTORY_MEDIA[str(p.media_type)] ?? (str(p.media_type) ? "document" : "text");
  const text = str(p.content).trim();
  if (!text && type === "text") return null;
  const at = new Date(str(p.timestamp));
  if (Number.isNaN(at.getTime())) return null;
  const isEcho = p.is_from_me === true;
  return {
    externalId,
    channelId: GOWA_CHANNEL,
    chatType: "whatsapp",
    chatId: gowaChatId(chatJid),
    at,
    isEcho,
    type,
    text: text || mediaCaption(type),
    mediaUrl: null,
    contactName: isEcho ? "" : str(p.sender_display_name),
    avatarUrl: null,
    status: null,
  };
}
