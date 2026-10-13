import { NextResponse } from "next/server";
import { parseKaspiWebhook } from "@/modules/ordering";
import { container } from "@/server/container";

/**
 * Уведомления kaspi-pos-automation (webhooks.json: payment.success / failed / expired / lost).
 * Подпись — X-Webhook-Signature (HMAC-SHA256 тела, секрет из «Интеграций» → Kaspi Pay). Без верной подписи уведомление
 * лишь повод сверить счёт с Kaspi — статус берётся из ответа Kaspi, а не из тела. Ошибка — 500, и kaspi-pos повторит.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const ordering = container().ordering;
  const signed = await ordering.verifyKaspiWebhook(raw, req.headers.get("x-webhook-signature"));
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, reason: "json" }, { status: 400 });
  }
  const hook = parseKaspiWebhook(body);
  if (!hook) return NextResponse.json({ ok: true, ignored: true });
  try {
    return NextResponse.json({ ok: true, result: await ordering.kaspi.onWebhook(hook, signed) });
  } catch (err) {
    console.error("[kaspi] webhook", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
