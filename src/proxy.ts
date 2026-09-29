import { NextResponse, type NextRequest } from "next/server";

/** Первое касание: откуда пришёл посетитель (UTM и реферер). Храним 60 дней, при регистрации сохраняем в профиль. */
export const SOURCE_COOKIE = "mb_src";

export function proxy(req: NextRequest) {
  const res = NextResponse.next();
  if (req.cookies.has(SOURCE_COOKIE)) return res;
  const url = req.nextUrl;
  const utm = Object.fromEntries(
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].map((k) => [k.slice(4), url.searchParams.get(k)?.slice(0, 100) ?? ""]).filter(([, v]) => v),
  );
  let referrer = "";
  try {
    const ref = req.headers.get("referer");
    if (ref) {
      const host = new URL(ref).hostname;
      if (host && host !== url.hostname) referrer = host.slice(0, 100);
    }
  } catch {}
  const value = { ...utm, ...(referrer ? { referrer } : {}), landing: url.pathname.slice(0, 100), at: new Date().toISOString().slice(0, 10) };
  res.cookies.set(SOURCE_COOKIE, JSON.stringify(value), { maxAge: 60 * 60 * 24 * 60, sameSite: "lax", path: "/", httpOnly: true });
  return res;
}

export const config = {
  // Только страницы: без API, статики и служебных файлов.
  matcher: ["/((?!api|_next|admin|print|favicon|icon|apple-icon|robots|sitemap|opengraph-image|.*\\.).*)"],
};
