import { NextResponse } from "next/server";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { getCurrentUser } from "@/server/auth";
import { container } from "@/server/container";

/** Смена языка: запоминаем в cookie (для proxy) и в профиле (для писем). */
export async function POST(req: Request) {
  const { locale } = (await req.json().catch(() => ({}))) as { locale?: string };
  if (!isLocale(locale)) return NextResponse.json({ error: "bad locale" }, { status: 400 });
  const user = await getCurrentUser();
  if (user && user.locale !== locale) await container().identity.accounts.setLocale(user.id, locale);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(LOCALE_COOKIE, locale, { maxAge: 60 * 60 * 24 * 365, sameSite: "lax", path: "/" });
  return res;
}
