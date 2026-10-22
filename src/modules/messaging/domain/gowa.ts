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

/**
 * Как в сообщении запоминается файл, скачанный шлюзом. Это только формат хранения (так записаны и старые сообщения):
 * в браузер путь не уходит, файл открывается по id сообщения — /api/admin/chats/messages/<id>/media.
 */
export const gowaMediaUrl = (path: string) => `/api/admin/whatsapp/media?path=${encodeURIComponent(path)}`;

/** Обратно: путь к файлу шлюза из сохранённой в сообщении ссылки прокси; чужая ссылка (Wazzup) или мусор — null. */
export function gowaMediaPath(mediaUrl: string | null): string | null {
  if (!mediaUrl?.startsWith("/api/admin/whatsapp/media?")) return null;
  const path = new URLSearchParams(mediaUrl.slice(mediaUrl.indexOf("?") + 1)).get("path");
  return path && isGowaMediaPath(path) ? path : null;
}

/** id сообщения WhatsApp в шлюзе (3EB0C127D7BACC83D6A1…): только он попадает в адрес запроса к шлюзу. */
export const GOWA_MESSAGE_ID = /^[A-Za-z0-9]{6,64}$/;

/** Виды сообщений, файл которых шлюз может скачать по id сообщения. */
const DOWNLOADABLE = new Set(["image", "video", "audio", "document"]);

/**
 * Кого указать шлюзу при скачивании вложения (?phone=): номер цифрами для обычного чата, скрытый номер (LID) — целиком.
 * Чужие идентификаторы (группы, почта, мусор) — null.
 */
export function gowaDownloadPhone(chatId: string): string | null {
  if (/^\d{5,20}$/.test(chatId)) return chatId;
  if (/^\d{5,25}@lid$/.test(chatId)) return chatId;
  return null;
}

/**
 * Файла у вложения нет (история из хранилища шлюза или вебхук без автоскачивания), но шлюз может его скачать:
 * WhatsApp-диалог шлюза (или любой WhatsApp, когда он идёт через шлюз), вид — фото, видео, голосовое или файл.
 */
export function gowaDownloadable(
  conv: { channel: string; channelId: string; chatId: string },
  viaGowa: boolean,
  m: { type: string; mediaUrl: string | null; externalId: string | null },
): boolean {
  if (m.mediaUrl || !DOWNLOADABLE.has(m.type) || !m.externalId || !GOWA_MESSAGE_ID.test(m.externalId)) return false;
  return conv.channel === "whatsapp" && (conv.channelId === GOWA_CHANNEL || viaGowa) && gowaDownloadPhone(conv.chatId) !== null;
}

/**
 * Content-Type файла для браузера: голосовые WhatsApp (Ogg Opus) шлюз отдаёт как application/ogg — тег <audio>
 * в части браузеров такой файл не играет, поэтому для голосовых — audio/ogg.
 */
export function gowaMediaType(type: string, upstream: string | null): string {
  const mime = (upstream ?? "").split(";")[0].trim().toLowerCase();
  if (type === "audio" && (!mime || mime === "application/ogg" || mime === "application/octet-stream")) return "audio/ogg";
  return upstream || "application/octet-stream";
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
    return { type, path: path && isGowaMediaPath(path) ? path : null };
  }
  if ("contact" in p || "contacts_array" in p) return { type: "vcard", path: null };
  if ("location" in p || "live_location" in p) return { type: "geo", path: null };
  return null;
}

/** Событие журнала звонков (формат контекста «Телефония»; здесь — структурно, чтобы контексты не зависели друг от друга). */
export interface WhatsappCallEvent {
  provider: "whatsapp";
  externalId: string;
  stage: "end";
  direction: "in";
  clientPhone: string;
  extension: null;
  at: Date;
  status: "missed";
  durationSec: 0;
}

/**
 * Входящий звонок в WhatsApp (call.offer) → событие журнала звонков. Шлюз сообщает только о начале звонка, отвечает на него
 * человек на телефоне магазина, поэтому звонок записывается пропущенным: менеджер перезвонит, а если дозвонится сам —
 * пропущенные с этого номера закроются. Звонок из группы и звонок со скрытым номером (LID) без телефона — пустой номер.
 */
export function parseGowaCall(body: unknown): WhatsappCallEvent | null {
  const b = record(body);
  if (str(b.event) !== "call.offer") return null;
  const p = record(b.payload);
  const callId = str(p.call_id);
  const from = str(p.from);
  if (!callId || str(p.group_jid)) return null;
  const phone = /@s\.whatsapp\.net$/.test(from) ? gowaChatId(from).replace(/\D/g, "") : "";
  const at = new Date(str(b.timestamp));
  return {
    provider: "whatsapp",
    externalId: callId,
    stage: "end",
    direction: "in",
    clientPhone: phone,
    extension: null,
    at: Number.isNaN(at.getTime()) ? new Date() : at,
    status: "missed",
    durationSec: 0,
  };
}

/** Получатель статуса — сам аккаунт магазина (он прочитал входящее): такие отметки к нашим сообщениям не относятся. */
const ownJid = (deviceId: string) => deviceId.split("@")[0].split(":")[0];

/** Вебхук GOWA → входящие (и отправленные с телефона — эхо) и статусы доставки в формате инбокса. */
export function parseGowaWebhook(body: unknown): { messages: InboundMessage[]; statuses: DeliveryStatus[] } {
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
          mediaUrl: media?.path ? gowaMediaUrl(media.path) : null,
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
 * номера. Файлов вложений в истории нет: CRM просит шлюз скачать файл, когда его впервые открывают. Пустые и служебные — null.
 */
export function parseGowaHistory(raw: unknown): InboundMessage | null {
  const p = record(raw);
  const externalId = str(p.id);
  const chatJid = str(p.chat_jid);
  if (!externalId || !PERSONAL.test(chatJid)) return null;
  // Звонок шлюз хранит строкой-сообщением (media_type «call»): это не сообщение клиента.
  if (str(p.media_type) === "call") return null;
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

/** Личный чат (не группа, не рассылка, не канал) — только такие идут в CRM. */
export const isGowaPersonalJid = (jid: string) => PERSONAL.test(jid);

/**
 * Подстраховка вебхука. GOWA отдаёт событие сайту 30 секунд (попытка — 10 с, повторы через 1, 2, 4, 8 с) и бросает:
 * пока сайт перезапускается или отвечает дольше, сообщение в CRM само не попадёт. Поэтому планировщик каждые 30 секунд
 * сверяет хранилище шлюза с CRM. Последние 45 секунд не берём — их ещё доставляет вебхук; первый проход после запуска
 * процесса смотрит на 2 часа назад (сайт мог лежать), следующие — на 10 минут.
 */
export const GOWA_CATCHUP = { everyMs: 30_000, settleMs: 45_000, windowMs: 10 * 60_000, firstWindowMs: 2 * 3600_000 } as const;

/** Окно сверки: с какого и по какой момент сообщения шлюза должны уже быть в CRM. */
export function gowaCatchUpRange(now: Date, first: boolean): { from: Date; to: Date } {
  const to = new Date(now.getTime() - GOWA_CATCHUP.settleMs);
  return { from: new Date(to.getTime() - (first ? GOWA_CATCHUP.firstWindowMs : GOWA_CATCHUP.windowMs)), to };
}
