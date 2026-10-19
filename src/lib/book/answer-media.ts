/**
 * Видео и музыка в ответе: ссылка (чаще всего YouTube) печатается в книге QR-кодом с подписью — карточкой
 * «код + что это + как открыть». Наводишь камеру телефона — открывается пожелание близких, любимая песня, кюй.
 *
 * Модуль общий для редактора, оценки объёма, HTML-страниц и PDF: ссылка приводится к одному виду, QR-код рисуется
 * простыми фигурами (Drawing из interior-art) — в превью и в файле для типографии он один и тот же, векторный.
 * Место в тексте — как у фото в ответе (anchor: -1 — перед текстом, n — после абзаца n, null — в конце).
 */
import QRCode from "qrcode";
import type { AnswerMedia } from "@/shared/infrastructure/db/schema";
import { n } from "./covers/svg-kit";
import type { Drawing, Shape } from "./interior-art";
import { MEDIA_CARD } from "./typesetting";

export type { AnswerMedia };
export type MediaKind = AnswerMedia["kind"];

/** Сколько QR-кодов можно поставить в один ответ. */
export const MAX_MEDIA = 8;
/** Подпись в книге: две строки карточки. */
export const MEDIA_TITLE_MAX = 90;
/** Ссылка длиннее — слишком плотный код для печати. */
export const MEDIA_URL_MAX = 600;

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);
const YOUTUBE_ID = /^[\w-]{11}$/;

/** Ссылка из поля ввода: добавляем https://, если его забыли («youtu.be/…», «www.youtube.com/…»). */
function toUrl(raw: string): URL | null {
  const s = raw.trim();
  if (!s || s.length > MEDIA_URL_MAX * 2 || /\s/.test(s)) return null;
  try {
    const url = new URL(/^[a-z][\w+.-]*:\/\//i.test(s) ? s : `https://${s}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    // Хост без точки («hello») — не ссылка, а опечатка.
    if (!url.hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}

/** Отметка времени YouTube («t=90», «t=1m30s») → секунды. */
function startSeconds(t: string | null): number | null {
  if (!t) return null;
  if (/^\d+s?$/.test(t)) return parseInt(t, 10) || null;
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || !m[0]) return null;
  return (parseInt(m[1] ?? "0", 10) * 3600 + parseInt(m[2] ?? "0", 10) * 60 + parseInt(m[3] ?? "0", 10)) || null;
}

/** id ролика YouTube из любой его ссылки: watch?v=, youtu.be/, shorts/, live/, embed/; иначе null. */
export function youtubeId(raw: string): string | null {
  const url = toUrl(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (YOUTUBE_HOSTS.has(host)) {
    const [, first, second] = url.pathname.split("/");
    id = first === "watch" ? url.searchParams.get("v") : ["shorts", "live", "embed", "v"].includes(first ?? "") ? (second ?? null) : null;
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

export interface ParsedMediaUrl {
  /** Ссылка для QR-кода: у YouTube — короткая youtu.be/… (код реже и крупнее, его легче считать с бумаги). */
  url: string;
  /** Ролик YouTube — для обложки ролика в редакторе и названия через oEmbed. */
  youtubeId: string | null;
  /** Откуда ссылка: подпись на карточке («YouTube», «Instagram»…). */
  source: string;
}

/**
 * Разбор ссылки из редактора. YouTube приводится к короткому виду с сохранением отметки времени и плейлиста;
 * YouTube Music остаётся ссылкой на YouTube Music (там слушают, а не смотрят); остальные ссылки — как есть.
 * null — это не ссылка.
 */
export function parseMediaUrl(raw: string): ParsedMediaUrl | null {
  const url = toUrl(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  const id = youtubeId(raw);
  if (id) {
    const list = url.searchParams.get("list");
    const start = startSeconds(url.searchParams.get("t") ?? url.searchParams.get("start"));
    if (host === "music.youtube.com") {
      const q = new URLSearchParams({ v: id });
      if (list) q.set("list", list);
      return { url: `https://music.youtube.com/watch?${q}`, youtubeId: id, source: "YouTube Music" };
    }
    const q = new URLSearchParams();
    if (list) q.set("list", list);
    if (start) q.set("t", String(start));
    const tail = q.size ? `?${q}` : "";
    return { url: `https://youtu.be/${id}${tail}`, youtubeId: id, source: "YouTube" };
  }
  const href = url.toString();
  if (href.length > MEDIA_URL_MAX) return null;
  return { url: href, youtubeId: null, source: mediaSource(href) };
}

const SOURCES: [RegExp, string][] = [
  [/(^|\.)music\.youtube\.com$/, "YouTube Music"],
  [/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/, "YouTube"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)(vk\.com|vkvideo\.ru)$/, "VK"],
  [/(^|\.)rutube\.ru$/, "Rutube"],
  [/(^|\.)spotify\.com$/, "Spotify"],
  [/(^|\.)music\.apple\.com$/, "Apple Music"],
  [/(^|\.)music\.yandex\.(ru|kz|com)$/, "Yandex Music"],
  [/(^|\.)soundcloud\.com$/, "SoundCloud"],
  [/(^|\.)(drive|docs)\.google\.com$/, "Google Drive"],
];

/** Название площадки по ссылке; незнакомая — её домен без www. */
export function mediaSource(href: string): string {
  const url = toUrl(href);
  if (!url) return "";
  const host = url.hostname.toLowerCase();
  return SOURCES.find(([re]) => re.test(host))?.[1] ?? host.replace(/^www\./, "");
}

/** Обложка ролика YouTube для карточки в редакторе (в печать не идёт). */
export const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

/** Список из базы или запроса в рабочем виде: без битых записей и дублей id, не длиннее MAX_MEDIA. */
export function normalizeMedia(list: readonly Partial<AnswerMedia>[] | null | undefined): AnswerMedia[] {
  const seen = new Set<string>();
  const out: AnswerMedia[] = [];
  for (const m of list ?? []) {
    if (!m || typeof m.id !== "string" || !m.id || seen.has(m.id) || typeof m.url !== "string") continue;
    const parsed = parseMediaUrl(m.url);
    if (!parsed) continue;
    seen.add(m.id);
    out.push({
      id: m.id,
      kind: m.kind === "music" ? "music" : "video",
      url: parsed.url,
      title: (typeof m.title === "string" ? m.title : "").replace(/\s+/g, " ").trim().slice(0, MEDIA_TITLE_MAX),
      anchor: typeof m.anchor === "number" && Number.isFinite(m.anchor) ? Math.max(-1, Math.round(m.anchor)) : null,
    });
    if (out.length === MAX_MEDIA) break;
  }
  return out;
}

/** Карточки по местам в тексте — те же ключи, что у фото (layoutInline): −1, номер абзаца, Infinity — в конце. */
export function layoutMedia<T extends Pick<AnswerMedia, "anchor">>(media: readonly T[], paragraphCount: number): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const m of media) {
    const a = m.anchor === null || m.anchor >= paragraphCount - 1 ? Number.POSITIVE_INFINITY : Math.max(-1, m.anchor);
    out.set(a, [...(out.get(a) ?? []), m]);
  }
  return out;
}

// ─── карточка в книге ───────────────────────────────────────────────────────

/**
 * Геометрия карточки, pt: сторона QR-кода (вместе с белым полем вокруг), поля карточки, промежуток между кодом
 * и текстом, ширина колонки текста и внешняя высота. Высота не зависит от текста — подпись не длиннее двух строк,
 * поэтому оценка объёма и доводка вёрстки знают её заранее.
 */
export function mediaCardBox(textWidthPt: number, scale: number) {
  const qr = MEDIA_CARD.qr * scale;
  const pad = MEDIA_CARD.pad * scale;
  const gap = MEDIA_CARD.gap * scale;
  const border = MEDIA_CARD.border;
  return {
    qr,
    pad,
    gap,
    border,
    radius: MEDIA_CARD.radius * scale,
    width: textWidthPt,
    textWidth: textWidthPt - qr - gap - pad * 2 - border * 2,
    height: qr + pad * 2 + border * 2,
  };
}

/** Цвет модулей кода: чернила оформления, если они достаточно тёмные для камеры, иначе почти чёрный. */
export function qrInk(ink: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(ink.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return Number.isFinite(lum) && lum <= 0.22 ? ink : "#141414";
}

/** Белое поле вокруг кода в модулях: меньше стандартных четырёх — код стоит на белой карточке с полями. */
const QUIET = 2;

/**
 * QR-код ссылки как рисунок size × size pt: модули ряда склеены в полосы одного контура (меньше швов при
 * сглаживании), полосы чуть заходят друг на друга по вертикали. Короткие ссылки — с уровнем коррекции M,
 * длинные — L, чтобы модули не мельчали.
 */
export function qrDrawing(url: string, size: number, color: string): Drawing {
  const qr = QRCode.create(url, { errorCorrectionLevel: url.length > 120 ? "L" : "M" });
  const { size: count, data } = qr.modules;
  const unit = size / (count + QUIET * 2);
  let d = "";
  for (let y = 0; y < count; y++) {
    let x = 0;
    while (x < count) {
      if (!data[y * count + x]) {
        x++;
        continue;
      }
      const from = x;
      while (x < count && data[y * count + x]) x++;
      d += `M${from + QUIET},${y + QUIET}h${x - from}v1.04h${from - x}z`;
    }
  }
  const shapes: Shape[] = [
    { kind: "rect", x: 0, y: 0, w: size, h: size, fill: "#FFFFFF" },
    { kind: "path", d, fill: color, transform: `scale(${unit.toFixed(5)})` },
  ];
  return { w: size, h: size, shapes };
}

/** Значок вида рядом с подписью «Видео» / «Музыка»: круг с треугольником «play» или нота, size pt. */
export function mediaIcon(kind: MediaKind, size: number, color: string): Drawing {
  const s = (v: number) => n(v * size);
  if (kind === "video")
    return {
      w: size,
      h: size,
      shapes: [
        { kind: "circle", cx: size / 2, cy: size / 2, r: size / 2, fill: color },
        { kind: "path", d: `M${s(0.4)},${s(0.29)} L${s(0.73)},${s(0.5)} L${s(0.4)},${s(0.71)} Z`, fill: "#FFFFFF" },
      ],
    };
  return {
    w: size,
    h: size,
    shapes: [
      { kind: "circle", cx: size * 0.33, cy: size * 0.78, r: size * 0.19, fill: color },
      { kind: "rect", x: size * 0.45, y: size * 0.06, w: size * 0.09, h: size * 0.72, fill: color },
      { kind: "path", d: `M${s(0.54)},${s(0.06)} Q${s(0.98)},${s(0.2)} ${s(0.88)},${s(0.55)} Q${s(0.82)},${s(0.3)} ${s(0.54)},${s(0.32)} Z`, fill: color },
    ],
  };
}
