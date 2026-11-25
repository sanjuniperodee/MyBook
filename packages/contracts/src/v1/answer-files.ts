/**
 * Свои видео, аудио и ссылки по QR-коду к ответам книги (API v1, ADR 0012):
 * состояние медиа ответа со всеми локализованными подписями, лимитами, пакетами минут и векторными QR-кодами;
 * загрузка своего файла кусками с докачкой, опрос статуса обработки, удаление файла, добавление ссылки (с разбором и
 * oEmbed YouTube на сервере), сохранение карточек ответа и покупка пакета минут через Kaspi Pay.
 *
 * Правила и лимиты — те же, что в кабинете сайта (src/modules/authoring/infrastructure/answerFiles.ts,
 * src/lib/book/answer-files.ts, src/lib/book/answer-media.ts). В приложении нет своих строк и чисел.
 */
import { z } from "zod";
import { ANSWER_MEDIA_LIMITS } from "../limits";
import { AnswerMedia } from "./books";
import { KaspiInvoice, KaspiInvoiceResult, KaspiPayBody } from "./cabinet-orders";
import { Ok, route, schemas, uuid, type RouteDef } from "./core";

export { ANSWER_MEDIA_LIMITS } from "../limits";

/** Состояние загруженного файла (включая gone — если запись удалена на сервере). */
export const AnswerFileState = z
  .object({
    id: uuid,
    token: z.string(),
    /** Публичная страница файла, которую кодирует QR-код (/v/<token>). */
    url: z.string(),
    kind: z.enum(["video", "audio"]),
    status: z.enum(["uploading", "queued", "processing", "ready", "failed", "gone"]),
    name: z.string(),
    durationSec: z.number().int().nullable(),
    /** Форматированная длительность («3:07») или null. */
    durationLabel: z.string().nullable(),
    sourceBytes: z.number().int(),
    receivedBytes: z.number().int(),
    error: z.string().nullable(),
    /** Строка состояния для карточки (на языке пользователя: «Ждёт обработки…», «Сжимаем файл…», «Готово · 3:07»). */
    statusLabel: z.string(),
    /** Текст ошибки вместе с подсказкой перевыгрузки (для failed/gone); иначе null. */
    errorText: z.string().nullable(),
    /** Путь к кадру-обложке видео (/api/v/<token>?poster=1&v=…); null — нет кадра. */
    poster: z.string().nullable(),
    /** Путь к готовому потоковому видео/аудио (/api/v/<token>); null — пока не готов. */
    playbackUrl: z.string().nullable(),
    /** Путь для скачивания готового файла (/api/v/<token>?download=1); null — пока не готов. */
    downloadUrl: z.string().nullable(),
  })
  .register(schemas, { id: "AnswerFileState" });

/** Элемент QR-медиа в ответе: сохранённые поля + QR-код SVG (как в печати) + состояние своего файла. */
export const AnswerMediaEntry = z
  .object({
    id: z.string(),
    kind: z.enum(["video", "music", "audio"]),
    url: z.string(),
    fileId: z.string().nullable(),
    title: z.string(),
    anchor: z.number().int().nullable(),
    /** Название площадки («YouTube», «MyBooks», домен). */
    source: z.string(),
    /** Векторный QR-код SVG (тот же рисунок qrDrawing, что печатается в книге). */
    qrSvg: z.string(),
    /** Кадр видео или обложка YouTube для превью карточки; null — показываем только QR. */
    thumbUrl: z.string().nullable(),
    /** Прямой путь воспроизведения для готового своего файла (/api/v/<token>); null — для ссылок/неготовых. */
    playbackUrl: z.string().nullable(),
    /** Состояние своего файла (для fileId != null); null — внешняя ссылка. */
    file: AnswerFileState.nullable(),
  })
  .register(schemas, { id: "AnswerMediaEntry" });

/** Минуты и лимит своих файлов книги + готовая строка статуса на языке пользователя. */
export const AnswerFileQuota = z
  .object({
    minutes: z.number().int(),
    usedSec: z.number().int(),
    leftSec: z.number().int(),
    files: z.number().int(),
    maxFiles: z.number().int(),
    /** Лимит минут или числа файлов исчерпан — кнопка загрузки заблокирована. */
    full: z.boolean(),
    /** Готовая строка квоты («Свободно в книге: 25 из 30 мин» / «Все 30 минут заняты…»). */
    statusText: z.string(),
  })
  .register(schemas, { id: "AnswerFileQuota" });

/** Пакет дополнительных минут, доступный к покупке через Kaspi. */
export const AnswerMediaPack = z
  .object({
    id: z.string(),
    minutes: z.number().int(),
    price: z.number().int(),
    featured: z.boolean(),
    minutesLabel: z.string(),
    priceLabel: z.string(),
    perMinuteLabel: z.string(),
  })
  .register(schemas, { id: "AnswerMediaPack" });

/** Вариант места QR-кода в тексте ответа (как у фото: перед текстом, после абзаца N, в конце). */
export const AnswerMediaPosition = z
  .object({
    anchor: z.number().int().nullable(),
    label: z.string(),
  })
  .register(schemas, { id: "AnswerMediaPosition" });

/** Все числовые лимиты, расширения файлов и интервалы опроса — с сервера (без магических чисел в приложении). */
export const AnswerMediaLimits = z
  .object({
    maxMedia: z.number().int(),
    titleMax: z.number().int(),
    urlMax: z.number().int(),
    chunkBytes: z.number().int(),
    maxSourceBytes: z.number().int(),
    maxVideoSec: z.number().int(),
    maxAudioSec: z.number().int(),
    maxFilesPerBook: z.number().int(),
    pollIntervalMs: z.number().int(),
    kaspiPollIntervalMs: z.number().int(),
    maxRetries: z.number().int(),
    videoExtensions: z.array(z.string()),
    audioExtensions: z.array(z.string()),
  })
  .register(schemas, { id: "AnswerMediaLimits" });

/** Все надписи экрана QR-медиа и оплаты Kaspi — из словарей сайта на языке пользователя. */
export const AnswerMediaLabels = z
  .object({
    add: z.string(),
    addTitle: z.string(),
    title: z.string(),
    intro: z.string(),
    howTo: z.string(),
    urlLabel: z.string(),
    urlPlaceholder: z.string(),
    submit: z.string(),
    cancel: z.string(),
    badUrl: z.string(),
    limitReached: z.string(),
    duplicate: z.string(),
    kind: z.string(),
    kinds: z.object({ video: z.string(), music: z.string(), audio: z.string() }),
    caption: z.string(),
    captionPlaceholder: z.object({ video: z.string(), music: z.string(), audio: z.string() }),
    place: z.string(),
    open: z.string(),
    openFile: z.string(),
    remove: z.string(),
    printNote: z.string(),
    upload: z.object({
      button: z.string(),
      hint: z.string(),
      orLink: z.string(),
      reading: z.string(),
      /** Шаблон прогресса с {pct}, например «Загружаем… {pct}%». */
      progressTemplate: z.string(),
      keepOpen: z.string(),
      retrying: z.string(),
      stop: z.string(),
      retry: z.string(),
      notMedia: z.string(),
      tooBig: z.string(),
      tooLongVideo: z.string(),
      tooLongAudio: z.string(),
      needMinutes: z.string(),
      more: z.string(),
      featured: z.string(),
      buy: z.string(),
      payUnavailable: z.string(),
      close: z.string(),
      networkError: z.string(),
    }),
    file: z.object({
      queued: z.string(),
      processing: z.string(),
      wait: z.string(),
      reupload: z.string(),
      removeConfirm: z.string(),
      removeYes: z.string(),
      removeNo: z.string(),
      gone: z.string(),
    }),
    kaspi: z.object({
      title: z.string(),
      phoneLabel: z.string(),
      invoiceNote: z.string(),
      sendInvoice: z.string(),
      payByQr: z.string(),
      sentSteps: z.string(),
      scanQr: z.string(),
      openKaspi: z.string(),
      waiting: z.string(),
      paid: z.string(),
      failed: z.string(),
      cancelled: z.string(),
      expired: z.string(),
      again: z.string(),
    }),
  })
  .register(schemas, { id: "AnswerMediaLabels" });

/** Полное состояние QR-медиа для ответа книги. */
export const AnswerMediaState = z
  .object({
    editable: z.boolean(),
    media: z.array(AnswerMediaEntry),
    quota: AnswerFileQuota,
    packs: z.array(AnswerMediaPack),
    positions: z.array(AnswerMediaPosition),
    limits: AnswerMediaLimits,
    labels: AnswerMediaLabels,
  })
  .register(schemas, { id: "AnswerMediaState" });

export const AnswerFileStartBody = z
  .object({
    name: z.string().trim().min(1).max(300),
    size: z.number().int().min(1).max(ANSWER_MEDIA_LIMITS.maxSourceBytes * 2),
    type: z.string().max(200).default(""),
    /** Длительность в секундах (если клиент её узнал); null — проверит сервер. */
    durationSec: z.number().min(0).max(24 * 3600).nullable().default(null),
  })
  .strict()
  .register(schemas, { id: "AnswerFileStartBody" });

export const AnswerFileStarted = z
  .object({
    file: AnswerFileState,
    chunkBytes: z.number().int(),
  })
  .register(schemas, { id: "AnswerFileStarted" });

export const AnswerFileStatusResult = z
  .object({
    file: AnswerFileState,
    quota: AnswerFileQuota,
  })
  .register(schemas, { id: "AnswerFileStatusResult" });

export const AnswerFileChunkResult = z
  .object({
    received: z.number().int(),
  })
  .register(schemas, { id: "AnswerFileChunkResult" });

export const AnswerMediaSaveBody = z
  .object({
    media: z.array(AnswerMedia).max(ANSWER_MEDIA_LIMITS.maxMedia, "tooManyMedia"),
  })
  .strict()
  .register(schemas, { id: "AnswerMediaSaveBody" });

export const AnswerMediaLinkBody = z
  .object({
    url: z.string().trim().min(1).max(ANSWER_MEDIA_LIMITS.urlMax * 2),
  })
  .strict()
  .register(schemas, { id: "AnswerMediaLinkBody" });

export const AnswerFilePackBuyBody = z
  .object({
    packId: z.string().trim().min(1).max(20),
  })
  .strict()
  .register(schemas, { id: "AnswerFilePackBuyBody" });

export const AnswerFilePackPurchase = z
  .object({
    purchase: z.object({
      id: uuid,
      number: z.number().int(),
      minutes: z.number().int(),
      amount: z.number().int(),
      amountLabel: z.string(),
      title: z.string(),
      note: z.string(),
      paidToast: z.string(),
    }),
    kaspi: z
      .object({
        defaultPhone: z.string(),
        current: KaspiInvoice.nullable(),
      })
      .nullable(),
  })
  .register(schemas, { id: "AnswerFilePackPurchase" });

export const AnswerFilePackKaspiStatus = z
  .object({
    invoice: KaspiInvoice,
    quota: AnswerFileQuota,
  })
  .register(schemas, { id: "AnswerFilePackKaspiStatus" });

const BookParams = z.object({ bookId: uuid });
const QuestionParams = z.object({ bookId: uuid, questionId: uuid });
const FileParams = z.object({ bookId: uuid, fileId: uuid });
const PackPurchaseParams = z.object({ bookId: uuid, purchaseId: uuid });
const PackInvoiceParams = z.object({ bookId: uuid, purchaseId: uuid, invoiceId: uuid });

export const answerFilesRoutes = {
  answerMediaGet: route({
    method: "GET",
    path: "/api/v1/books/{bookId}/questions/{questionId}/media",
    auth: "user",
    tag: "answer-files",
    summary: "Свои видео, аудио и ссылки по QR для ответа: карточки, QR SVG, квота минут, пакеты, подписи и лимиты",
    params: QuestionParams,
    response: AnswerMediaState,
  }),
  answerMediaSave: route({
    method: "PUT",
    path: "/api/v1/books/{bookId}/questions/{questionId}/media",
    auth: "user",
    tag: "answer-files",
    summary: "Сохранить список QR-медиа ответа (вид, подпись, место в тексте, добавленный файл или удаление карточки)",
    params: QuestionParams,
    body: AnswerMediaSaveBody,
    response: AnswerMediaState,
  }),
  answerMediaAddLink: route({
    method: "POST",
    path: "/api/v1/books/{bookId}/questions/{questionId}/media/link",
    auth: "user",
    tag: "answer-files",
    summary: "Добавить ссылку (YouTube, музыка, др.) по QR в ответ: разбор URL и название YouTube (oEmbed) на сервере",
    params: QuestionParams,
    body: AnswerMediaLinkBody,
    response: AnswerMediaState,
  }),
  answerFileStart: route({
    method: "POST",
    path: "/api/v1/books/{bookId}/files",
    auth: "user",
    tag: "answer-files",
    summary: "Начать загрузку своего видео или аудио: проверка типа, размера, лимита минут и резервирование исходника",
    params: BookParams,
    body: AnswerFileStartBody,
    response: AnswerFileStarted,
  }),
  answerFileStatus: route({
    method: "GET",
    path: "/api/v1/books/{bookId}/files/{fileId}",
    auth: "user",
    tag: "answer-files",
    summary: "Состояние своего файла (опрос во время обработки или докачки) и актуальная квота минут книги",
    params: FileParams,
    response: AnswerFileStatusResult,
  }),
  answerFileChunk: route({
    method: "PUT",
    path: "/api/v1/books/{bookId}/files/{fileId}/chunk",
    auth: "user",
    tag: "answer-files",
    summary: "Загрузить кусок исходного файла по смещению ?offset= (multipart, поле chunk)",
    params: FileParams,
    query: z.object({ offset: z.coerce.number().int().min(0) }),
    files: { field: "chunk" },
    response: AnswerFileChunkResult,
  }),
  answerFileFinish: route({
    method: "POST",
    path: "/api/v1/books/{bookId}/files/{fileId}/finish",
    auth: "user",
    tag: "answer-files",
    summary: "Завершить загрузку файла и поставить его в очередь обработки (ffmpeg)",
    params: FileParams,
    response: AnswerFileStatusResult,
  }),
  answerFileDelete: route({
    method: "DELETE",
    path: "/api/v1/books/{bookId}/files/{fileId}",
    auth: "user",
    tag: "answer-files",
    summary: "Удалить свой видео/аудио файл (или отменить незавершённую загрузку)",
    params: FileParams,
    response: Ok,
  }),
  answerFilePackBuy: route({
    method: "POST",
    path: "/api/v1/books/{bookId}/files/packs",
    auth: "user",
    tag: "answer-files",
    summary: "Оформить покупку пакета дополнительных минут для книги (цены каталога + данные Kaspi Pay)",
    params: BookParams,
    body: AnswerFilePackBuyBody,
    response: AnswerFilePackPurchase,
  }),
  answerFilePackKaspi: route({
    method: "POST",
    path: "/api/v1/books/{bookId}/files/packs/{purchaseId}/kaspi",
    auth: "user",
    tag: "answer-files",
    summary: "Выставить счёт Kaspi Pay или QR для оплаты пакета минут",
    params: PackPurchaseParams,
    body: KaspiPayBody,
    response: KaspiInvoiceResult,
  }),
  answerFilePackKaspiStatus: route({
    method: "GET",
    path: "/api/v1/books/{bookId}/files/packs/{purchaseId}/kaspi/{invoiceId}",
    auth: "user",
    tag: "answer-files",
    summary: "Проверить статус оплаты счёта Kaspi за пакет минут (и получить обновлённую квоту)",
    params: PackInvoiceParams,
    response: AnswerFilePackKaspiStatus,
  }),
} as const satisfies Record<string, RouteDef>;
