import { NextResponse } from "next/server";
import { getSetting } from "@/lib/crm/settings";
import { safeEqual } from "@/lib/crm/crypto";
import { parseWazzupWebhook } from "@/lib/crm/wazzup-protocol";
import { applyStatus, ingestMessage } from "@/lib/crm/chats";

/**
 * Вебхук Wazzup: входящие сообщения, эхо отправленных с телефона и статусы доставки.
 * Wazzup ждёт ответ 200 быстро и повторяет доставку при ошибке — обработка идемпотентна (по messageId).
 */
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const expected = await getSetting("wazzup.webhookToken");
  if (!expected || !safeEqual(token, expected)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const { test, messages, statuses } = parseWazzupWebhook(body);
  if (test) return NextResponse.json({ ok: true });

  let failed = 0;
  // Сообщения одного чата — по порядку, чтобы не создать две сделки на одно обращение.
  for (const m of messages.sort((a, b) => a.at.getTime() - b.at.getTime())) {
    try {
      await ingestMessage(m);
    } catch (err) {
      failed++;
      console.error("[wazzup] message", m.externalId, err);
    }
  }
  for (const s of statuses) await applyStatus(s).catch((err) => console.error("[wazzup] status", err));
  // 500 — Wazzup доставит пакет повторно; уже сохранённые сообщения отсеются по messageId.
  return failed ? NextResponse.json({ error: "partial" }, { status: 500 }) : NextResponse.json({ ok: true });
}
