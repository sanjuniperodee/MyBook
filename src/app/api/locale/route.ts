import { NextResponse } from "next/server";
import { z } from "zod";
import { LOCALE_COOKIE, locales } from "@/i18n/config";
import { api, checkOrigin } from "@/server/api";
import { getCurrentUser } from "@/server/auth";
import { container } from "@/server/container";

const body = z.object({ locale: z.enum(locales) });

/** Смена языка: запоминаем в cookie (для proxy) и в профиле (для писем). Меняет данные — только со своего сайта. */
export const POST = api(async (req) => {
  checkOrigin(req);
  const { locale } = body.parse(await req.json().catch(() => ({})));
  const user = await getCurrentUser();
  if (user && user.locale !== locale) await container().identity.accounts.setLocale(user.id, locale);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(LOCALE_COOKIE, locale, { maxAge: 60 * 60 * 24 * 365, sameSite: "lax", path: "/" });
  return res;
});
