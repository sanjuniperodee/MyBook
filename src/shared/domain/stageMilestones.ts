/**
 * События на сайте, по которым сделка сама идёт по воронке, — в порядке прохождения.
 * Этап воронки хранит одно из них (crm_stages.milestone); подписи и порядок решений — в домене продаж.
 */
export const STAGE_MILESTONES = ["registered", "book_started", "book_half", "book_ready", "order_created", "order_paid"] as const;
export type StageMilestone = (typeof STAGE_MILESTONES)[number];
