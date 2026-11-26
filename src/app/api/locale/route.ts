import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/config/env";
import { LOCALE_COOKIE, locales } from "@/i18n/config";
import { getCurrentUser } from "@/web/auth";
import { v1WebAction } from "@/web/api";

const body = z.object({ locale: z.enum(locales) });

/** Запрос со своего сайта (Origin — наш домен); без Origin — как раньше, пропускаем. */
function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const allowed = new Set([new URL(env.appUrl).host, req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? ""]);
  try {
    return allowed.has(new URL(origin).host);
  } catch {
    return false;
  }
}

/** Смена языка: запоминаем в cookie (для proxy) и в профиле (для писем, через API v1). Меняет данные — только со своего сайта. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Bad request", code: "badRequest" }, { status: 400 });
  const { locale } = parsed.data;
  const user = await getCurrentUser();
  if (user && user.locale !== locale) {
    await v1WebAction({
      locale,
      viaApi: async (apiClient) => {
        await apiClient.meLocaleSet({ body: { locale } });
      },
    });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(LOCALE_COOKIE, locale, { maxAge: 60 * 60 * 24 * 365, sameSite: "lax", path: "/" });
  return res;
}
