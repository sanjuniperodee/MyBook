import { NextResponse, type NextRequest } from "next/server";
import { env, isSecureCookie } from "@/config/env";
import { LOCALE_HEADER, localizePath } from "@/i18n/config";
import { INVITE_COOKIE } from "@/modules/referrals";
import { container } from "@/server/container";
import { clientIp, rateLimit } from "@/server/rateLimit";
import { SOURCE_COOKIE } from "@/proxy";

const MONTH = 60 * 60 * 24 * 30;

/**
 * Ссылка-приглашение /r/<код>: запоминаем код (скидка подставится при оформлении), отмечаем источник
 * «приглашение» для аналитики и ведём на главную — там друга встретит «Асель дарит вам 10%».
 * Неизвестный или недействующий код — просто главная.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  // /kk/r/<код> (ссылка от казахоязычного клиента) ведёт на казахскую главную.
  const home = localizePath("/", req.headers.get(LOCALE_HEADER) === "kk" ? "kk" : "ru");
  const res = NextResponse.redirect(new URL(home, env.appUrl), { status: 302, headers: { "Cache-Control": "no-store" } });
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(code) || !(await rateLimit(`invite:${await clientIp()}`, 60, 600_000))) return res;
  const welcome = await container().referrals.service.welcome(code);
  if (!welcome) return res;
  res.cookies.set(INVITE_COOKIE, welcome.code, { httpOnly: true, sameSite: "lax", secure: isSecureCookie, maxAge: MONTH, path: "/" });
  if (!req.cookies.has(SOURCE_COOKIE))
    res.cookies.set(SOURCE_COOKIE, JSON.stringify({ source: "invite", medium: "referral", campaign: welcome.code, landing: "/r", at: new Date().toISOString().slice(0, 10) }), {
      maxAge: 60 * 60 * 24 * 60,
      sameSite: "lax",
      path: "/",
      httpOnly: true,
    });
  return res;
}
