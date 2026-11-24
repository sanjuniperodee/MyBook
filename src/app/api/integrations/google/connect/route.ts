import { NextResponse } from "next/server";
import { BoardsError } from "@/modules/boards";
import { getStaff } from "@/server/access";
import { boardViewer } from "@/server/boards-api";
import { container } from "@/server/container";

export const dynamic = "force-dynamic";

/** «Подключить Google Календарь»: сотрудник уходит на вход Google (свой аккаунт), state подписан и живёт 15 минут. */
export async function GET(req: Request) {
  const staff = await getStaff();
  const back = new URL("/admin/tasks/calendar", req.url);
  if (!staff) return NextResponse.redirect(new URL("/login?next=/admin/tasks/calendar", req.url));
  try {
    return NextResponse.redirect(await container().boards.google.connectUrl(boardViewer(staff)));
  } catch (e) {
    back.searchParams.set("google", BoardsError.is(e) ? e.message : "Не получилось начать вход в Google");
    return NextResponse.redirect(back);
  }
}
