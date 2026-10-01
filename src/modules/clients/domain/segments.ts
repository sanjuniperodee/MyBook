/** Сегменты клиентов CRM. */
export const clientSegments = {
  all: "Все",
  customers: "Покупатели",
  writing: "Пишут книгу",
  stalled: "Забросили",
  unpaid: "Не оплатили",
  vip: "VIP",
} as const;
export type ClientSegment = keyof typeof clientSegments;
