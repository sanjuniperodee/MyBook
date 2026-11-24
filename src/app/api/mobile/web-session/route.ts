import { NextResponse } from "next/server";
import { apiStaff } from "@/server/api";
import { container } from "@/server/container";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";

/** Срок сессии встроенного браузера: на рабочий день, потом приложение попросит новую. */
const TTL_MS = 12 * 60 * 60_000;

/**
 * Сессия для встроенного браузера приложения: разделы CRM, которых в приложении нет (финансы, обращения, правка сделки,
 * деньги заказа…), открываются внутри приложения уже вошедшими. Права — те же, что у сотрудника на сайте. Отдельный токен:
 * «Выйти» на сайте внутри приложения не закрывает приложение. Cookie — mb_session, как у сайта.
 */
export const POST = mobile(async (req) => {
  const staff = await apiStaff(req);
  const { token, expiresAt } = await container().identity.auth.openCompanionSession(staff.user.id, TTL_MS);
  return NextResponse.json({ cookie: "mb_session", token, expiresAt: expiresAt.toISOString() }, { headers: { "Cache-Control": "no-store" } });
});
