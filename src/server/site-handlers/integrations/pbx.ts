import { NextResponse } from "next/server";
import { getSetting } from "@/modules/workspace";
import { safeEqual } from "@/shared/crypto";
import { parseGenericEvent } from "@/modules/telephony/domain/protocol";
import { container } from "@/server/container";

/**
 * Универсальный вебхук для любой АТС. Авторизация — токен в заголовке X-Token или параметре ?token=.
 * Формат описан в разделе «Интеграции» CRM.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const token = req.headers.get("x-token") ?? url.searchParams.get("token") ?? "";
  const expected = await getSetting("pbx.token");
  if (!expected || !safeEqual(token, expected)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const event = parseGenericEvent(body);
  if (!event) return NextResponse.json({ error: "Нужны поля event (start|answer|end|record), callId, phone" }, { status: 400 });
  try {
    const call = await container().telephony.calls.handle(event);
    return NextResponse.json({ ok: true, id: call?.id ?? null });
  } catch (err) {
    console.error("[pbx]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
