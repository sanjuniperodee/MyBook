/**
 * События, по которым сделка сама идёт по воронке, — в порядке прохождения.
 * Этап воронки хранит одно из них (crm_stages.milestone); подписи и порядок решений — в домене продаж.
 *
 * «paid» — особое: этап с ним открывает воронку оплаченных (другую, не основную). Сделка основной воронки, по которой
 * пришли деньги (предоплата по сделке или оплата заказа), переходит туда сама и дальше идёт по событиям книги и заказа.
 * «book_stalled» ставит проход планировщика: клиент давно не правит книгу. Статусы заказа после оплаты — «order_production»,
 * «order_shipped», «order_delivered».
 */
export const STAGE_MILESTONES = [
  "registered",
  "paid",
  "book_started",
  "book_half",
  "book_stalled",
  "book_ready",
  "order_created",
  "order_paid",
  "order_production",
  "order_shipped",
  "order_delivered",
] as const;
export type StageMilestone = (typeof STAGE_MILESTONES)[number];

/** Вехи, по которым сделка заводится сама (настройка «Сделка с сайта заводится, когда клиент…» и заказ). */
export const DEAL_CREATING_MILESTONES = ["registered", "book_started", "book_half", "book_ready", "order_created", "order_paid"] as const satisfies readonly StageMilestone[];

/** Сколько дней клиент не правит книгу, чтобы сделка ушла на этап «book_stalled». */
export const BOOK_STALLED_DAYS = 14;
