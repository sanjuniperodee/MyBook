import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, LOCALE_HEADER, localizePath, splitLocale } from "@/i18n/config";

/** Первое касание: откуда пришёл посетитель (UTM и реферер). Храним 60 дней, при регистрации сохраняем в профиль. */
export const SOURCE_COOKIE = "mb_src";

/** Первый язык в Accept-Language — казахский. */
function prefersKazakh(header: string | null) {
  const first = header?.split(",")[0]?.trim().toLowerCase() ?? "";
  return first === "kk" || first.startsWith("kk-");
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
  if (locale === "kk") {
    // /kk/… → тот же маршрут, язык передаём заголовком
    const url = req.nextUrl.clone();
    url.pathname = path;
    res = NextResponse.rewrite(url, { request: { headers } });
    // Запоминаем язык только при открытии страницы человеком. Фоновые prefetch/RSC-запросы к /kk/…,
    // догоняющие уже после переключения на русский, не должны возвращать cookie обратно.
    if (chosen !== "kk" && isDocumentRequest(req)) res.cookies.set(LOCALE_COOKIE, "kk", { maxAge: YEAR, sameSite: "lax", path: "/" });
  } else if (req.method === "GET" && (chosen === "kk" || (!chosen && prefersKazakh(req.headers.get("accept-language"))))) {
    // Человек выбрал казахский (или браузер просит его) — возвращаем на казахскую версию.
    const url = req.nextUrl.clone();
    url.pathname = localizePath(req.nextUrl.pathname, "kk");
    return NextResponse.redirect(url);
  } else {
    res = NextResponse.next({ request: { headers } });
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
  matcher: ["/((?!api|_next|admin|print|go/|favicon|icon|apple-icon|robots|sitemap|opengraph-image|.*\\.).*)"],
};
