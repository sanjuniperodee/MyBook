import { NextResponse, userAgent, type NextRequest } from "next/server";
import { LOCALE_COOKIE, LOCALE_HEADER, localizePath, splitLocale } from "@/i18n/config";
import { SOURCE_COOKIE } from "@/shared/domain/links";

export { SOURCE_COOKIE };

/** Первый язык в Accept-Language — казахский или узбекский; иначе русский (null). */
function preferred(header: string | null): "kk" | "uz" | null {
  const first = header?.split(",")[0]?.trim().toLowerCase() ?? "";
  if (first === "kk" || first.startsWith("kk-")) return "kk";
  if (first === "uz" || first.startsWith("uz-")) return "uz";
  return null;
}

const YEAR = 60 * 60 * 24 * 365;

function isDocumentRequest(req: NextRequest) {
  if (req.headers.has("rsc") || req.headers.has("next-router-prefetch") || req.headers.get("purpose") === "prefetch") return false;
  const dest = req.headers.get("sec-fetch-dest");
  return !dest || dest === "document";
}

export function proxy(req: NextRequest) {
  const { locale, path } = splitLocale(req.nextUrl.pathname);
  const chosen = req.cookies.get(LOCALE_COOKIE)?.value;
  const headers = new Headers(req.headers);
  headers.set(LOCALE_HEADER, locale);

  let res: NextResponse;
  if (locale !== "ru") {
    // /kk/…, /uz/… → тот же маршрут, язык передаём заголовком
    const url = req.nextUrl.clone();
    url.pathname = path;
    res = NextResponse.rewrite(url, { request: { headers } });
    // Запоминаем язык только при открытии страницы человеком. Фоновые prefetch/RSC-запросы к /kk/…,
    // догоняющие уже после переключения на русский, не должны возвращать cookie обратно.
    if (chosen !== locale && isDocumentRequest(req)) res.cookies.set(LOCALE_COOKIE, locale, { maxAge: YEAR, sameSite: "lax", path: "/" });
  } else if (req.method === "GET" && (chosen === "kk" || chosen === "uz" || (!chosen && preferred(req.headers.get("accept-language")))) && !userAgent(req).isBot) {
    // Человек выбрал казахский (или браузер просит его) — возвращаем на казахскую версию. Роботов не перенаправляем:
    // русская страница должна индексироваться по своему адресу, казахская версия связана с ней через hreflang.
    const url = req.nextUrl.clone();
    url.pathname = localizePath(req.nextUrl.pathname, chosen === "uz" ? "uz" : chosen === "kk" ? "kk" : preferred(req.headers.get("accept-language")) ?? "kk");
    const redirect = NextResponse.redirect(url);
    redirect.headers.set("Vary", "Accept-Language, Cookie");
    return redirect;
  } else {
    res = NextResponse.next({ request: { headers } });
    // Без cookie ответ на русском адресе зависит от языка браузера — кэшам и роботам об этом нужно знать.
    if (!chosen) res.headers.set("Vary", "Accept-Language");
  }

  if (req.cookies.has(SOURCE_COOKIE)) return res;
  const url = req.nextUrl;
  const utm = Object.fromEntries(
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].map((k) => [k.slice(4), url.searchParams.get(k)?.slice(0, 100) ?? ""]).filter(([, v]) => v),
  );
  // Код короткой ссылки из раздела CRM «Ссылки и каналы» (/go/код добавляет ?lnk=код).
  const link = url.searchParams.get("lnk")?.replace(/[^a-z0-9-]/gi, "").slice(0, 40) ?? "";
  let referrer = "";
  try {
    const ref = req.headers.get("referer");
    if (ref) {
      const host = new URL(ref).hostname;
      if (host && host !== url.hostname) referrer = host.slice(0, 100);
    }
  } catch {}
  const value = { ...utm, ...(referrer ? { referrer } : {}), ...(link ? { link } : {}), landing: url.pathname.slice(0, 100), at: new Date().toISOString().slice(0, 10) };
  res.cookies.set(SOURCE_COOKIE, JSON.stringify(value), { maxAge: 60 * 60 * 24 * 60, sameSite: "lax", path: "/", httpOnly: true });
  return res;
}

export const config = {
  // Только страницы: без API, статики и служебных файлов.
  matcher: ["/((?!api|_next|admin|print|go/|r/|favicon|icon|apple-icon|robots|sitemap|opengraph-image|.*\\.).*)"],
};
