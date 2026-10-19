/** Сегменты клиентов CRM: список клиентов в админке, выгрузка в CSV и отчёты называют их одинаково. */
export const clientSegments = {
  all: "Все",
  customers: "Покупатели",
  writing: "Пишут книгу",
  stalled: "Забросили",
  unpaid: "Не оплатили",
  vip: "VIP",
} as const;
export type ClientSegment = keyof typeof clientSegments;
