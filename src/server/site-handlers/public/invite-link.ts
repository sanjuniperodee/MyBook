import { NextResponse } from "next/server";
import { env, isSecureCookie } from "@/config/env";
import { LOCALE_HEADER, localizePath } from "@/i18n/config";
import { INVITE_COOKIE } from "@/modules/referrals";
import { container } from "@/server/container";
import { trustedClientIp, rateLimit } from "@/server/rateLimit";
import { SOURCE_COOKIE, INVITE_CAMPAIGN_PREFIX } from "@/shared/domain/links";
import {
  buildInviteSourceCookie,
  hasCookieNamed,
  INVITE_CODE_RE,
  INVITE_COOKIE_MAX_AGE,
  SOURCE_COOKIE_MAX_AGE,
} from "@/shared/public-routes";

/**
 * Ссылка-приглашение /r/<код>: запоминаем код (скидка подставится при оформлении), отмечаем источник
 * «приглашение» для аналитики и ведём на главную — там друга встретит «Асель дарит вам 10%».
 * Неизвестный или недействующий код — просто главная.
 */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  // /kk/r/<код> (ссылка от казахоязычного клиента) ведёт на казахскую главную.
  const home = localizePath("/", req.headers.get(LOCALE_HEADER) === "kk" ? "kk" : "ru");
  const plain = NextResponse.redirect(new URL(home, env.appUrl), { status: 302, headers: { "Cache-Control": "no-store" } });
  if (!INVITE_CODE_RE.test(code) || !(await rateLimit(`invite:${await trustedClientIp()}`, 60, 600_000))) return plain;
  const welcome = await container().referrals.service.welcome(code);
  if (!welcome) return plain;
  // Кампания визита — код-приглашение: виджет сайта передаст его в первом сообщении WhatsApp, и покупка из чата тоже
  // принесёт награду другу (contacts-d7).
  const landing = new URL(home, env.appUrl);
  landing.searchParams.set("utm_campaign", `${INVITE_CAMPAIGN_PREFIX}${welcome.code}`);
  const res = NextResponse.redirect(landing, { status: 302, headers: { "Cache-Control": "no-store" } });
  res.cookies.set(INVITE_COOKIE, welcome.code, { httpOnly: true, sameSite: "lax", secure: isSecureCookie, maxAge: INVITE_COOKIE_MAX_AGE, path: "/" });
  // Cookie читаем из заголовка: обработчик работает и в Next, и в mybook-api (там обычный Request).
  if (!hasCookieNamed(req.headers.get("cookie"), SOURCE_COOKIE))
    res.cookies.set(SOURCE_COOKIE, buildInviteSourceCookie(welcome.code), {
      maxAge: SOURCE_COOKIE_MAX_AGE,
      sameSite: "lax",
      path: "/",
      httpOnly: true,
    });
  return res;
}
