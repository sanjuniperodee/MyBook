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

/**
 * Вкладки нижней панели по раскладке — те же в приложении (mobile/lib/core/layouts.dart) и в установленной CRM (PWA).
 * Недоступные по правам отбрасываются; последней всегда идёт «Ещё» (руководитель) или «Профиль».
 */
export type MobileTabKey = "overview" | "chats" | "tasks" | "deals" | "clients" | "orders" | "calls";

export const MOBILE_TAB_PERMS: Record<MobileTabKey, Permission | null> = {
  overview: "analytics.view",
  chats: "chats.view",
  tasks: null,
  deals: "deals.view",
  clients: "clients.view",
  orders: "orders.view",
  calls: "calls.view",
};

const LAYOUT_TABS: Record<MobileLayout, MobileTabKey[]> = {
  leader: ["overview", "chats", "deals", "orders"],
  sales: ["chats", "tasks", "deals", "clients"],
  production: ["orders", "tasks", "clients"],
  analyst: ["overview", "orders"],
  support: ["chats", "tasks", "clients"],
  basic: ["tasks"],
};

export function layoutTabs(layout: MobileLayout, has: (p: Permission) => boolean): MobileTabKey[] {
  const keys = LAYOUT_TABS[layout].filter((k) => !MOBILE_TAB_PERMS[k] || has(MOBILE_TAB_PERMS[k]!));
  return keys.length ? keys : ["tasks"];
}
