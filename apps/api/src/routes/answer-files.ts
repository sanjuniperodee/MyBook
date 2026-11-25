/**
 * Свои видео, аудио и ссылки по QR к ответам книги в API v1:
 * тонкий адаптер над модулем authoring (answerFiles / answerFilesWorker), ordering.kaspi и словарями сайта.
 * Все подписи, лимиты, статусы, квота минут, цены пакетов и векторные QR-коды считаются на сервере.
 */
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { AnswerFileQuota, AnswerFileState, AnswerMediaEntry, AnswerMediaLabels, AnswerMediaLimits, AnswerMediaState } from "@mybook/contracts";
import { formatPrice, getMediaPack } from "@/config/site";
import { isLocale } from "@/i18n/config";
import { messagesFor, type Messages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import {
  AUDIO_EXTENSIONS,
  FILE_CHUNK_BYTES,
  formatDuration,
  MAX_FILES_PER_BOOK,
  MAX_SECONDS,
  MAX_SOURCE_BYTES,
  VIDEO_EXTENSIONS,
  type FileQuota,
} from "@/lib/book/answer-files";
import { MAX_MEDIA, MEDIA_TITLE_MAX, MEDIA_URL_MAX, mediaSource, normalizeMedia, parseMediaUrl, qrDrawing, youtubeId, youtubeThumb } from "@/lib/book/answer-media";
import { splitParagraphs } from "@/lib/book/inline-photo";
import { isBookEditableBy, type BookRow, type BookViewer } from "@/modules/authoring";
import { apiBook, HttpError } from "@/server/api";
import {
  appendChunk,
  bookFileQuota,
  createMediaPurchase,
  fileView,
  findBookFile,
  findMediaPurchase,
  finishUpload,
  listBookFiles,
  mediaPackOffers,
  removeFile,
  startUpload,
} from "@/server/answerFiles";
import { kickAnswerFiles } from "@/server/answerFilesWorker";
import { ensureCatalog } from "@/server/catalog";
import { container } from "@/server/container";
import { invoiceView, kaspiPaymentProps } from "@/server/kaspi-view";
import { kaspiInvoice } from "@/server/order-view";
import { rateLimit } from "@/server/rateLimit";
import type { AnswerFileRow, AnswerMedia, User } from "@/shared/infrastructure/db/schema";
import type { Handlers } from "../app";

/** Площадки, где ссылку скорее слушают, чем смотрят — как в MediaStrip.tsx сайта. */
const MUSIC_SOURCES = new Set(["YouTube Music", "Spotify", "Apple Music", "Yandex Music", "SoundCloud"]);
const POLL_INTERVAL_MS = 5000;
const KASPI_POLL_INTERVAL_MS = 4000;
const MAX_UPLOAD_RETRIES = 6;

async function resolveLocale(user: User | null) {
  if (user?.locale && isLocale(user.locale)) return user.locale;
  return getLocale();
}

/** Векторный QR-код SVG — тот же рисунок qrDrawing, что печатается в книге и рисуется на сайте. */
function qrSvgOf(url: string): string {
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

function toQuota(q: FileQuota, m: Messages): z.output<typeof AnswerFileQuota> {
  const t = m.editor.media.upload;
  const full = q.leftSec <= 0 || q.files >= q.maxFiles;
  const statusText = q.files >= q.maxFiles ? t.filesFull(q.maxFiles) : q.leftSec <= 0 ? t.full(q.minutes) : t.left(String(Math.floor(q.leftSec / 60)), q.minutes);
  return { ...q, full, statusText };
}

function toFileState(row: AnswerFileRow, m: Messages): z.output<typeof AnswerFileState> {
  const v = fileView(row);
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

function goneFileState(fileId: string, media: AnswerMedia, m: Messages): z.output<typeof AnswerFileState> {
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

function limitsOf(): z.output<typeof AnswerMediaLimits> {
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

function labelsOf(m: Messages, quota: FileQuota): z.output<typeof AnswerMediaLabels> {
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

function positionsOf(answer: string, m: Messages) {
  const ti = m.editor.inspector;
  const paragraphs = splitParagraphs(answer);
  const anchors: (number | null)[] = paragraphs.length ? [-1, ...paragraphs.slice(0, -1).map((_, i) => i), null] : [null];
  return anchors.map((anchor) => ({
    anchor,
    label: anchor === null ? ti.atEnd : anchor < 0 ? ti.beforeText : ti.afterParagraph(anchor + 1, paragraphs[anchor].split(/\s+/).slice(0, 5).join(" ")),
  }));
}

async function fetchYoutubeTitle(url: string): Promise<string | null> {
  const id = youtubeId(url);
  if (!id) return null;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: AbortSignal.timeout(4000) });
    const data = res.ok ? ((await res.json()) as { title?: unknown }) : null;
    const title = typeof data?.title === "string" ? data.title.replace(/\s+/g, " ").trim().slice(0, MEDIA_TITLE_MAX) : null;
    return title || null;
  } catch {
    return null;
  }
}

async function loadQuestion(bookId: string, questionId: string) {
  const rows = await container().authoring.queries.questions(bookId);
  const question = rows.find((q) => q.id === questionId);
  if (!question) throw new HttpError(404, "notFound");
  return question;
}

async function buildMediaState(book: BookRow, viewer: BookViewer, questionId: string, m: Messages): Promise<z.output<typeof AnswerMediaState>> {
  const [question, quotaRaw, files, packsRaw] = await Promise.all([loadQuestion(book.id, questionId), bookFileQuota(book.id), listBookFiles(book.id), mediaPackOffers()]);
  const kaspiOn = packsRaw.length ? await container().ordering.kaspi.available() : false;
  const filesById = new Map(files.map((f) => [f.id, f]));
  const items = normalizeMedia((question.media as AnswerMedia[] | null | undefined) ?? []);
  const media: z.output<typeof AnswerMediaEntry>[] = items.map((item) => {
    const row = item.fileId ? filesById.get(item.fileId) : undefined;
    const file = item.fileId ? (row ? toFileState(row, m) : goneFileState(item.fileId, item, m)) : null;
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
    quota: toQuota(quotaRaw, m),
    packs,
    positions: positionsOf(question.answer ?? "", m),
    limits: limitsOf(),
    labels: labelsOf(m, quotaRaw),
  };
}

async function ownedFile(req: Request, bookId: string, fileId: string, editable: boolean) {
  const { user, book } = await apiBook(req, bookId, { editable });
  const file = await findBookFile(book.id, fileId);
  if (!file) throw new HttpError(404, "fileNotFound");
  return { user, book, file };
}

async function ownedPurchase(bookId: string, purchaseId: string, userId: string) {
  const purchase = await findMediaPurchase(purchaseId);
  if (!purchase || purchase.bookId !== bookId || purchase.userId !== userId) throw new HttpError(404, "notFound");
  return purchase;
}

export const answerFileHandlers: Pick<
  Handlers,
  | "answerMediaGet"
  | "answerMediaSave"
  | "answerMediaAddLink"
  | "answerFileStart"
  | "answerFileStatus"
  | "answerFileChunk"
  | "answerFileFinish"
  | "answerFileDelete"
  | "answerFilePackBuy"
  | "answerFilePackKaspi"
  | "answerFilePackKaspiStatus"
> = {
  async answerMediaGet({ req, user, input }) {
    const { book, viewer } = await apiBook(req, input.bookId);
    const m = messagesFor(await resolveLocale(user));
    return buildMediaState(book, viewer, input.questionId, m);
  },

  async answerMediaSave({ req, user, input }) {
    const { book, viewer } = await apiBook(req, input.bookId, { editable: true });
    await container().authoring.questions.edit(book.id, viewer, input.questionId, { media: input.body.media });
    const m = messagesFor(await resolveLocale(user));
    return buildMediaState(book, viewer, input.questionId, m);
  },

  async answerMediaAddLink({ req, user, input }) {
    const { book, viewer } = await apiBook(req, input.bookId, { editable: true });
    const m = messagesFor(await resolveLocale(user));
    const t = m.editor.media;
    const parsed = parseMediaUrl(input.body.url);
    if (!parsed) return Response.json({ error: t.badUrl, code: "badUrl" }, { status: 400 });
    const question = await loadQuestion(book.id, input.questionId);
    const current = normalizeMedia((question.media as AnswerMedia[] | null | undefined) ?? []);
    if (current.length >= MAX_MEDIA) return Response.json({ error: t.limit(MAX_MEDIA), code: "tooManyMedia" }, { status: 400 });
    if (current.some((x) => x.url === parsed.url)) return Response.json({ error: t.duplicate, code: "duplicate" }, { status: 400 });
    const title = parsed.youtubeId ? ((await fetchYoutubeTitle(parsed.url)) ?? "") : "";
    const next: AnswerMedia[] = [
      ...current,
      { id: randomUUID(), kind: MUSIC_SOURCES.has(parsed.source) ? "music" : "video", url: parsed.url, title, anchor: null },
    ];
    await container().authoring.questions.edit(book.id, viewer, input.questionId, { media: next });
    return buildMediaState(book, viewer, input.questionId, m);
  },

  async answerFileStart({ req, user, input }) {
    const { book } = await apiBook(req, input.bookId, { editable: true });
    if (!(await rateLimit(`answer-file:${user!.id}`, 30, 3600_000))) throw new HttpError(429, "fileRate");
    const b = input.body;
    const row = await startUpload({ bookId: book.id, userId: user!.id, name: b.name, size: b.size, mime: b.type, declaredSec: b.durationSec });
    const m = messagesFor(await resolveLocale(user));
    return { file: toFileState(row, m), chunkBytes: FILE_CHUNK_BYTES };
  },

  async answerFileStatus({ req, user, input }) {
    const { book, file } = await ownedFile(req, input.bookId, input.fileId, false);
    const [quota, m] = await Promise.all([bookFileQuota(book.id), resolveLocale(user).then(messagesFor)]);
    return { file: toFileState(file, m), quota: toQuota(quota, m) };
  },

  async answerFileChunk({ req, input }) {
    const { file } = await ownedFile(req, input.bookId, input.fileId, true);
    const chunk = input.files[0];
    if (!chunk) throw new HttpError(400, "fileChunk");
    if (chunk.size > FILE_CHUNK_BYTES) throw new HttpError(413, "fileChunk");
    const bytes = Buffer.from(await chunk.arrayBuffer());
    return { received: await appendChunk(file, input.offset, bytes) };
  },

  async answerFileFinish({ req, user, input }) {
    const { book, file } = await ownedFile(req, input.bookId, input.fileId, true);
    const finished = await finishUpload(file);
    kickAnswerFiles();
    const [quota, m] = await Promise.all([bookFileQuota(book.id), resolveLocale(user).then(messagesFor)]);
    return { file: toFileState(finished, m), quota: toQuota(quota, m) };
  },

  async answerFileDelete({ req, input }) {
    const { file } = await ownedFile(req, input.bookId, input.fileId, true);
    await removeFile(file);
    return { ok: true };
  },

  async answerFilePackBuy({ req, user, input }) {
    const { book } = await apiBook(req, input.bookId, { editable: true });
    if (!(await rateLimit(`media-pack:${user!.id}`, 10, 10 * 60_000))) throw new HttpError(429, "kaspiRate");
    await ensureCatalog();
    const pack = getMediaPack(input.body.packId);
    if (!pack || pack.hidden || pack.price <= 0) throw new HttpError(404, "notFound");
    const purchase = await createMediaPurchase(user!.id, book.id, pack);
    const [kaspiProps, m] = await Promise.all([kaspiPaymentProps({ kind: "media_pack", id: purchase.id }, user!.phone ?? ""), resolveLocale(user).then(messagesFor)]);
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
      kaspi: kaspiProps ? { defaultPhone: kaspiProps.defaultPhone, current: kaspiProps.initial ? kaspiInvoice(kaspiProps.initial) : null } : null,
    };
  },

  async answerFilePackKaspi({ req, user, input }) {
    const { book } = await apiBook(req, input.bookId, { editable: true });
    await ownedPurchase(book.id, input.purchaseId, user!.id);
    if (!(await rateLimit(`kaspi-invoice-user:${user!.id}`, 10, 10 * 60_000))) throw new HttpError(429, "kaspiRate");
    const invoice = await container().ordering.kaspi.payMediaPack(input.purchaseId, user!.id, { method: input.body.method, phone: input.body.phone });
    return { invoice: kaspiInvoice(await invoiceView(invoice)) };
  },

  async answerFilePackKaspiStatus({ req, user, input }) {
    const { book } = await apiBook(req, input.bookId);
    await ownedPurchase(book.id, input.purchaseId, user!.id);
    const invoice = await container().ordering.kaspi.status(input.invoiceId, { userId: user!.id });
    const [quota, m] = await Promise.all([bookFileQuota(book.id), resolveLocale(user).then(messagesFor)]);
    return { invoice: kaspiInvoice(await invoiceView(invoice)), quota: toQuota(quota, m) };
  },
};
