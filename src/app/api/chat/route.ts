import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { api, checkOrigin, HttpError } from "@/server/api";
import { getCurrentUser } from "@/server/auth";
import { isSecureCookie } from "@/config/env";
import { clientIp, rateLimit } from "@/server/rateLimit";
import { randomToken } from "@/shared/crypto";
import { VISITOR_COOKIE } from "@/modules/messaging";
import { container } from "@/server/container";

/** Онлайн-чат на сайте: посетитель пишет, менеджер отвечает из единого инбокса CRM. */
export const GET = api(async (req) => {
  const token = (await cookies()).get(VISITOR_COOKIE)?.value;
  if (!token) return NextResponse.json({ messages: [] });
  const after = new URL(req.url).searchParams.get("after");
  const at = after ? new Date(after) : undefined;
  const messages = await container().messaging.siteMessages(token, at && !Number.isNaN(at.getTime()) ? at : undefined);
  return NextResponse.json({ messages }, { headers: { "cache-control": "no-store" } });
});

const schema = z.object({
  text: z.string().trim().min(1, "widgetText").max(2000),
  name: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  page: z.string().max(200).optional(),
});

export const POST = api(async (req) => {
  checkOrigin(req);
  if (!(await container().messaging.widgetConfig()).chat) throw new HttpError(403, "widgetOff");
  const body = schema.parse(await req.json());
  const jar = await cookies();
  let token = jar.get(VISITOR_COOKIE)?.value;
  if (!await rateLimit(`site-chat:${await clientIp()}`, 30, 600_000) || (token && !await rateLimit(`site-chat:${token}`, 20, 300_000))) throw new HttpError(429, "widgetRate");
  if (!token || !/^[\w-]{20,64}$/.test(token)) {
    token = randomToken();
    jar.set(VISITOR_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: isSecureCookie, path: "/", maxAge: 60 * 60 * 24 * 180 });
  }
  const user = await getCurrentUser();
  await container().messaging.site.post({ token, text: body.text, name: body.name, phone: body.phone, page: body.page, userId: user?.role === "user" ? user.id : null, userName: user?.name });
  return NextResponse.json({ ok: true });
});
