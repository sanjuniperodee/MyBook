import "server-only";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { connectionReady, type AiConnection } from "../domain";
import type { MediaPart, MediaRecognition } from "../application/SellerModel";
import { askClaudeMedia } from "./claude";
import { officeText } from "./documents";

/**
 * Распознавание вложений клиента для AI-продажника — отдельный сервис поверх подключений «Интеграций»:
 * - голосовые → расшифровка (transcribe): Whisper и gpt-4o-*-transcribe через /audio/transcriptions (OpenAI, Groq,
 *   свой сервер) или аудио в чате модели (OpenRouter → Gemini); подсказка — русский и казахский, бывает вперемешку;
 * - фото и скриншоты → Claude Vision (или vision-модель другого провайдера): картинка проверяется декодированием,
 *   метаданные (EXIF, геометка) снимаются, длинный скриншот режется на полосы — мелкий текст остаётся читаемым;
 * - PDF → Claude (документ целиком: текст, таблицы, сканы — модель читает страницы как картинки), не больше
 *   PDF_MAX_PAGES страниц;
 * - DOCX, XLSX, текст → извлекается на сервере, без внешних сервисов.
 * Видео не разбирается.
 */

/** Ответ API, по которому ясно: эта модель/провайдер вложения такого вида не принимает (а не временный сбой). */
const UNSUPPORTED_STATUS = new Set([400, 404, 415, 422]);
/** Временные сбои API — одна повторная попытка после паузы. */
const RETRY_STATUS = new Set([429, 500, 502, 503, 504, 529]);
/** Сколько страниц PDF отправляется модели (остальные отбрасываются) и сколько пикселей у картинки максимум. */
export const PDF_MAX_PAGES = 10;
const IMAGE_MAX_PIXELS = 40_000_000;
/** Длинная сторона, до которой Claude сам уменьшает картинку: полоса скриншота — не выше, чтобы мелкий текст не пропал. */
const TILE = 1568;
const MAX_TILES = 3;
/** Сколько знаков текста документа передаётся дальше. */
export const DOCUMENT_MAX_CHARS = 6000;

/** Подсказка распознаванию речи: язык и словарь компании (Whisper и gpt-4o-transcribe принимают prompt). */
export const TRANSCRIBE_HINT = "Голосовое сообщение клиента. Русский и казахский язык, бывает вперемешку. Персональная книга в подарок, печатная или электронная версия, Kaspi, рассрочка.";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch с одной повторной попыткой при временном сбое (429/5xx) — и в пределах таймаута запроса. */
async function fetchRetry(url: string, init: RequestInit, timeoutMs: number): Promise<Response | null> {
  const until = Date.now() + timeoutMs;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(Math.max(1000, until - Date.now())) }).catch(() => null);
    if (res && RETRY_STATUS.has(res.status) && attempt === 0 && until - Date.now() > 4000) {
      await sleep(1000);
      continue;
    }
    return res;
  }
}

/** Ответ API с ошибкой → понятная причина: нет денег на балансе, модель не принимает такие файлы, временный сбой. */
function failure(status: number, body: string): MediaRecognition | null {
  if (status === 402) return { unsupported: true, reason: /audio/i.test(body) ? "на балансе OpenRouter нет денег — для голосовых нужно от $0.50 (бесплатные модели аудио не принимают)" : "на балансе провайдера нет денег" };
  if (status === 401 || status === 403) return { unsupported: true, reason: "провайдер не принял ключ или модель недоступна" };
  return UNSUPPORTED_STATUS.has(status) ? { unsupported: true, reason: "модель не принимает такие вложения" } : null;
}

/** Модель расшифровки: своя (whisper / *transcribe), иначе по провайдеру — OpenAI gpt-4o-mini-transcribe, Groq Whisper. */
export function transcribeModel(c: AiConnection): string | null {
  if (/whisper|transcribe/i.test(c.model)) return c.model;
  if (c.provider === "openai") return "gpt-4o-mini-transcribe";
  if (c.provider === "groq") return "whisper-large-v3";
  return null;
}

/** Расшифровка: /audio/transcriptions (multipart) — Whisper, gpt-4o-transcribe и совместимые серверы. */
async function transcribeFile(c: AiConnection, model: string, part: MediaPart, timeoutMs: number): Promise<MediaRecognition | null> {
  const form = new FormData();
  form.set("model", model);
  form.set("response_format", "json");
  // Язык не задаём: клиенты говорят по-русски и по-казахски, часто вперемешку — автоопределение плюс подсказка.
  form.set("prompt", TRANSCRIBE_HINT);
  form.set("file", new Blob([Buffer.from(part.data, "base64")], { type: part.mime.split(";")[0] || "audio/ogg" }), `voice.${audioFormat(part.mime)}`);
  const res = await fetchRetry(`${c.baseUrl}/audio/transcriptions`, { method: "POST", headers: c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}, body: form }, timeoutMs);
  if (!res) return null;
  if (!res.ok) return failure(res.status, await res.text().catch(() => ""));
  const json = (await res.json().catch(() => null)) as { text?: string } | null;
  const text = json?.text?.trim();
  return text ? { text } : null;
}

/** Формат аудио для input_audio: голосовые WhatsApp — «audio/ogg; codecs=opus» → ogg. */
export function audioFormat(mime: string): string {
  const m = mime.toLowerCase();
  if (/ogg|opus/.test(m)) return "ogg";
  if (/mpeg|mp3/.test(m)) return "mp3";
  if (/wav/.test(m)) return "wav";
  if (/mp4|m4a|aac/.test(m)) return "m4a";
  if (/webm/.test(m)) return "webm";
  if (/flac/.test(m)) return "flac";
  if (/amr/.test(m)) return "amr";
  return "ogg";
}

/**
 * Картинка для модели: декодируется (битый или подменённый файл — отказ), поворачивается по EXIF, метаданные
 * снимаются (перекодирование в JPEG). Длинный скриншот (переписка, чек) режется на полосы не выше TILE — иначе модель
 * уменьшит его целиком и мелкий текст станет нечитаемым.
 */
export async function prepareImage(data: Buffer): Promise<{ parts: MediaPart[] } | { unsupported: true; reason: string; bad: true }> {
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(data, { limitInputPixels: IMAGE_MAX_PIXELS }).metadata();
  } catch {
    return { unsupported: true, reason: "файл не открылся как картинка", bad: true };
  }
  if (!meta.width || !meta.height) return { unsupported: true, reason: "файл не открылся как картинка", bad: true };
  const rotated = meta.orientation && meta.orientation >= 5;
  const w = rotated ? meta.height : meta.width;
  try {
    const base = await sharp(data, { limitInputPixels: IMAGE_MAX_PIXELS }).rotate().resize({ width: Math.min(w, TILE), withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
    const height = base.info.height;
    const tiles = height > TILE * 1.2 ? Math.min(MAX_TILES, Math.ceil(height / TILE)) : 1;
    const step = Math.ceil(height / tiles);
    const parts: MediaPart[] = [];
    for (let i = 0; i < tiles; i++) {
      const top = i * step;
      const jpeg = await sharp(base.data)
        .extract({ left: 0, top, width: base.info.width, height: Math.min(step, height - top) })
        .resize({ width: TILE, height: TILE, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      parts.push({ kind: "image", data: jpeg.toString("base64"), mime: "image/jpeg" });
    }
    return { parts };
  } catch {
    return { unsupported: true, reason: "картинку не удалось подготовить", bad: true };
  }
}

/** PDF для модели: открывается (битый или зашифрованный — отказ), больше PDF_MAX_PAGES страниц — только первые. */
export async function preparePdf(data: Buffer): Promise<{ data: string; pages: number; total: number } | { unsupported: true; reason: string; bad: true }> {
  let doc: PDFDocument;
  let total: number;
  try {
    // pdf-lib снисходителен к мусору: битый файл может «открыться» без дерева страниц — тогда падает подсчёт страниц.
    doc = await PDFDocument.load(data, { updateMetadata: false });
    total = doc.getPageCount();
  } catch {
    return { unsupported: true, reason: "PDF не открылся (повреждён или защищён паролем)", bad: true };
  }
  if (!total) return { unsupported: true, reason: "в PDF нет страниц", bad: true };
  if (total <= PDF_MAX_PAGES) return { data: data.toString("base64"), pages: total, total };
  try {
    const cut = await PDFDocument.create();
    for (const page of await cut.copyPages(doc, Array.from({ length: PDF_MAX_PAGES }, (_, i) => i))) cut.addPage(page);
    return { data: Buffer.from(await cut.save()).toString("base64"), pages: PDF_MAX_PAGES, total };
  } catch {
    return { unsupported: true, reason: "PDF не удалось подготовить", bad: true };
  }
}

/** Запрос «распознай» к модели с OpenAI-совместимым чатом (OpenRouter, ChatGPT, свой сервер). */
async function chatMedia(c: AiConnection, system: string, parts: MediaPart[], timeoutMs: number): Promise<MediaRecognition | null> {
  const content = [
    { type: "text", text: system },
    ...parts.map((p) =>
      p.kind === "image"
        ? { type: "image_url" as const, image_url: { url: `data:${p.mime.split(";")[0] || "image/jpeg"};base64,${p.data}` } }
        : p.kind === "pdf"
          ? { type: "file" as const, file: { filename: "document.pdf", file_data: `data:application/pdf;base64,${p.data}` } }
          : { type: "input_audio" as const, input_audio: { data: p.data, format: audioFormat(p.mime) } },
    ),
  ];
  const res = await fetchRetry(
    `${c.baseUrl}/chat/completions`,
    { method: "POST", headers: { "Content-Type": "application/json", ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}) }, body: JSON.stringify({ model: c.model, messages: [{ role: "user", content }], max_tokens: 2000, temperature: 0 }) },
    timeoutMs,
  );
  if (!res) return null;
  if (!res.ok) return failure(res.status, await res.text().catch(() => ""));
  const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } } | null;
  const text = json?.choices?.[0]?.message?.content?.trim();
  return text ? { text, usage: { input: json?.usage?.prompt_tokens ?? 0, output: json?.usage?.completion_tokens ?? 0, model: c.model } } : null;
}

/**
 * Распознать вложение (голосовое → расшифровка, фото → видимый текст и описание, PDF и документ → текст и таблицы).
 * { unsupported } — модель такое не умеет или файл не разобрать (DeepSeek, нет ключа, 400 от API, битый файл);
 * null — временный сбой (таймаут, сеть) — попробуем со следующим ходом.
 */
export async function askMedia(c: AiConnection & { enabled?: boolean }, input: { system: string; parts: MediaPart[]; timeoutMs: number }): Promise<MediaRecognition | null> {
  const part = input.parts[0];
  if (!part) return { unsupported: true, reason: "нет вложения" };
  const data = Buffer.from(part.data, "base64");
  // Word, Excel и текст — на сервере: файл клиента не уходит ни к одному провайдеру.
  if (part.kind === "document") {
    const text = officeText(data, part.mime, DOCUMENT_MAX_CHARS);
    return text ? { text } : { unsupported: true, reason: "документ не разобрать (повреждён, зашифрован или пустой)", bad: true };
  }
  if (c.enabled === false || !connectionReady(c)) return { unsupported: true, reason: "не указан ключ провайдера" };
  // DeepSeek API принимает только текст.
  if (c.provider === "deepseek") return { unsupported: true, reason: "DeepSeek не понимает голосовые и фото" };
  if (part.kind === "audio") {
    // Claude аудио не принимает; Whisper и *transcribe — отдельным методом API; остальные — аудио в чате (Gemini).
    if (c.provider === "anthropic") return { unsupported: true, reason: "Claude не слушает голосовые — выберите модель для голосовых" };
    const model = transcribeModel(c);
    if (model) return transcribeFile(c, model, part, input.timeoutMs);
    return chatMedia(c, `${input.system}\n${TRANSCRIBE_HINT}`, [part], input.timeoutMs);
  }
  if (part.kind === "pdf") {
    const pdf = await preparePdf(data);
    if ("unsupported" in pdf) return pdf;
    const note = pdf.total > pdf.pages ? `\nВ документе ${pdf.total} стр., тебе даны первые ${pdf.pages}.` : "";
    const parts: MediaPart[] = [{ kind: "pdf", data: pdf.data, mime: "application/pdf" }];
    if (c.provider === "anthropic") return withPages(await askClaudeMedia(c, { ...input, system: input.system + note, parts }), pdf.pages);
    if (c.provider === "openrouter") return withPages(await chatMedia(c, input.system + note, parts, input.timeoutMs), pdf.pages);
    return { unsupported: true, reason: "PDF читает Claude (или модель OpenRouter) — подключите ключ Claude" };
  }
  const image = await prepareImage(data);
  if ("unsupported" in image) return image;
  if (c.provider === "anthropic") return askClaudeMedia(c, { ...input, parts: image.parts });
  if (/whisper|transcribe/i.test(c.model)) return { unsupported: true, reason: "Whisper расшифровывает только голосовые" };
  return chatMedia(c, input.system, image.parts, input.timeoutMs);
}

const withPages = (r: MediaRecognition | null, pages: number): MediaRecognition | null => (r && "text" in r ? { ...r, pages } : r);
