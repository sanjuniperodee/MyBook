import { redirectResponse } from "@/shared/infrastructure/http/request";
import { BoardsError } from "@/modules/boards";
import { getStaff } from "@/server/access";
import { container } from "@/server/container";
import { env } from "@/config/env";

/**
 * Возврат из входа Google (redirect URI в Google Cloud Console: https://mybooks.kz/api/integrations/google/callback):
 * токены, календарь «MyBooks CRM», канал уведомлений, первая выгрузка задач — и обратно в «Календарь задач».
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = new URL("/admin/tasks/calendar", env.appUrl);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  if (!code) {
    back.searchParams.set("google", url.searchParams.get("error") === "access_denied" ? "Вы отменили вход в Google" : "Google не вернул код входа");
    return redirectResponse(back);
  }
  try {
    const userId = await container().boards.google.finish(code, state);
    // Вход Google — того же сотрудника, что нажал «Подключить» (state подписан его id).
    const staff = await getStaff();
    if (staff && staff.user.id !== userId) back.searchParams.set("google", "Календарь подключён к другому сотруднику — войдите в CRM под своим именем");
    else back.searchParams.set("google", "connected");
  } catch (e) {
    console.error("[google] callback", e);
    back.searchParams.set("google", BoardsError.is(e) ? e.message : "Не получилось подключить Google Календарь — попробуйте ещё раз");
  }
  return redirectResponse(back);
}
