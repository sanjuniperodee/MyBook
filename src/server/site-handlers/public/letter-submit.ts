import { NextResponse } from "next/server";
import { api, HttpError } from "@/server/api";
import { trustedClientIp, rateLimit } from "@/server/rateLimit";
import { container } from "@/server/container";
import { letterSubmitSchema } from "@/shared/public-routes";

/** Публичная отправка письма по ссылке-приглашению. Письмо ждёт одобрения владельца книги. */
export const POST = api(async (req, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params;
  const body = letterSubmitSchema.parse(await req.json());
  if (!(await rateLimit(`letter:${await trustedClientIp()}`, 5, 3600_000))) throw new HttpError(429, "letterRate");
  await container().authoring.letters.submit(token, body);
  return NextResponse.json({ ok: true });
});
