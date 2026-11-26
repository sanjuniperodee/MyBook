import { NextResponse } from "next/server";
import { container } from "@/server/container";

/**
 * Уведомления CloudPayments: /api/payments/cloudpayments/check | pay | fail
 * Укажите эти адреса в личном кабинете CloudPayments (формат — по умолчанию, кодировка UTF-8).
 */
export async function POST(req: Request, { params }: { params: Promise<{ event: string }> }) {
  const { event } = await params;
  const raw = await req.text();
  const webhook = container().ordering.cloudPayments;
  if (!webhook.verify(raw, req.headers.get("content-hmac") ?? req.headers.get("x-content-hmac"))) {
    return NextResponse.json({ code: 13 }, { status: 401 });
  }
  const body: Record<string, string> = req.headers.get("content-type")?.includes("application/json") ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
  return NextResponse.json({ code: await webhook.handle(event, body) });
}
