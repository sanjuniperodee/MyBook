import { NextResponse } from "next/server";
import { z } from "zod";
import { api, HttpError } from "@/server/api";
import { clientIp, rateLimit } from "@/server/rateLimit";
import { container } from "@/server/container";

/** Публичная отправка письма по ссылке-приглашению. Письмо ждёт одобрения владельца книги. */
export const POST = api(async (req, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params;
  const body = z
    .object({
      authorName: z.string().trim().min(1, "letterName").max(80),
      relation: z.string().trim().max(80).default(""),
      text: z.string().trim().min(10, "letterShort").max(8000, "letterLong"),
      website: z.string().max(0).optional(), // ловушка для ботов
    })
    .parse(await req.json());
  if (!(await rateLimit(`letter:${await clientIp()}`, 5, 3600_000))) throw new HttpError(429, "letterRate");
  await container().authoring.letters.submit(token, body);
  return NextResponse.json({ ok: true });
});
