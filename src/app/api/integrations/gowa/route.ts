import { NextResponse } from "next/server";
import { parseGowaWebhook } from "@/modules/messaging/domain/gowa";
import { container } from "@/server/container";

/** Вложения из WhatsApp открываются через наш прокси: шлюз доступен только из внутренней сети. */
const mediaUrl = (path: string) => `/api/admin/whatsapp/media?path=${encodeURIComponent(path)}`;

/**
 * Вебхук своего шлюза WhatsApp (GOWA): входящие, ответы с телефона магазина (эхо) и статусы доставки.
 * Подпись — X-Hub-Signature-256 (HMAC-SHA256, секрет из «Интеграций»). Обработка идемпотентна (по id сообщения),
 * поэтому при ошибке отвечаем 500 — шлюз доставит событие повторно.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const messaging = container().messaging;
  if (!(await messaging.verifyGowaWebhook(raw, req.headers.get("x-hub-signature-256")))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const { messages, statuses } = parseGowaWebhook(body, mediaUrl);
  try {
    for (const m of messages) await messaging.chats.ingest(m, { anyWhatsappChannel: true });
    for (const s of statuses) await messaging.chats.applyStatus(s);
  } catch (err) {
    console.error("[gowa] webhook", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
