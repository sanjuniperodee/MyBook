import "server-only";
import { connectionReady, type AiConnection } from "../domain";
import type { MediaPart, MediaRecognition } from "../application/SellerModel";
import { askClaudeMedia } from "./claude";

/** Ответ API, по которому ясно: эта модель/провайдер вложения такого вида не принимает (а не временный сбой). */
const UNSUPPORTED_STATUS = new Set([400, 404, 415, 422]);

/** Ответ API с ошибкой → понятная причина: нет денег на балансе, модель не принимает такие файлы, временный сбой. */
function failure(status: number, body: string): MediaRecognition | null {
  if (status === 402) return { unsupported: true, reason: /audio/i.test(body) ? "на балансе OpenRouter нет денег — для голосовых нужно от $0.50 (бесплатные модели аудио не принимают)" : "на балансе провайдера нет денег" };
  if (status === 401 || status === 403) return { unsupported: true, reason: "провайдер не принял ключ или модель недоступна" };
  return UNSUPPORTED_STATUS.has(status) ? { unsupported: true, reason: "модель не принимает такие вложения" } : null;
}

/** Расшифровка Whisper: /audio/transcriptions (multipart). Фото Whisper не понимает. */
async function whisper(c: AiConnection, input: { parts: MediaPart[]; timeoutMs: number }): Promise<MediaRecognition | null> {
  const part = input.parts[0];
  if (!part || part.kind !== "audio") return { unsupported: true, reason: "Whisper расшифровывает только голосовые" };
  const form = new FormData();
  form.set("model", c.model);
  form.set("response_format", "json");
  form.set("file", new Blob([Buffer.from(part.data, "base64")], { type: part.mime.split(";")[0] || "audio/ogg" }), `voice.${audioFormat(part.mime)}`);
  const res = await fetch(`${c.baseUrl}/audio/transcriptions`, { method: "POST", headers: c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}, body: form, signal: AbortSignal.timeout(input.timeoutMs) }).catch(() => null);
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
  return "ogg";
}

/**
 * Распознать вложение (голосовое → расшифровка, фото → описание). { unsupported } — модель такое не умеет (DeepSeek, нет
 * ключа, 400 от API): в этой беседе больше не пробуем; null — временный сбой (таймаут, сеть), попробуем со следующим.
 */
export async function askMedia(c: AiConnection & { enabled?: boolean }, input: { system: string; parts: MediaPart[]; timeoutMs: number }): Promise<MediaRecognition | null> {
  if (c.enabled === false || !connectionReady(c)) return { unsupported: true, reason: "не указан ключ провайдера" };
  // DeepSeek API принимает только текст.
  if (c.provider === "deepseek") return { unsupported: true, reason: "DeepSeek не понимает голосовые и фото" };
  if (c.provider === "anthropic") return askClaudeMedia(c, input);
  // Whisper (Groq, OpenAI — бесплатно у Groq): только расшифровка голосовых, отдельным методом API.
  if (/whisper/i.test(c.model)) return whisper(c, input);
  const content = [
    { type: "text", text: input.system },
    ...input.parts.map((p) =>
      p.kind === "image"
        ? { type: "image_url" as const, image_url: { url: `data:${p.mime.split(";")[0] || "image/jpeg"};base64,${p.data}` } }
        : { type: "input_audio" as const, input_audio: { data: p.data, format: audioFormat(p.mime) } },
    ),
  ];
  const res = await fetch(`${c.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}) },
    body: JSON.stringify({ model: c.model, messages: [{ role: "user", content }], max_tokens: 1500, temperature: 0 }),
    signal: AbortSignal.timeout(input.timeoutMs),
  }).catch(() => null);
  if (!res) return null;
  if (!res.ok) return failure(res.status, await res.text().catch(() => ""));
  const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string | null } }[] } | null;
  const text = json?.choices?.[0]?.message?.content?.trim();
  return text ? { text } : null;
}
