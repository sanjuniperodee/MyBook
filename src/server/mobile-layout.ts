import type { Permission } from "@/shared/domain/permissions";

/**
 * Раскладка мобильного приложения по роли сотрудника: свой набор вкладок и главная вкладка. Роли в CRM — наборы прав,
 * поэтому раскладку определяют права, а не название роли. Приложение прячет недоступное, но права проверяет сервер.
 *
 * - leader — руководитель (владелец, управление командой или аналитика): «Обзор» с цифрами, чаты, сделки, заказы.
 * - sales — продажи: чаты, «Мой день» (задачи), сделки, клиенты.
 * - production — производство: заказы (канбан), задачи.
 * - analyst — аналитика без работы с клиентами: «Обзор» и заказы.
 * - support — переписка без сделок: чаты, задачи, клиенты.
 * - basic — остальное: задачи и то, что разрешено.
 */
export type MobileLayout = "leader" | "sales" | "production" | "analyst" | "support" | "basic";

export function mobileLayout(has: (p: Permission) => boolean, isOwner: boolean): MobileLayout {
  const work = has("chats.view") || has("deals.view");
  if (isOwner || has("team.manage") || (has("analytics.view") && has("deals.view"))) return "leader";
  if (has("deals.view") && has("chats.view")) return "sales";
  if (has("deals.view")) return "sales";
  if (has("orders.view") && !work) return "production";
  if (has("analytics.view") && !work) return "analyst";
  if (has("chats.view")) return "support";
  return "basic";
}
