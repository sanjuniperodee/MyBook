import type { UnitOfWork } from "@/shared/application";
import { formatPrice } from "@/config/site";
import type { DealInvoice, DealInvoiceRepository } from "../domain";

/** Хранилище счетов для жизни сделки: блокировки, перенос при слиянии, удаление закрытых вместе со сделкой. */
export interface DealInvoiceLifecycleStore extends Pick<DealInvoiceRepository, "lockDeal" | "openFor" | "lockById" | "save"> {
  /**
   * Все счета сделок с блокировкой до конца транзакции. Порядок — сперва закрытые, потом ждущие оплаты (по id): так же их
   * берёт подтверждение оплаты (оплаченный счёт, затем открытый той же сделки) — взаимной блокировки нет.
   */
  lockAllFor(dealIds: string[]): Promise<DealInvoice[]>;
  /** Перенести все счета сделки from в сделку to. */
  moveDeal(from: string, to: string): Promise<void>;
  /** Удалить отменённые и истёкшие счета сделки. */
  deleteClosed(dealId: string): Promise<void>;
  /** По каким из счетов ещё ждёт ответа счёт Kaspi (на номер или QR): оплата может прийти — их id. */
  withPendingKaspi(invoiceIds: string[]): Promise<string[]>;
}

/** Почему счёт закрыт без оплаты — видно в CRM (блок «Счета», лента сделки). */
export const DEAL_INVOICE_CLOSE_REASONS = {
  order: (number: number) => `оформлен заказ №${number}`,
  dealWon: "сделка закрыта успешно",
  dealLost: (reason: string | null) => `сделка проиграна${reason ? ` (${reason})` : ""}`,
  merged: "сделки объединены",
  mergedIntoClosed: "сделки объединены, а сделка закрыта или по ней заказ",
} as const;

/**
 * Какие счета отменит слияние сделок from → to (правило moveAll; карточка сделки называет их в подтверждении): closeOpen
 * (целевая закрыта или по ней заказ) — все открытые обеих; иначе открыт у обеих — открытый счёт from; иначе — никакие.
 */
export function mergeCancels<T extends { dealId: string; status: string }>(invoices: readonly T[], from: string, closeOpen: boolean): T[] {
  const open = invoices.filter((i) => i.status === "pending_payment");
  return closeOpen ? open : open.length > 1 ? open.filter((i) => i.dealId === from) : [];
}

/** Запись в ленту сделки об отменённом счёте (для CRM). */
export const dealInvoiceCancelledNote = (invoice: DealInvoice) => {
  const s = invoice.snapshot();
  return `Счёт ${invoice.label} на ${formatPrice(s.amount)} отменён: ${s.closedReason ?? "без причины"}`;
};

/**
 * Счета из чата в жизни сделки и заказа: деньги клиента не теряются, а платить по закрытой сделке нельзя. Слияние сделок
 * переносит счета (один открытый на сделку), удаление сделки не трогает счёт, по которому заплатили или ещё могут заплатить,
 * заказ по договорённости закрывает открытый счёт. Всё — в транзакции вызывающего: счета блокируются первыми
 * (порядок блокировок: deal_invoices → payment_invoices → crm_deals).
 */
export class DealInvoiceLifecycle {
  constructor(
    private readonly store: DealInvoiceLifecycleStore,
    private readonly uow: Pick<UnitOfWork, "run">,
  ) {}

  /** Блокировка выпуска счёта по сделкам (как у выпуска) — по порядку id: две операции не ждут друг друга по кругу. */
  private async lockDeals(dealIds: string[]) {
    for (const id of [...new Set(dealIds)].sort()) await this.store.lockDeal(id);
  }

  /**
   * Слияние сделок: счета from переходят в to. Открыт у обеих — отменяется открытый счёт from; closeOpen (целевая закрыта
   * или по ней заказ) — отменяются все открытые. Отмена — до переноса: открытый счёт на сделку один (индекс deal_invoices_open_idx).
   */
  async moveAll(input: { from: string; to: string; closeOpen: boolean }): Promise<{ moved: string[]; cancelled: string[] }> {
    return this.uow.run(async () => {
      await this.lockDeals([input.from, input.to]);
      const all = await this.store.lockAllFor([input.from, input.to]);
      const cancelled: string[] = [];
      for (const invoice of mergeCancels(all, input.from, input.closeOpen)) {
        if (!invoice.cancel(input.closeOpen ? DEAL_INVOICE_CLOSE_REASONS.mergedIntoClosed : DEAL_INVOICE_CLOSE_REASONS.merged)) continue;
        await this.store.save(invoice);
        cancelled.push(invoice.label);
      }
      await this.store.moveDeal(input.from, input.to);
      return { moved: all.filter((i) => i.dealId === input.from).map((i) => i.label), cancelled };
    });
  }

  /**
   * Перед удалением сделки: блокирует её счета (и выпуск новых) до конца транзакции и называет тот, из-за которого удалять
   * нельзя: ждёт оплаты, оплачен, или он закрыт, а счёт Kaspi по нему ещё не закрыт (оплата может прийти — её не к чему будет
   * привязать). null — мешающих нет.
   */
  async holdForDelete(dealId: string): Promise<{ label: string; reason: "open" | "paid" | "kaspi" } | null> {
    return this.uow.run(async () => {
      await this.store.lockDeal(dealId);
      const all = await this.store.lockAllFor([dealId]);
      const live = all.find((i) => i.status === "pending_payment") ?? all.find((i) => i.status === "paid");
      if (live) return { label: live.label, reason: live.status === "paid" ? ("paid" as const) : ("open" as const) };
      const kaspi = new Set(await this.store.withPendingKaspi(all.map((i) => i.id)));
      const waiting = all.find((i) => kaspi.has(i.id));
      return waiting ? { label: waiting.label, reason: "kaspi" as const } : null;
    });
  }

  /** Отменённые и истёкшие счета удаляются вместе со сделкой (иначе её не удалить: ссылка на сделку — RESTRICT). */
  async purgeClosed(dealId: string) {
    await this.uow.run(() => this.store.deleteClosed(dealId));
  }

  /**
   * Заказ по договорённости оформлен — в его транзакции: открытый счёт сделки закрывается («оформлен заказ №N»), платить
   * по нему больше не нужно. Оплата, успевшая прийти по нему раньше, уже записана — её учтёт предоплата заказа.
   */
  async closeForOrder(dealId: string, orderNumber: number): Promise<DealInvoice | null> {
    return this.uow.run(async () => {
      await this.store.lockDeal(dealId);
      const open = await this.store.openFor(dealId);
      const invoice = open && (await this.store.lockById(open.id));
      if (!invoice?.cancel(DEAL_INVOICE_CLOSE_REASONS.order(orderNumber))) return null;
      await this.store.save(invoice);
      return invoice;
    });
  }
}
