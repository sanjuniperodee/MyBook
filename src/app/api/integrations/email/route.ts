import { NextResponse } from "next/server";
import { getSetting } from "@/lib/crm/settings";
import { safeEqual } from "@/shared/crypto";
import { parseInboundWebhook } from "@/lib/crm/email-logic";
import { ingestEmail } from "@/lib/crm/email";

/**
 * Входящие письма от почтового сервиса (Mailgun, Postmark, SendGrid Inbound Parse, Cloudflare Email Workers…)
 * или своего скрипта. Авторизация — токен в заголовке X-Token или параметре ?token=. Принимает JSON и формы.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const token = req.headers.get("x-token") ?? url.searchParams.get("token") ?? "";
  const expected = await getSetting("email.webhookToken");
  if (!expected || !safeEqual(token, expected)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let body: Record<string, unknown>;
  try {
    const type = req.headers.get("content-type") ?? "";
    body = type.includes("json") ? ((await req.json()) as Record<string, unknown>) : Object.fromEntries([...(await req.formData()).entries()].filter(([, v]) => typeof v === "string"));
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const mail = parseInboundWebhook(body);
  if (!mail) return NextResponse.json({ error: "Нужны поля from (адрес отправителя) и text или html" }, { status: 400 });
  try {
    await ingestEmail(mail);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[email-hook]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
