import "server-only";
import { container } from "@/server/container";
import { audit, can, type Staff } from "@/server/access";
import { getSetting } from "@/modules/workspace";
import { isWorkTime, parseWorkHours } from "@/shared/domain/schedule";

/** Столько без запросов — и следующий заход считается новым: getCurrentUser (server/auth) отмечает активность с тем же шагом. */
export const VISIT_GAP_MS = 10 * 60_000;

/**
 * Менеджер зашёл в рабочее время — он автоматически «в сети» (на смене), и новые заявки идут ему по кругу. Включаем
 * только при новом заходе (не был в CRM больше 10 минут): кто сам ушёл со смены и продолжает работать в том же сеансе,
 * остаётся «не в сети» до следующего захода. Только тем, у кого есть переключатель смены (отвечают клиентам или ведут
 * сделки). Возвращает, на смене ли сотрудник теперь. Ошибка не мешает открыть страницу.
 */
export async function autoShiftOnVisit(staff: Staff, now = new Date()): Promise<boolean> {
  const user = staff.user;
  if (user.onShift) return true;
  if (!can(staff, "deals.edit", "chats.send")) return false;
  if (user.lastSeenAt && now.getTime() - user.lastSeenAt.getTime() <= VISIT_GAP_MS) return false;
  try {
    if (!isWorkTime(now, parseWorkHours(await getSetting("crm.workHours")))) return false;
    await container().access.shifts.set(user.id, true);
    await audit(staff, "staff.shift_auto_on", "user", user.id);
    // Ждущие заявки (ночные, «никого не было») раздаются сразу — как при ручном выходе на смену.
    void container().sales.routing.run().catch((err) => console.error("[routing] auto shift", err));
    return true;
  } catch (err) {
    console.error("[shift] auto on", err);
    return false;
  }
}
