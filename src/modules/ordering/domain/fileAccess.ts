import type { Permission } from "@/shared/domain/permissions";
import type { OrderStatus } from "@/shared/domain/orders";
import { isPaid } from "./OrderStatus";

/** Файлы заказа: читательская версия (reading) и файлы для типографии (блок, обложка, раскладка, техзадание). */
export type OrderFile = "reading" | "block" | "cover" | "layout" | "spec";

/** Право сотрудника на вид файла: читательская версия — просмотр заказов, файлы типографии — отдельное право. */
export const filePermission = (file: OrderFile): Permission => (file === "reading" ? "orders.view" : "orders.files");

/**
 * Кто и что может скачать. «staff» — сотрудник с правом на этот вид файла (и может пересобрать файл);
 * «owner» — покупатель: читательская версия после оплаты, файлы для печати — только в электронном тарифе;
 * «notReady» — свой заказ, но файл ещё не положен (не оплачен или тариф печатный); «notFound» — чужой заказ
 * (не раскрываем, что он есть).
 */
export function canDownloadFile(
  order: { userId: string; status: OrderStatus },
  plan: { printed: boolean } | undefined,
  file: OrderFile,
  who: { userId: string; can: (p: Permission) => boolean },
): "staff" | "owner" | "notReady" | "notFound" {
  if (who.can(filePermission(file))) return "staff";
  if (order.userId !== who.userId) return "notFound";
  // Как было в роуте: тариф, которого уже нет в каталоге, считается электронным (файлы для печати доступны).
  const digital = !plan?.printed;
  if (!isPaid(order.status) || (file !== "reading" && !digital)) return "notReady";
  return "owner";
}
