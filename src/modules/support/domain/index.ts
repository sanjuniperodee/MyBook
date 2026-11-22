import { contextError } from "@/shared/domain";
import { normalizePhone } from "@/shared/domain/phone";
import {
  SUPPORT_KIND_LABELS,
  SUPPORT_KINDS,
  SUPPORT_STATUS_LABELS,
  SUPPORT_URGENCIES,
  type SupportAttachment,
  type SupportAttachmentKind,
  type SupportChat,
  type SupportCommit,
  type SupportEvent,
  type SupportKind,
  type SupportStatus,
  type SupportUrgency,
} from "@/shared/domain/support";

export type SupportErrorCode = "invalid" | "notFound" | "tooMany";
export const SupportError = contextError<SupportErrorCode>("support", "SupportError");
export type SupportError = InstanceType<typeof SupportError>;

/** Обращение целиком — как хранится. */
export interface Ticket {
  id: string;
  number: number;
  status: SupportStatus;
  kind: SupportKind;
  urgency: SupportUrgency;
  description: string;
  place: string;
  expected: string;
  reporterName: string;
  notifyPhone: string;
  clientPhone: string;
  device: string;
  userAgent: string;
  attachments: SupportAttachment[];
  chat: SupportChat | null;
  summary: string;
  resolution: string;
  devNote: string;
  commits: SupportCommit[];
  history: SupportEvent[];
  createdBy: string | null;
  processedAttempts: number;
  processedAt: Date | null;
  resolvedAt: Date | null;
  notifiedAt: Date | null;
  notifyError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const DESCRIPTION_MAX = 10_000;
export const SHORT_MAX = 500;
/** Вложений в одном обращении. */
export const FILES_MAX = 15;
/** Один файл — до 50 МБ (видео с экрана телефона), все вместе — до 75 МБ (nginx пропускает 80). */
export const FILE_MAX_BYTES = 50 * 1024 * 1024;
export const TOTAL_MAX_BYTES = 75 * 1024 * 1024;

/** Поля формы обращения. */
export interface NewTicketInput {
  kind: string;
  urgency: string;
  description: string;
  place: string;
  expected: string;
  reporterName: string;
  notifyPhone: string;
  clientPhone: string;
  device: string;
  userAgent: string;
}

const clean = (v: string | null | undefined, max: number) => (v ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);

/**
 * Проверка формы: нужен номер для уведомления и хоть что-то по сути — текст или вложение (часто присылают одно
 * голосовое). Ошибка — SupportError("invalid", текст для человека).
 */
export function validateNew(input: NewTicketInput, files: number): Omit<NewTicketInput, "kind" | "urgency"> & { kind: SupportKind; urgency: SupportUrgency } {
  const notifyPhone = normalizePhone(input.notifyPhone.slice(0, 40));
  if (notifyPhone.length < 11 || notifyPhone.length > 15) throw new SupportError("invalid", "Укажите номер WhatsApp, куда написать, когда исправим");
  const description = clean(input.description, DESCRIPTION_MAX);
  if (!description && !files) throw new SupportError("invalid", "Опишите, что случилось, или приложите голосовое, скриншот или видео");
  if (files > FILES_MAX) throw new SupportError("invalid", `Не больше ${FILES_MAX} файлов в одном обращении`);
  const clientPhone = normalizePhone(input.clientPhone.slice(0, 40));
  return {
    kind: (SUPPORT_KINDS as readonly string[]).includes(input.kind) ? (input.kind as SupportKind) : "bug",
    urgency: (SUPPORT_URGENCIES as readonly string[]).includes(input.urgency) ? (input.urgency as SupportUrgency) : "normal",
    description,
    place: clean(input.place, 2000),
    expected: clean(input.expected, 4000),
    reporterName: clean(input.reporterName, 120),
    notifyPhone,
    clientPhone: clientPhone.length >= 11 && clientPhone.length <= 15 ? clientPhone : "",
    device: clean(input.device, SHORT_MAX),
    userAgent: clean(input.userAgent, SHORT_MAX),
  };
}

/** Вид вложения по типу и имени файла: голосовые WhatsApp приходят как .opus/.ogg, иногда с типом application/octet-stream. */
export function attachmentKind(mime: string, name: string): SupportAttachmentKind {
  const m = mime.toLowerCase();
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (m.startsWith("audio/") || ["opus", "ogg", "oga", "m4a", "mp3", "wav", "aac", "amr", "flac", "weba"].includes(ext)) return "audio";
  if (m.startsWith("video/") || ["mp4", "mov", "webm", "3gp", "mkv", "avi"].includes(ext)) return "video";
  if (m.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic", "heif", "gif"].includes(ext)) return "image";
  return "file";
}

/** Расширение файла для ключа хранилища: из имени, иначе из типа; только безопасные символы. */
export function fileExt(name: string, mime: string): string {
  const fromName = name.includes(".") ? (name.split(".").pop() ?? "") : "";
  const fromMime = mime.split(";")[0].split("/")[1] ?? "";
  const ext = (fromName || fromMime || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  return ext || "bin";
}

/**
 * Номера обращений в тексте коммита: «Обращение №12», «обращения №12, №13 и №15», «support #12». Нужны и слово, и знак
 * № (#) у каждого номера, в одной строке: «№12» без слова — может быть заказ, «Обращение №12\n3 файла» — только 12.
 * Ошибка здесь закрыла бы чужое обращение и написала человеку «исправили».
 */
export function ticketRefs(text: string): number[] {
  const out = new Set<number>();
  const re = /(?:^|[^\p{L}\p{N}])(?:обращени\p{L}*|support|ticket)[ \t]*:?[ \t]*([№#][ \t]*\d{1,7}(?:[ \t]*(?:,|и|and|&)[ \t]*[№#][ \t]*\d{1,7})*)/giu;
  for (const m of text.matchAll(re)) {
    for (const n of m[1].matchAll(/\d{1,7}/g)) {
      const v = Number(n[0]);
      if (v > 0) out.add(v);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** Колокольчик сотрудникам о новом обращении. */
export function ticketAlert(t: Pick<Ticket, "number" | "urgency" | "kind" | "description" | "attachments">): { title: string; body: string } {
  return {
    title: `${ticketLabel(t.number)}${t.urgency === "urgent" ? " — срочно" : ""}: ${SUPPORT_KIND_LABELS[t.kind].toLowerCase()}`,
    body: (t.description || `${t.attachments.length} влож.`).slice(0, 200),
  };
}

/** Как обращение называют в чате и коммите. */
export const ticketLabel = (n: number) => `Обращение №${n}`;

/**
 * Текст уведомления в WhatsApp: номер, итог и что сделали (resolution) — человеку, который оставил обращение.
 * У «в работе» и «ждём ответа» — короткая весточка, у закрытых — итог и ссылка на новое обращение.
 */
export function notificationText(t: Pick<Ticket, "number" | "status" | "resolution" | "reporterName">, appUrl: string): string {
  const hello = t.reporterName ? `Здравствуйте, ${t.reporterName.split(/\s+/)[0]}!` : "Здравствуйте!";
  const head =
    t.status === "done"
      ? `${ticketLabel(t.number)} в MyBooks: исправили ✅`
      : t.status === "rejected"
        ? `${ticketLabel(t.number)} в MyBooks закрыто без изменений.`
        : `${ticketLabel(t.number)} в MyBooks: ${SUPPORT_STATUS_LABELS[t.status].toLowerCase()}.`;
  const tail =
    t.status === "done" || t.status === "rejected"
      ? `Если что-то ещё не так — ответьте на это сообщение или оставьте новое обращение: ${appUrl.replace(/\/+$/, "")}/support`
      : "";
  return [hello, head, t.resolution.trim(), tail].filter(Boolean).join("\n\n");
}

/** Словарь для расшифровки: названия разделов и слова, которые модели путают. */
export const TRANSCRIBE_GLOSSARY =
  "Словарь: MyBooks (майбукс), книга воспоминаний, кабинет, редактор, глава, вопросы, ответы, оглавление, содержание, обложка, оборот обложки, корешок, макет, вёрстка, разворот, полоса, страница, шаблон, кремовый, белый, фото главы, альбом, «Продолжение следует», письма близких, QR-код, видео по QR, ИИ-помощник, AI-корректор, ИИ-дизайнер, лимит, заказ, сделка, предоплата, Kaspi, Каспи, рассрочка, типография, печать, PDF, CRM, менеджер, бот, WhatsApp, ватсап, доступ на коррекцию, «Открыть для правок», промокод, сертификат.";

export const TRANSCRIBE_SYSTEM = [
  "Дословно расшифруй запись. Это голосовое или видео от сотрудника или клиента сервиса MyBooks (печатные книги воспоминаний) — о проблеме на сайте или просьбе что-то изменить.",
  "Речь часто смешанная: русский и казахский вперемешку, разговорная, со сленгом («брат», «бека», «че там»). Пиши, как сказано: русские слова — по-русски, казахские — по-казахски кириллицей (ә, ғ, қ, ң, ө, ұ, ү, һ, і). Не переводи и не пересказывай.",
  "Если слово не разобрать — пиши [неразборчиво], не придумывай. Если в записи нет речи — ответь «(без речи)».",
  "Ответ — только текст расшифровки, без вступлений и пометок.",
].join("\n");

export const SUMMARY_SYSTEM = [
  "Ты разбираешь обращения в поддержку сервиса MyBooks (печатные книги воспоминаний: кабинет клиента с редактором глав, обложкой, фото; CRM для менеджеров; печать в типографии).",
  "Обращение часто прислано кусками: описание, расшифровки голосовых (могут быть с ошибками распознавания), подписи к скриншотам. Собери из этого понятную задачу для разработчика.",
  "Ответ — по-русски, простым текстом, без markdown, строго в формате:",
  "Суть: одно-два предложения — что не так или что нужно.",
  "Где: страница, раздел, книга, заказ, устройство — что известно.",
  "Что ожидают: какой результат нужен.",
  "Неясно: что стоит уточнить у человека (или «—», если всё понятно).",
  "Не выдумывай того, чего нет в обращении.",
].join("\n");

/** Текст обращения для модели, которая пишет суть. */
export function summaryInput(t: Pick<Ticket, "kind" | "urgency" | "description" | "place" | "expected" | "clientPhone" | "device" | "attachments" | "chat">): string {
  const lines = [
    `Тип: ${SUPPORT_KIND_LABELS[t.kind]}${t.urgency === "urgent" ? " (срочно)" : ""}`,
    t.description ? `Описание:\n${t.description}` : "Описания нет.",
    t.place ? `Где: ${t.place}` : "",
    t.expected ? `Что ожидали: ${t.expected}` : "",
    t.device ? `Устройство: ${t.device}` : "",
    t.clientPhone ? "Указан телефон клиента." : "",
  ];
  for (const [i, a] of t.attachments.entries()) {
    if (a.transcript) lines.push(`Расшифровка вложения ${i + 1} (${a.kind === "video" ? "видео" : "голосовое"}, ${a.transcriptBy ?? "?"}):\n${a.transcript}`);
    else lines.push(`Вложение ${i + 1}: ${a.kind === "image" ? "скриншот или фото" : a.kind === "video" ? "видео" : a.kind === "audio" ? "голосовое (не расшифровано)" : "файл"} «${a.name}»`);
  }
  if (t.chat?.messages.length) {
    lines.push(
      `Переписка с клиентом (${t.chat.contact || t.chat.chatId}), выбранные сообщения — «клиент» пишет нам, «магазин» отвечает:\n` +
        t.chat.messages.map((m) => `[${m.at.slice(0, 16).replace("T", " ")}] ${m.direction === "in" ? "клиент" : "магазин"}: ${chatMessageText(m)}`).join("\n"),
    );
  }
  return lines.filter(Boolean).join("\n\n").slice(0, 40_000);
}

/** Сообщение переписки одной строкой: текст, расшифровка голосового или вид вложения. */
export function chatMessageText(m: SupportChat["messages"][number]): string {
  const kind = m.type === "audio" ? "голосовое" : m.type === "image" ? "фото" : m.type === "video" ? "видео" : m.type === "document" ? "файл" : "";
  if (m.type === "audio") return m.transcript ? `(голосовое) ${m.transcript}` : "(голосовое, не расшифровано)";
  const text = m.text.replace(/^[📷🎬📎🎤👤]\s*(Фото|Видео|Файл|Голосовое сообщение|Контакт)$/u, "").trim();
  return kind ? `(${kind})${text ? ` ${text}` : ""}` : text;
}
