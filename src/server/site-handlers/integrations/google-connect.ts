import { redirectResponse } from "@/shared/infrastructure/http/request";
import { BoardsError } from "@/modules/boards";
import { getStaff } from "@/server/access";
import { boardViewer } from "@/server/boards-api";
import { container } from "@/server/container";
import { env } from "@/config/env";

/** «Подключить Google Календарь»: сотрудник уходит на вход Google (свой аккаунт), state подписан и живёт 15 минут. */
export async function GET() {
  const staff = await getStaff();
  // За nginx адрес запроса — внутренний (localhost): обратно ведём на адрес сайта.
  const back = new URL("/admin/tasks/calendar", env.appUrl);
  if (!staff) return redirectResponse(new URL("/login?next=/admin/tasks/calendar", env.appUrl));
  try {
    return redirectResponse(await container().boards.google.connectUrl(boardViewer(staff)));
  } catch (e) {
    back.searchParams.set("google", BoardsError.is(e) ? e.message : "Не получилось начать вход в Google");
    return redirectResponse(back);
  }
}
