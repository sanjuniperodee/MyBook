/**
 * Свои видео и аудио к ответам: клиент загружает файл с телефона, сервер пережимает его и отдаёт на странице /v/<токен>,
 * а в книге печатается QR-код этой страницы (та же карточка, что у ссылок, — answer-media.ts).
 *
 * Модуль общий для редактора и сервера: лимиты, какой файл принимаем, размеры кадра и параметры ffmpeg, подсчёт минут
 * книги. Лимиты — с расчётом на общий сервер: исходник до 1 ГБ лежит только до конца обработки, готовый файл — около
 * 11 МБ на минуту видео и 1 МБ на минуту аудио.
 */

/** Кусок загрузки: меньше лимита тела запроса у nginx и Next, и на мобильной сети обрыв стоит недорого. */
export const FILE_CHUNK_BYTES = 8 * 1024 * 1024;
/** Исходник с телефона: минута видео 1080p с iPhone — 60–130 МБ. */
export const MAX_SOURCE_BYTES = 1024 * 1024 * 1024;
/** Одно видео — не длиннее 10 минут, одна запись аудио — 30 минут. */
export const MAX_SECONDS = { video: 10 * 60, audio: 30 * 60 } as const;
/** Готовый файл больше этого — что-то пошло не так (битрейт ограничен, столько не выходит). */
export const MAX_OUTPUT_BYTES = 200 * 1024 * 1024;
/** Сколько своих файлов может быть в одной книге (сверх — только ссылками). */
export const MAX_FILES_PER_BOOK = 40;

/** Видео в кадре не больше 1280×720 (у вертикального — 720×1280), не чаще 30 кадров в секунду. */
export const VIDEO_BOX = { long: 1280, short: 720 } as const;
export const VIDEO_FPS = 30;
/** Битрейт видео: потолок при постоянном качестве (CRF) — ролик с телефона ужимается в 6–10 раз. */
export const VIDEO_MAXRATE_K = 1500;
export const AUDIO_BITRATE_K = 128;
/** Звук в видео. */
export const VIDEO_AUDIO_BITRATE_K = 128;

/** Короткая ссылка на страницу файла: 10 знаков base62 (~59 бит) — не подобрать и не угадать, QR-код остаётся редким. */
export const FILE_TOKEN = /^[A-Za-z0-9]{10}$/;

export type FileKind = "video" | "audio";
export type FileStatus = "uploading" | "queued" | "processing" | "ready" | "failed";
/** Коды ошибок обработки — ключи словаря editor.media.file.errors. */
export type FileError = "damaged" | "tooLong" | "quota" | "tooBig" | "server" | "abandoned";

/** Файл для редактора (ответ API /api/books/<id>/files). */
export interface AnswerFileView {
  id: string;
  token: string;
  /** Ссылка, которую кодирует QR-код. */
  url: string;
  kind: FileKind;
  status: FileStatus;
  name: string;
  durationSec: number | null;
  sourceBytes: number;
  receivedBytes: number;
  error: FileError | null;
  /** Кадр из видео для карточки в редакторе. */
  poster: string | null;
}

/** Пакет минут, который сейчас продаётся. */
export interface MediaPackOffer {
  id: string;
  minutes: number;
  price: number;
  featured: boolean;
}

const VIDEO_EXT = new Set(["mp4", "mov", "m4v", "3gp", "3g2", "webm", "mkv", "avi", "mpg", "mpeg", "mts", "m2ts", "wmv", "flv"]);
const AUDIO_EXT = new Set(["mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "amr", "flac", "wma", "aif", "aiff", "caf", "weba"]);

/** Что принимает поле выбора файла: по типам и расширениям — iOS и Android по-разному сообщают тип голосовых. */
export const FILE_ACCEPT = ["video/*", "audio/*", ...[...VIDEO_EXT, ...AUDIO_EXT].map((e) => `.${e}`)].join(",");

/** Видео или аудио по типу и имени файла; null — не медиафайл. «.webm» без типа считаем видео (запись экрана). */
export function fileKindOf(name: string, mime: string): FileKind | null {
  const type = mime.toLowerCase().split(";")[0].trim();
  const ext = name.toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1] ?? "";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("video/")) return AUDIO_EXT.has(ext) ? "audio" : "video";
  if (VIDEO_EXT.has(ext)) return "video";
  if (AUDIO_EXT.has(ext)) return "audio";
  return null;
}

/** Ссылка, которую кодирует QR-код своего файла. */
export const answerFileUrl = (appUrl: string, token: string) => `${appUrl.replace(/\/+$/, "")}/v/${token}`;

/** Токен из ссылки на свой файл (любой домен сайта); null — это не наша ссылка. */
export function answerFileToken(url: string): string | null {
  const m = url.match(/\/v\/([A-Za-z0-9]{10})(?:[?#]|$)/);
  return m ? m[1] : null;
}

/** «3:07», «1:02:05». */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

// ─── минуты книги ───────────────────────────────────────────────────────────

/** Бесплатно на книгу, пока владелец не поменял в «Ценах и тарифах». */
export const DEFAULT_FREE_MINUTES = 30;
export const MAX_FREE_MINUTES = 600;
export const MAX_PACK_MINUTES = 600;

export interface FileQuota {
  /** Минуты книги: бесплатные + оплаченные пакеты. */
  minutes: number;
  /** Занято секунд (готовые и обрабатываемые файлы). */
  usedSec: number;
  /** Осталось секунд. */
  leftSec: number;
  files: number;
  maxFiles: number;
}

export function fileQuota(input: { freeMinutes: number; paidMinutes: number; usedSec: number; files: number }): FileQuota {
  const minutes = Math.max(0, input.freeMinutes) + Math.max(0, input.paidMinutes);
  return { minutes, usedSec: input.usedSec, leftSec: Math.max(0, minutes * 60 - input.usedSec), files: input.files, maxFiles: MAX_FILES_PER_BOOK };
}

/**
 * Можно ли начать загрузку: есть место под ещё один файл и минуты. Длительность из браузера (если он её узнал) сверяется
 * сразу — длинное видео не придётся грузить зря; без неё проверка — после разбора файла на сервере.
 */
export function canUpload(q: FileQuota, kind: FileKind, declaredSec: number | null): "ok" | "files" | "quota" | "tooLong" {
  if (q.files >= q.maxFiles) return "files";
  if (declaredSec !== null && declaredSec > MAX_SECONDS[kind] + 1) return "tooLong";
  if (q.leftSec <= 0 || (declaredSec !== null && declaredSec > q.leftSec + 1)) return "quota";
  return "ok";
}

// ─── обработка ──────────────────────────────────────────────────────────────

export interface ProbeResult {
  durationSec: number;
  /** Размер кадра с учётом поворота (вертикальное видео с телефона — высота больше ширины). */
  width: number | null;
  height: number | null;
  fps: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  audioChannels: number | null;
}

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  channels?: number;
  duration?: string;
  disposition?: { attached_pic?: number };
  tags?: { rotate?: string };
  side_data_list?: { rotation?: number | string }[];
}

const rate = (r: string | undefined) => {
  const [a, b] = (r ?? "").split("/").map(Number);
  return a && b ? a / b : null;
};

/** Ответ `ffprobe -print_format json -show_format -show_streams` → то, что нужно для обработки. null — не медиафайл. */
export function parseProbe(json: unknown): ProbeResult | null {
  const data = json as { streams?: ProbeStream[]; format?: { duration?: string } } | null;
  const streams = Array.isArray(data?.streams) ? data.streams : [];
  // Обложка альбома в mp3/m4a — это «видео» из одной картинки: не считаем.
  const video = streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic && s.codec_name !== "mjpeg" && s.codec_name !== "png");
  const audio = streams.find((s) => s.codec_type === "audio");
  if (!video && !audio) return null;
  const duration = Number(data?.format?.duration ?? video?.duration ?? audio?.duration);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  let width = video?.width ?? null;
  let height = video?.height ?? null;
  const rotation = Math.abs(Number(video?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? video?.tags?.rotate ?? 0)) % 180;
  if (rotation === 90 && width && height) [width, height] = [height, width];
  return { durationSec: duration, width, height, fps: rate(video?.avg_frame_rate) ?? rate(video?.r_frame_rate), hasVideo: !!video, hasAudio: !!audio, audioChannels: audio?.channels ?? null };
}

const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);

/** Кадр после сжатия: вписан в 1280×720 (вертикальный — в 720×1280), не больше исходного, стороны чётные. */
export function targetSize(width: number, height: number): { width: number; height: number } {
  const landscape = width >= height;
  const boxW = landscape ? VIDEO_BOX.long : VIDEO_BOX.short;
  const boxH = landscape ? VIDEO_BOX.short : VIDEO_BOX.long;
  const k = Math.min(1, boxW / width, boxH / height);
  return { width: even(width * k), height: even(height * k) };
}

/**
 * Аргументы ffmpeg: видео — H.264 (CRF 26, потолок битрейта) + AAC в MP4 с быстрым стартом, аудио — AAC 128 кбит/с
 * в M4A. Потоки ограничены — рядом работают другие сайты. Поворот с телефона ffmpeg применяет сам (autorotate).
 */
export function transcodeArgs(kind: FileKind, probe: ProbeResult, input: string, output: string, threads = 2): string[] {
  const head = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-threads", String(threads), "-i", input, "-map_metadata", "-1"];
  const channels = probe.audioChannels && probe.audioChannels > 2 ? ["-ac", "2"] : [];
  if (kind === "audio" || !probe.hasVideo) return [...head, "-vn", "-map", "0:a:0", "-c:a", "aac", "-b:a", `${AUDIO_BITRATE_K}k`, ...channels, "-movflags", "+faststart", "-f", "mp4", output];
  const filters: string[] = [];
  if (probe.width && probe.height) {
    const size = targetSize(probe.width, probe.height);
    filters.push(`scale=${size.width}:${size.height}`);
  } else filters.push(`scale='min(${VIDEO_BOX.long},iw)':-2`);
  if (probe.fps && probe.fps > VIDEO_FPS + 0.5) filters.push(`fps=${VIDEO_FPS}`);
  filters.push("format=yuv420p");
  return [
    ...head,
    "-map",
    "0:v:0",
    ...(probe.hasAudio ? ["-map", "0:a:0"] : []),
    "-vf",
    filters.join(","),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "26",
    "-maxrate",
    `${VIDEO_MAXRATE_K}k`,
    "-bufsize",
    `${VIDEO_MAXRATE_K * 2}k`,
    "-profile:v",
    "high",
    "-x264-params",
    `threads=${threads}`,
    ...(probe.hasAudio ? ["-c:a", "aac", "-b:a", `${VIDEO_AUDIO_BITRATE_K}k`, ...channels] : []),
    "-movflags",
    "+faststart",
    "-f",
    "mp4",
    output,
  ];
}

/** Кадр для обложки плеера и карточки в редакторе: с первой секунды (у коротких — с середины), 640 px по ширине. */
export function posterArgs(input: string, output: string, durationSec: number): string[] {
  const at = Math.min(1, durationSec / 2).toFixed(2);
  return ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-threads", "1", "-ss", at, "-i", input, "-frames:v", "1", "-vf", "scale='min(640,iw)':-2", "-q:v", "4", output];
}
