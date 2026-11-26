import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { api, checkOrigin, HttpError } from "@/server/api";
import { getCurrentUser } from "@/server/auth";
import { isSecureCookie } from "@/config/env";
import { trustedClientIp, rateLimit } from "@/server/rateLimit";
import { randomToken } from "@/shared/crypto";
import { VISITOR_COOKIE } from "@/shared/domain/links";
import { container } from "@/server/container";
import { siteChatPostSchema, VISITOR_COOKIE_MAX_AGE, VISITOR_TOKEN_RE } from "@/shared/public-routes";

/** Онлайн-чат на сайте: посетитель пишет, менеджер отвечает из единого инбокса CRM. */
export const GET = api(async (req) => {
  const token = (await cookies()).get(VISITOR_COOKIE)?.value;
  if (!token) return NextResponse.json({ messages: [] });
  const after = new URL(req.url).searchParams.get("after");
  const at = after ? new Date(after) : undefined;
  const messages = await container().messaging.siteMessages(token, at && !Number.isNaN(at.getTime()) ? at : undefined);
  return NextResponse.json({ messages }, { headers: { "cache-control": "no-store" } });
});

export const POST = api(async (req) => {
  checkOrigin(req);
  if (!(await container().messaging.widgetConfig()).chat) throw new HttpError(403, "widgetOff");
  const body = siteChatPostSchema.parse(await req.json());
  let token = (await cookies()).get(VISITOR_COOKIE)?.value;
  if (!await rateLimit(`site-chat:${await trustedClientIp()}`, 30, 600_000) || (token && !await rateLimit(`site-chat:${token}`, 20, 300_000))) throw new HttpError(429, "widgetRate");
  // Новый посетитель — cookie ставим в самом ответе: так работает и в Next, и в mybook-api (там cookies() только читает).
  const fresh = !token || !VISITOR_TOKEN_RE.test(token);
  if (fresh) token = randomToken();
  const user = await getCurrentUser();
  await container().messaging.site.post({ token: token!, text: body.text, name: body.name, phone: body.phone, page: body.page, userId: user?.role === "user" ? user.id : null, userName: user?.name });
  const res = NextResponse.json({ ok: true });
  if (fresh) res.cookies.set(VISITOR_COOKIE, token!, { httpOnly: true, sameSite: "lax", secure: isSecureCookie, path: "/", maxAge: VISITOR_COOKIE_MAX_AGE });
  return res;
});
