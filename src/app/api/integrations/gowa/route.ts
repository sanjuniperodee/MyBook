import { NextResponse, after } from "next/server";
import { parseGowaCall, parseGowaChange, parseGowaWebhook } from "@/modules/messaging/domain/gowa";
import { container } from "@/server/container";

/**
 * Вебхук своего шлюза WhatsApp (GOWA): входящие, ответы с телефона магазина (эхо), статусы доставки, правки и удаления
 * в WhatsApp, входящие звонки.
 * Подпись — X-Hub-Signature-256 (HMAC-SHA256, секрет из «Интеграций»). Обработка идемпотентна (по id сообщения),
 * поэтому при ошибке отвечаем 500 — шлюз доставит событие повторно.
 */
const isCallEvent = (body: unknown) => typeof body === "object" && body !== null && String((body as { event?: unknown }).event).startsWith("call.");

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
  const { messages, statuses } = parseGowaWebhook(body);
  const { edit, revoke } = parseGowaChange(body);
  try {
    // Входящий звонок WhatsApp — в общий журнал звонков (идемпотентно по call_id). Со «Звонками WhatsApp» он звонит в CRM,
    // без них — записывается пропущенным.
    if (isCallEvent(body)) {
      const telephony = container().telephony;
      const call = parseGowaCall(body, { native: await telephony.whatsapp.enabled() });
      if (call) await telephony.whatsapp.incoming(call);
    }
    for (const m of messages) await messaging.chats.ingest(m, { anyWhatsappChannel: true });
    // Новый клиент написал — его фото профиля WhatsApp появится в чате сразу (после ответа шлюзу).
    if (messages.some((m) => !m.isEcho)) after(() => messaging.kickAvatars());
    for (const s of statuses) await messaging.chats.applyStatus(s);
    // Правки и «удалить для всех», сделанные в WhatsApp (клиентом или с телефона магазина).
    if (edit) await messaging.chats.applyExternalEdit(edit);
    if (revoke) await messaging.chats.applyExternalRevoke(revoke);
  } catch (err) {
    console.error("[gowa] webhook", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
