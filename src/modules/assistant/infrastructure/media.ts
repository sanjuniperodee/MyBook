import "server-only";
import { connectionReady, type AiConnection } from "../domain";
import type { MediaPart, MediaRecognition } from "../application/SellerModel";
import { askClaudeMedia } from "./claude";

/** Ответ API, по которому ясно: эта модель/провайдер вложения такого вида не принимает (а не временный сбой). */
const UNSUPPORTED_STATUS = new Set([400, 404, 415, 422]);

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
  if (c.enabled === false || !connectionReady(c)) return { unsupported: true };
  // DeepSeek API принимает только текст.
  if (c.provider === "deepseek") return { unsupported: true };
  if (c.provider === "anthropic") return askClaudeMedia(c, input);
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
  if (!res.ok) return UNSUPPORTED_STATUS.has(res.status) ? { unsupported: true } : null;
  const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string | null } }[] } | null;
  const text = json?.choices?.[0]?.message?.content?.trim();
  return text ? { text } : null;
}
