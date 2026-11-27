import type { OrderStatus } from "@/shared/domain/orders";

/**
 * Этап производства на доске заказов — подробнее статуса и без новых статусов: статус заказа завязан на оплату, письма,
 * кабинет клиента и отчёты, а этап выводится из того, что уже есть, — статуса, согласования макета, открыта ли книга
 * для правок, и отметки «книга готова». Поэтому заказ идёт по этапам сам: клиент согласовал — «в очереди на печать»,
 * менеджер открыл книгу для правок — «правки», закрыл — снова «на согласовании».
 */
export const PRODUCTION_STAGES = ["awaiting_payment", "approval", "revisions", "queued", "printing", "printed", "shipped", "delivered"] as const;
export type ProductionStage = (typeof PRODUCTION_STAGES)[number];

export interface ProductionFacts {
  status: OrderStatus;
  /** Макет должен согласовать клиент (печатный тариф) и когда согласовал. */
  layoutRequired: boolean;
  layoutApprovedAt: Date | string | null;
  /** Книга открыта для правок («Открыть для правок»). */
  bookEditing: boolean;
  printedAt: Date | string | null;
}

/** Этап заказа; отменённый — null (на доске его нет). */
export function productionStage(f: ProductionFacts): ProductionStage | null {
  switch (f.status) {
    case "cancelled":
      return null;
    case "pending_payment":
      return "awaiting_payment";
    case "shipped":
      return "shipped";
    case "delivered":
      return "delivered";
    case "in_production":
      if (f.bookEditing) return "revisions";
      return f.printedAt ? "printed" : "printing";
    case "paid":
      if (f.bookEditing) return "revisions";
      return f.layoutRequired && !f.layoutApprovedAt ? "approval" : "queued";
  }
}

/** Что сделать, чтобы перенести заказ на этап (ручной перенос на доске): шаги по порядку или отказ с текстом. */
export type StageStep = { kind: "status"; to: OrderStatus } | { kind: "book"; open: boolean } | { kind: "printed"; ready: boolean };

export function productionMove(f: ProductionFacts, to: ProductionStage): { steps: StageStep[] } | { refusal: string } {
  const steps: StageStep[] = [];
  const closeBook = () => f.bookEditing && steps.push({ kind: "book", open: false });
  if (f.status === "cancelled") return { refusal: "Заказ отменён — верните его в карточке заказа" };
  if (to === "awaiting_payment") return { refusal: "«Ждёт оплаты» ставит оплата: снять оплату можно в карточке заказа" };
  if (f.status === "pending_payment" && to !== "revisions")
    return { refusal: "Заказ не оплачен: примите оплату или отправьте в печать с постоплатой в карточке заказа" };
  switch (to) {
    case "approval":
      closeBook();
      if (f.status !== "paid" && f.status !== "pending_payment") steps.push({ kind: "status", to: "paid" });
      return { steps };
    case "revisions":
      if (f.status !== "paid" && f.status !== "pending_payment") steps.push({ kind: "status", to: "paid" });
      if (!f.bookEditing) steps.push({ kind: "book", open: true });
      return { steps };
    case "queued":
      // Открыть книгу для правок сбрасывает согласие — значит, после правок клиент согласует заново.
      if (f.layoutRequired && (!f.layoutApprovedAt || f.bookEditing)) return { refusal: "Клиент ещё не согласовал макет — заказ сам перейдёт в очередь, когда согласует" };
      if (f.status !== "paid" && f.status !== "pending_payment") steps.push({ kind: "status", to: "paid" });
      return { steps };
    case "printing":
    case "printed":
      if (f.bookEditing) return { refusal: "Книга открыта для правок — закройте её, и клиент согласует макет" };
      if (f.status !== "in_production") steps.push({ kind: "status", to: "in_production" });
      steps.push({ kind: "printed", ready: to === "printed" });
      return { steps };
    case "shipped":
    case "delivered":
      closeBook();
      steps.push({ kind: "status", to });
      return { steps };
  }
}
