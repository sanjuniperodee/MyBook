/**
 * Входящие вложения клиента перед распознаванием: что это на самом деле (по первым байтам, а не по имени файла,
 * расширению или типу, который прислал канал), можно ли его разбирать и откуда разрешено скачивать. Чистые функции.
 */

/** Что внутри файла: голосовое, картинка, PDF, документ Word/Excel, текст; видео не разбираем; исполняемое и непонятное — отказ. */
export type MediaCategory = "audio" | "image" | "pdf" | "document" | "text" | "video" | "executable" | "unknown";

export interface SniffedMedia {
  category: MediaCategory;
  /** Фактический MIME по содержимому. */
  mime: string;
}

const ascii = (b: Uint8Array, at: number, len: number) => String.fromCharCode(...b.subarray(at, at + len));
const starts = (b: Uint8Array, sig: number[], at = 0) => b.length >= at + sig.length && sig.every((x, i) => b[at + i] === x);

/** Имена файлов внутри ZIP (локальные заголовки в начале архива): по ним — Word, Excel или просто архив. */
function zipNames(b: Uint8Array, max = 64): string[] {
  const names: string[] = [];
  let i = 0;
  while (i + 30 < b.length && names.length < max) {
    if (!starts(b, [0x50, 0x4b, 0x03, 0x04], i)) break;
    const nameLen = b[i + 26] | (b[i + 27] << 8);
    const extraLen = b[i + 28] | (b[i + 29] << 8);
    const size = (b[i + 18] | (b[i + 19] << 8) | (b[i + 20] << 16) | (b[i + 21] << 24)) >>> 0;
    names.push(ascii(b, i + 30, Math.min(nameLen, 200)));
    // Размер неизвестен (дескриптор данных после файла) — дальше не идём: для типа хватает первых имён.
    if ((b[i + 6] & 0x08) !== 0 || !size) break;
    i += 30 + nameLen + extraLen + size;
  }
  return names;
}

/** Похоже на текст: UTF-8 без нулевых байтов и управляющих символов (кроме переводов строк и табуляции). */
function looksLikeText(b: Uint8Array): boolean {
  const head = b.subarray(0, 4096);
  if (!head.length) return false;
  for (const x of head) if (x === 0 || (x < 0x09) || (x > 0x0d && x < 0x20 && x !== 0x1b)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(head.length < b.length ? head.subarray(0, lastCharBoundary(head)) : head);
    return true;
  } catch {
    return false;
  }
}
/** Граница последнего целого символа UTF-8 в куске (чтобы обрезка посреди буквы не считалась «не текстом»). */
function lastCharBoundary(b: Uint8Array): number {
  let i = b.length;
  while (i > 0 && i > b.length - 4 && (b[i - 1] & 0xc0) === 0x80) i--;
  return i > 0 && b[i - 1] >= 0xc0 ? i - 1 : b.length;
}

/** Тип по содержимому (сигнатуры форматов). declaredAudio — канал прислал голосовое: MP4/WebM тогда — аудио, а не видео. */
export function sniffMedia(b: Uint8Array, declaredAudio = false): SniffedMedia {
  if (b.length < 4) return { category: "unknown", mime: "application/octet-stream" };
  // «#!AMR» — голосовое AMR, а не скрипт: до проверки исполняемых.
  if (ascii(b, 0, 5) === "#!AMR") return { category: "audio", mime: "audio/amr" };
  if (starts(b, [0x4d, 0x5a]) || starts(b, [0x7f, 0x45, 0x4c, 0x46]) || starts(b, [0xcf, 0xfa, 0xed, 0xfe]) || starts(b, [0xca, 0xfe, 0xba, 0xbe]) || starts(b, [0x23, 0x21])) return { category: "executable", mime: "application/octet-stream" };
  if (ascii(b, 0, 4) === "OggS") return { category: "audio", mime: "audio/ogg" };
  if (ascii(b, 0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0)) return { category: "audio", mime: "audio/mpeg" };
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WAVE") return { category: "audio", mime: "audio/wav" };
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return { category: "image", mime: "image/webp" };
  if (ascii(b, 0, 4) === "fLaC") return { category: "audio", mime: "audio/flac" };
  if (starts(b, [0xff, 0xd8, 0xff])) return { category: "image", mime: "image/jpeg" };
  if (starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { category: "image", mime: "image/png" };
  if (ascii(b, 0, 4) === "GIF8") return { category: "image", mime: "image/gif" };
  if (ascii(b, 0, 5) === "%PDF-") return { category: "pdf", mime: "application/pdf" };
  if (ascii(b, 4, 4) === "ftyp") {
    const brand = ascii(b, 8, 4);
    if (/^(heic|heix|hevc|heim|heis|mif1|msf1|avif)$/.test(brand)) return { category: "image", mime: brand === "avif" ? "image/avif" : "image/heic" };
    if (/^M4A |^M4B /.test(brand) || declaredAudio) return { category: "audio", mime: "audio/mp4" };
    return { category: "video", mime: "video/mp4" };
  }
  if (starts(b, [0x1a, 0x45, 0xdf, 0xa3])) return declaredAudio ? { category: "audio", mime: "audio/webm" } : { category: "video", mime: "video/webm" };
  if (starts(b, [0x50, 0x4b, 0x03, 0x04])) {
    const names = zipNames(b);
    if (names.some((n) => n.startsWith("word/"))) return { category: "document", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
    if (names.some((n) => n.startsWith("xl/"))) return { category: "document", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
    if (names.includes("[Content_Types].xml")) {
      // Office пишет [Content_Types].xml первым, а папки — дальше в архиве: без дескрипторов они видны выше; иначе — по слову в заголовке.
      const head = new TextDecoder("latin1").decode(b.subarray(0, Math.min(b.length, 65_536)));
      if (head.includes("word/")) return { category: "document", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
      if (head.includes("xl/")) return { category: "document", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
    }
    return { category: "unknown", mime: "application/zip" };
  }
  if (looksLikeText(b)) return { category: "text", mime: "text/plain" };
  return { category: "unknown", mime: "application/octet-stream" };
}

/** Длительность голосового OGG (Opus/Vorbis) в секундах — по позиции последней страницы; null — не OGG или не разобрать. */
export function oggDurationSec(b: Uint8Array): number | null {
  if (ascii(b, 0, 4) !== "OggS") return null;
  const opus = ascii(b, 28, 8) === "OpusHead";
  const rate = opus ? 48_000 : (b[40] | (b[41] << 8) | (b[42] << 16) | (b[43] << 24)) >>> 0 || 48_000;
  for (let i = b.length - 14; i >= 0; i--) {
    if (b[i] !== 0x4f || ascii(b, i, 4) !== "OggS") continue;
    let granule = 0;
    for (let k = 7; k >= 0; k--) granule = granule * 256 + b[i + 6 + k];
    // У Opus в начале — пропуск преднабора (pre-skip), он мал; для лимита длительности не важен.
    return granule > 0 && Number.isFinite(granule) ? granule / rate : null;
  }
  return null;
}

/** Хосты, с которых CRM вправе скачать вложение по ссылке канала (Wazzup отдаёт файлы со своих серверов). */
export const MEDIA_HOSTS = ["wazzup24.com", "wazzup24.ru"];

/**
 * Ссылку на вложение от канала можно скачивать сервером: только https, имя хоста (не IP и не localhost), из списка
 * разрешённых (с поддоменами) — иначе запрос по присланной ссылке ушёл бы во внутреннюю сеть (SSRF).
 */
export function mediaUrlAllowed(raw: string | null | undefined, hosts: readonly string[] = MEDIA_HOSTS): boolean {
  if (!raw) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || /^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return false;
  if (url.port && url.port !== "443") return false;
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}
