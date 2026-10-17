import "server-only";
import type { AiConnection } from "../domain";
import type { MediaPart } from "../application/SellerModel";
import { askClaudeMedia } from "./claude";

/** Распознать вложение (голосовое → транскрипция, фото → описание). null — модель/провайдер такое не умеет. */
export async function askMedia(c: AiConnection, input: { system: string; parts: MediaPart[]; timeoutMs: number }): Promise<string | null> {
  if (c.provider === "anthropic") return askClaudeMedia(c, input);
  // OpenAI-совместимый Chat Completions: изображения — image_url, аудио — input_audio. Модель без поддержки вернёт 400.
  const content = [
    { type: "text", text: input.system },
    ...input.parts.map((p) =>
      p.kind === "image"
        ? { type: "image_url" as const, image_url: { url: `data:${p.mime || "image/jpeg"};base64,${p.data}` } }
        : { type: "input_audio" as const, input_audio: { data: p.data, format: p.mime.split("/")[1] || "ogg" } },
    ),
  ];
  const res = await fetch(`${c.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}) },
    body: JSON.stringify({ model: c.model, messages: [{ role: "user", content }], max_tokens: 2000 }),
    signal: AbortSignal.timeout(input.timeoutMs),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string | null } }[] } | null;
  const text = json?.choices?.[0]?.message?.content?.trim();
  return text || null;
}
