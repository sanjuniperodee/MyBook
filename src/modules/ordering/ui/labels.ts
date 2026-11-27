import type { AddonId, DeliveryId, PlanId } from "@/config/site";
import { formatDate } from "@/lib/dates";
import type { LayoutApprovalState } from "../domain/layoutApproval";

/**
 * Подписи тарифов, допов и доставки в CRM — по-русски, без словарей (их берут и клиентские формы админки).
 * Клиенту, в письмах и PDF названия идут из словаря: planName(), deliveryName(), addonName() в i18n/labels.
 */
export const planLabels: Record<PlanId, string> = { digital: "Электронная версия", hardcover: "Твёрдая обложка", premium: "Премиум" };
export const addonLabels: Record<AddonId, string> = { express: "Экспресс-печать", giftwrap: "Подарочная упаковка" };
/** Порядок ключей — порядок в списках выбора. */
export const deliveryLabels: Record<DeliveryId, string> = { courier: "Курьер по городу", post: "Доставка по Казахстану", pickup: "Самовывоз", abroad: "В другую страну (стоимость считает менеджер)" };

export { deliveryAddress } from "@/shared/domain/orders";

/**
 * Согласование макета клиентом в CRM — по-русски (админка без словарей): бейдж карточки заказа, подсказка у кнопок
 * печатных файлов и подтверждение «Открыть для правок». Клиенту тексты — из словаря orders.order.layout.
 */
export interface LayoutApprovalFacts {
  state: LayoutApprovalState;
  again: boolean;
  approvedAt: string | null;
}

export type LayoutTone = "success" | "warning" | "danger" | "neutral";

export function layoutApprovalBadge(v: LayoutApprovalFacts): { label: string; tone: LayoutTone } | null {
  switch (v.state) {
    case "notRequired":
      return null;
    case "approved":
      return { label: `Макет согласован${v.approvedAt ? ` ${formatDate(v.approvedAt, true)}` : ""}`, tone: "success" };
    case "changed":
      return { label: "Макет изменён после согласования", tone: "danger" };
    case "editing":
      return { label: "Книга открыта для правок — макет не согласован", tone: "warning" };
    case "pending":
      return { label: v.again ? "Макет: ждёт повторного согласования клиента" : "Макет: ждёт согласования клиента", tone: "warning" };
  }
}

/** Под кнопками файлов: что сделать сотруднику, пока файлы закрыты. */
export const LAYOUT_STAFF_HINT = "Скопируйте ссылку на заказ и отправьте клиенту: он проверит книгу и нажмёт «Всё верно, согласовать». Файлы для типографии откроются после согласования.";

/** Подтверждение «Открыть для правок»: согласование клиента сбросится. */
export const LAYOUT_REOPEN_CONFIRM = "Открыть книгу для правок клиентом? Согласование макета сбросится: файлы для типографии закроются, и после правок клиент согласует макет заново.";
