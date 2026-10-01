import { NextResponse } from "next/server";
import { getSetting } from "@/lib/crm/settings";
import { safeEqual } from "@/shared/crypto";
import { parseZadarmaEvent, zadarmaSign, zadarmaSignedString } from "@/lib/crm/telephony-protocol";
import { handleCallEvent } from "@/lib/crm/telephony";

/** Проверка адреса при подключении уведомлений в кабинете Zadarma: вернуть zd_echo как есть. */
export async function GET(req: Request) {
  const echo = new URL(req.url).searchParams.get("zd_echo");
  if (echo) return new Response(echo.slice(0, 200), { headers: { "Content-Type": "text/plain" } });
  return new Response("ok", { headers: { "Content-Type": "text/plain" } });
}

/** События АТС Zadarma (NOTIFY_START, NOTIFY_INTERNAL, NOTIFY_ANSWER, NOTIFY_END, NOTIFY_OUT_*, NOTIFY_RECORD). */
export async function POST(req: Request) {
  const secret = await getSetting("zadarma.secret");
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const form = new URLSearchParams(await req.text());
  const params = Object.fromEntries(form.entries());
  const signed = zadarmaSignedString(params);
  if (signed === null) return NextResponse.json({ ok: true, ignored: true });
  const signature = req.headers.get("signature") ?? "";
  if (!safeEqual(signature, zadarmaSign(signed, secret))) return NextResponse.json({ error: "bad signature" }, { status: 403 });

  const event = parseZadarmaEvent(params);
  if (event) {
    try {
      await handleCallEvent(event);
    } catch (err) {
      console.error("[zadarma]", params.event, err);
      return NextResponse.json({ error: "failed" }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
