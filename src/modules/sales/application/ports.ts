import type { StageMilestone } from "@/shared/domain/stageMilestones";

/** Клиенты сайта глазами продаж (антикоррупционный слой над учётными записями и заказами). */
export interface ClientDirectory {
  /** Клиент по телефону: из профиля (включая доп. номера) или из контактов его заказов. */
  findByPhone(phone: string | null | undefined): Promise<string | null>;
  profile(clientId: string): Promise<{ name: string; email: string; phone: string | null; managerId: string | null; utm: Record<string, string> | null } | null>;
  /** Ответственный сделки становится ответственным клиента, если у клиента его ещё нет. */
  adoptManager(clientId: string, managerId: string): Promise<void>;
}

export interface SalesSettings {
  /** Заявки с новых номеров попадают в «Неразобранное». */
  unsortedEnabled(): Promise<boolean>;
  /** С какого действия на сайте заводить сделку автоматически. */
  autoDealFrom(): Promise<StageMilestone | "off">;
  /** Через сколько минут не взятая заявка переходит следующему по кругу; 0 — не передавать. */
  reassignMinutes(): Promise<number>;
  /** Окно в днях от закрытия успешной сделки заказа, в которое заявку можно влить в неё (mergeRefusal); 0 — нельзя. */
  mergeClosedDays(): Promise<number>;
  /** Этап, куда падает новая заявка этого источника (настройка воронки); null — первый этап воронки. */
  entryStageId(source: string): Promise<string | null>;
}

/** Распределение заявок между менеджерами (круг). */
export interface StaffRouter {
  /** Рабочее время отдела продаж: вне его заявки не раздаются (утром их раздаст проход планировщика). */
  isWorkTime(): Promise<boolean>;
  /** Раздача — по одной: блокировка до конца транзакции, одновременные заявки расходятся по разным менеджерам. */
  lock(): Promise<void>;
  /**
   * Следующий в круге, кроме exclude: активный сотрудник на смене с правом deals.edit, не руководитель;
   * меньше всего назначений за сегодня, при равенстве — кому дольше не назначали. null — некому.
   */
  next(exclude: readonly string[]): Promise<string | null>;
  /** Сотрудник ещё работает (не отключён) — постоянный клиент идёт к своему ответственному. */
  isActive(userId: string): Promise<boolean>;
}

/** Прогресс книги клиента (контекст Authoring): тема (вид книги), ответы, всего вопросов и слова — для progressOf. */
export interface BookProgress {
  progress(bookId: string): Promise<{ theme: string; answered: number; total: number; words: number } | null>;
}

/**
 * Счета из чата по сделке (контекст «Заказы»): деньги, которые клиент платит по ссылке, не теряются в жизни сделки.
 * Вызывается внутри транзакции продаж и первым делом: порядок блокировок — счета → сделки.
 */
export interface DealInvoicesPort {
  /**
   * Слияние: счета from переходят в to. Открыт у обеих — открытый счёт from отменяется («сделки объединены»);
   * closeOpen (целевая закрыта или по ней заказ) — отменяются все открытые. Номера перенесённых и отменённых счетов.
   */
  moveAll(input: { from: string; to: string; closeOpen: boolean }): Promise<{ moved: string[]; cancelled: string[] }>;
  /**
   * Перед удалением сделки: блокирует её счета до конца транзакции и называет тот, из-за которого удалять нельзя, —
   * ждёт оплаты, оплачен или по нему ещё может прийти оплата Kaspi. null — мешающих нет.
   */
  holdForDelete(dealId: string): Promise<{ label: string; reason: "open" | "paid" | "kaspi" } | null>;
  /** Удалить отменённые и истёкшие счета сделки (вместе со сделкой: иначе её не удалить). */
  purgeClosed(dealId: string): Promise<void>;
}

/** Без контекста «Заказы» (тесты): счетов нет. */
export const noDealInvoices: DealInvoicesPort = {
  moveAll: async () => ({ moved: [], cancelled: [] }),
  holdForDelete: async () => null,
  purgeClosed: async () => {},
};

/**
 * Тариф договорённости сделки: колонка вне агрегата (её пишут и счёт из чата, и онбординг клиента). Сценарии продаж читают
 * его, чтобы сравнить цену сделки с прайсом (лимит скидки).
 */
export interface AgreedPlans {
  get(dealId: string): Promise<string | null>;
  /** false — по сделке уже заказ (договорённость закрыта) или сделки нет. */
  set(dealId: string, plan: string | null): Promise<boolean>;
}

/** Без хранилища (тесты): тарифа нет, сменить нельзя. */
export const noAgreedPlans: AgreedPlans = { get: async () => null, set: async () => false };

/** Деньги клиента по сделке: принято (платежи минус возвраты) и действует ли по ней договорённость. */
export interface DealMoney {
  paid: number;
  /** Договорённость: сделка «вручную» или с тарифом договорённости и платежами — одно правило (infrastructure/agreements.ts). */
  agreement: boolean;
}

/**
 * «Сделка держит деньги клиента» (chat-invoices 1.3): договорённость, по которой принята предоплата. Сколько держит — 0, если нет.
 * Такая сделка возвращается в работу при отмене заказа, а её сумма остаётся ценой договорённости (заказ её не переписывает).
 */
export const heldMoney = (m: DealMoney) => (m.agreement ? Math.max(0, m.paid) : 0);
