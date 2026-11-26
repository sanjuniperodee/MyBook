/**
 * Чистая сборка представлений QR-медиа, своих видео/аудио и покупок пакетов минут для API v1:
 * единый источник для `apps/api` и `apps/backend` (NestJS) без `next/headers`, БД и `server-only`.
 */
import type { z } from "zod";
import type {
  AnswerFilePackPurchase,
  AnswerFileQuota,
  AnswerFileState,
  AnswerMediaEntry,
  AnswerMediaLabels,
  AnswerMediaLimits,
  AnswerMediaState,
} from "@mybook/contracts";
import { formatPrice } from "@/config/site";
import { isLocale, type Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import {
  answerFileUrl,
  AUDIO_EXTENSIONS,
  FILE_CHUNK_BYTES,
  formatDuration,
  MAX_FILES_PER_BOOK,
  MAX_SECONDS,
  MAX_SOURCE_BYTES,
  VIDEO_EXTENSIONS,
  type AnswerFileView,
  type FileError,
  type FileKind,
  type FileQuota,
  type FileStatus,
  type MediaPackOffer,
} from "@/lib/book/answer-files";
import { MAX_MEDIA, MEDIA_TITLE_MAX, MEDIA_URL_MAX, mediaSource, normalizeMedia, parseMediaUrl, qrDrawing, youtubeId, youtubeThumb } from "@/lib/book/answer-media";
import { splitParagraphs } from "@/lib/book/inline-photo";
import type { AnswerMedia } from "@/shared/infrastructure/db/schema";
import { isBookEditableBy, type BookViewer } from "../domain";

/** Площадки, где ссылку скорее слушают, чем смотрят — как в MediaStrip.tsx сайта. */
export const MUSIC_SOURCES = new Set(["YouTube Music", "Spotify", "Apple Music", "Yandex Music", "SoundCloud"]);
export const POLL_INTERVAL_MS = 5000;
export const KASPI_POLL_INTERVAL_MS = 4000;
export const MAX_UPLOAD_RETRIES = 6;

/** Структурный вид строки файла ответа (совместим с AnswerFileRow, без зависимости от БД). */
export interface AnswerFileRecord {
  id: string;
  token: string;
  kind: FileKind;
  status: FileStatus;
  name: string;
  durationSec: number | null;
  declaredSec: number | null;
  sourceBytes: number;
  receivedBytes: number;
  error: string | null;
  hasPoster: boolean;
  readyAt: Date | null;
}

/** Структурный вид счёта Kaspi (совместим с KaspiInvoiceView без импорта модуля ordering). */
export interface KaspiInvoiceLike {
  id: string;
  method: "invoice" | "qr";
  status: "pending" | "paid" | "failed" | "cancelled" | "expired";
  amount: number;
  phone: string | null;
  link: string | null;
  qrSvg: string | null;
  expiresAt: string | null;
  paidAt: string | null;
}

/** Структурный вид покупки пакета минут (совместим с MediaPurchase). */
export interface MediaPurchaseLike {
  id: string;
  number: number;
  minutes: number;
  amount: number;
}

/** Язык экрана медиа: сохранённый язык профиля (если поддерживается), иначе язык запроса. */
export function resolveAnswerMediaLocale(userLocale: string | null | undefined, fallback: Locale): Locale {
  if (userLocale && isLocale(userLocale)) return userLocale;
  return fallback;
}

/** Счёт Kaspi в форме контракта API v1. */
export function kaspiInvoiceDto(v: KaspiInvoiceLike) {
  return {
    id: v.id,
    method: v.method,
    status: v.status,
    amount: v.amount,
    phone: v.phone ?? null,
    link: v.link,
    qrSvg: v.qrSvg,
    expiresAt: v.expiresAt,
    paidAt: v.paidAt,
  };
}

/** Векторный QR-код SVG — тот же рисунок qrDrawing, что печатается в книге и рисуется на сайте. */
export function qrSvgOf(url: string): string {
  const d = qrDrawing(url, 100, "#141414");
  const shapes = d.shapes
    .map((s) => {
      if (s.kind === "rect") return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${s.fill}"/>`;
      if (s.kind === "path") return `<path d="${s.d}" fill="${s.fill}"${s.transform ? ` transform="${s.transform}"` : ""}/>`;
      return "";
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.w} ${d.h}">${shapes}</svg>`;
}

/** Чистый маппинг строки файла в AnswerFileView (как fileView в authoring/infrastructure/answerFiles.ts). */
export function answerFileViewOf(f: AnswerFileRecord, appUrl: string): AnswerFileView {
  return {
    id: f.id,
    token: f.token,
    url: answerFileUrl(appUrl, f.token),
    kind: f.kind,
    status: f.status,
    name: f.name,
    durationSec: f.durationSec ?? f.declaredSec,
    sourceBytes: f.sourceBytes,
    receivedBytes: f.receivedBytes,
    error: (f.error as FileError | null) ?? null,
    poster: f.hasPoster ? `/api/v/${f.token}?poster=1&v=${f.readyAt?.getTime() ?? 0}` : null,
  };
}

export function toAnswerFileQuota(q: FileQuota, m: Messages): z.output<typeof AnswerFileQuota> {
  const t = m.editor.media.upload;
  const full = q.leftSec <= 0 || q.files >= q.maxFiles;
  const statusText =
    q.files >= q.maxFiles
      ? t.filesFull(q.maxFiles)
      : q.leftSec <= 0
        ? t.full(q.minutes)
        : t.left(String(Math.floor(q.leftSec / 60)), q.minutes);
  return { ...q, full, statusText };
}

export function toAnswerFileState(v: AnswerFileView, m: Messages): z.output<typeof AnswerFileState> {
  const tf = m.editor.media.file;
  const tu = m.editor.media.upload;
  const durationLabel = v.durationSec !== null ? formatDuration(v.durationSec) : null;
  let statusLabel: string;
  let errorText: string | null = null;
  if (v.status === "ready") statusLabel = tf.ready(formatDuration(v.durationSec ?? 0));
  else if (v.status === "processing") statusLabel = tf.processing;
  else if (v.status === "queued") statusLabel = tf.queued;
  else if (v.status === "failed") {
    const base = tf.errors[v.error ?? "server"];
    statusLabel = base;
    errorText = `${base} ${tf.reupload}`;
  } else {
    const pct = v.sourceBytes > 0 ? Math.min(99, Math.floor((v.receivedBytes / v.sourceBytes) * 100)) : 0;
    statusLabel = tu.progress(pct);
  }
  const playbackUrl = v.status === "ready" ? `/api/v/${v.token}` : null;
  return {
    id: v.id,
    token: v.token,
    url: v.url,
    kind: v.kind,
    status: v.status,
    name: v.name,
    durationSec: v.durationSec,
    durationLabel,
    sourceBytes: v.sourceBytes,
    receivedBytes: v.receivedBytes,
    error: v.error,
    statusLabel,
    errorText,
    poster: v.poster,
    playbackUrl,
    downloadUrl: playbackUrl ? `${playbackUrl}?download=1` : null,
  };
}

export function goneAnswerFileState(fileId: string, media: AnswerMedia, m: Messages): z.output<typeof AnswerFileState> {
  const tf = m.editor.media.file;
  return {
    id: fileId,
    token: "",
    url: media.url,
    kind: media.kind === "video" ? "video" : "audio",
    status: "gone",
    name: "",
    durationSec: null,
    durationLabel: null,
    sourceBytes: 0,
    receivedBytes: 0,
    error: "gone",
    statusLabel: tf.errors.gone,
    errorText: `${tf.errors.gone} ${tf.reupload}`,
    poster: null,
    playbackUrl: null,
    downloadUrl: null,
  };
}

export function answerMediaLimits(): z.output<typeof AnswerMediaLimits> {
  return {
    maxMedia: MAX_MEDIA,
    titleMax: MEDIA_TITLE_MAX,
    urlMax: MEDIA_URL_MAX,
    chunkBytes: FILE_CHUNK_BYTES,
    maxSourceBytes: MAX_SOURCE_BYTES,
    maxVideoSec: MAX_SECONDS.video,
    maxAudioSec: MAX_SECONDS.audio,
    maxFilesPerBook: MAX_FILES_PER_BOOK,
    pollIntervalMs: POLL_INTERVAL_MS,
    kaspiPollIntervalMs: KASPI_POLL_INTERVAL_MS,
    maxRetries: MAX_UPLOAD_RETRIES,
    videoExtensions: [...VIDEO_EXTENSIONS],
    audioExtensions: [...AUDIO_EXTENSIONS],
  };
}

export function answerMediaLabels(m: Messages, quota: FileQuota): z.output<typeof AnswerMediaLabels> {
  const t = m.editor.media;
  const u = t.upload;
  const f = t.file;
  const k = m.common.kaspiPay;
  return {
    add: t.add,
    addTitle: t.addTitle,
    title: t.title,
    intro: t.intro,
    howTo: t.howTo,
    urlLabel: t.urlLabel,
    urlPlaceholder: t.urlPlaceholder,
    submit: t.submit,
    cancel: t.cancel,
    badUrl: t.badUrl,
    limitReached: t.limit(MAX_MEDIA),
    duplicate: t.duplicate,
    kind: t.kind,
    kinds: { video: t.kinds.video, music: t.kinds.music, audio: t.kinds.audio },
    caption: t.caption,
    captionPlaceholder: { video: t.captionPlaceholder.video, music: t.captionPlaceholder.music, audio: t.captionPlaceholder.audio },
    place: t.place,
    open: t.open,
    openFile: f.open,
    remove: t.remove,
    printNote: t.printNote,
    upload: {
      button: u.button,
      hint: u.hint(MAX_SECONDS.video / 60, MAX_SECONDS.audio / 60),
      orLink: u.orLink,
      reading: u.reading,
      progressTemplate: u.progress(0).replace("0", "{pct}"),
      keepOpen: u.keepOpen,
      retrying: u.retrying,
      stop: u.stop,
      retry: u.retry,
      notMedia: u.notMedia,
      tooBig: u.tooBig(Math.round(MAX_SOURCE_BYTES / 1024 ** 3)),
      tooLongVideo: u.tooLong(MAX_SECONDS.video / 60),
      tooLongAudio: u.tooLong(MAX_SECONDS.audio / 60),
      needMinutes: u.needMinutes(String(Math.floor(quota.leftSec / 60))),
      more: u.more,
      featured: u.featured,
      buy: u.buy,
      payUnavailable: u.payUnavailable,
      close: u.close,
      networkError: m.common.errors.network,
    },
    file: {
      queued: f.queued,
      processing: f.processing,
      wait: f.wait,
      reupload: f.reupload,
      removeConfirm: f.removeConfirm,
      removeYes: f.removeYes,
      removeNo: f.removeNo,
      gone: f.errors.gone,
    },
    kaspi: {
      title: k.title,
      phoneLabel: k.phoneLabel,
      invoiceNote: k.invoiceNote,
      sendInvoice: k.sendInvoice,
      payByQr: k.payByQr,
      sentSteps: k.sentSteps,
      scanQr: k.scanQr,
      openKaspi: k.openKaspi,
      waiting: k.waiting,
      paid: k.paid,
      failed: k.failed,
      cancelled: k.cancelled,
      expired: k.expired,
      again: k.again,
    },
  };
}

export function answerMediaPositions(answer: string, m: Messages) {
  const ti = m.editor.inspector;
  const paragraphs = splitParagraphs(answer);
  const anchors: (number | null)[] = paragraphs.length ? [-1, ...paragraphs.slice(0, -1).map((_, i) => i), null] : [null];
  return anchors.map((anchor) => ({
    anchor,
    label:
      anchor === null
        ? ti.atEnd
        : anchor < 0
          ? ti.beforeText
          : ti.afterParagraph(anchor + 1, paragraphs[anchor].split(/\s+/).slice(0, 5).join(" ")),
  }));
}

/** Название ролика YouTube через oEmbed (таймаут 4 с); при сбое — null. */
export async function fetchYoutubeOembedTitle(url: string): Promise<string | null> {
  const id = youtubeId(url);
  if (!id) return null;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, {
      signal: AbortSignal.timeout(4000),
    });
    const data = res.ok ? ((await res.json()) as { title?: unknown }) : null;
    const title = typeof data?.title === "string" ? data.title.replace(/\s+/g, " ").trim().slice(0, MEDIA_TITLE_MAX) : null;
    return title || null;
  } catch {
    return null;
  }
}

/** Полное состояние QR-медиа ответа книги (GET/PUT media, POST media/link). */
export function buildAnswerMediaState(input: {
  book: { status: string; userId: string };
  viewer: BookViewer;
  answer: string;
  rawMedia: AnswerMedia[] | null | undefined;
  quota: FileQuota;
  files: readonly AnswerFileView[];
  packsRaw: readonly MediaPackOffer[];
  kaspiOn: boolean;
  messages: Messages;
}): z.output<typeof AnswerMediaState> {
  const { book, viewer, answer, rawMedia, quota, files, packsRaw, kaspiOn, messages: m } = input;
  const filesById = new Map(files.map((f) => [f.id, f]));
  const items = normalizeMedia(rawMedia ?? []);
  const media: z.output<typeof AnswerMediaEntry>[] = items.map((item) => {
    const view = item.fileId ? filesById.get(item.fileId) : undefined;
    const file = item.fileId ? (view ? toAnswerFileState(view, m) : goneAnswerFileState(item.fileId, item, m)) : null;
    const parsed = parseMediaUrl(item.url);
    const kind = file && file.kind === "audio" && item.kind === "video" ? "audio" : item.kind;
    const thumbUrl = file?.poster ?? (parsed?.youtubeId ? youtubeThumb(parsed.youtubeId) : null);
    return {
      id: item.id,
      kind,
      url: item.url,
      fileId: item.fileId ?? null,
      title: item.title,
      anchor: item.anchor ?? null,
      source: parsed?.source || mediaSource(item.url),
      qrSvg: qrSvgOf(item.url),
      thumbUrl,
      playbackUrl: file?.playbackUrl ?? null,
      file,
    };
  });
  const tu = m.editor.media.upload;
  const packs = kaspiOn
    ? packsRaw.map((p) => ({
        id: p.id,
        minutes: p.minutes,
        price: p.price,
        featured: p.featured,
        minutesLabel: tu.packMinutes(p.minutes),
        priceLabel: formatPrice(p.price),
        perMinuteLabel: tu.perMinute(formatPrice(Math.round(p.price / p.minutes))),
      }))
    : [];
  return {
    editable: book.status === "draft" && isBookEditableBy(book.userId, viewer),
    media,
    quota: toAnswerFileQuota(quota, m),
    packs,
    positions: answerMediaPositions(answer, m),
    limits: answerMediaLimits(),
    labels: answerMediaLabels(m, quota),
  };
}

/** Представление оформленной покупки пакета минут и данных Kaspi Pay. */
export function buildAnswerFilePackPurchase(
  purchase: MediaPurchaseLike,
  kaspiProps: { defaultPhone: string; initial: KaspiInvoiceLike | null } | null,
  m: Messages,
): z.output<typeof AnswerFilePackPurchase> {
  const u = m.editor.media.upload;
  return {
    purchase: {
      id: purchase.id,
      number: purchase.number,
      minutes: purchase.minutes,
      amount: purchase.amount,
      amountLabel: formatPrice(purchase.amount),
      title: u.payTitle(purchase.minutes),
      note: u.payNote(purchase.number),
      paidToast: u.paid(purchase.minutes),
    },
    kaspi: kaspiProps
      ? {
          defaultPhone: kaspiProps.defaultPhone,
          current: kaspiProps.initial ? kaspiInvoiceDto(kaspiProps.initial) : null,
        }
      : null,
  };
}
