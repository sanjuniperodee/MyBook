/** Текущий месяц по Алматы: YYYY-MM. */
export const currentMonth = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "Asia/Almaty", year: "numeric", month: "2-digit" }).format(now);

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * План и факт сотрудника за месяц: факт — успешные сделки, закрытые в этом месяце, и деньги, принятые по его ручным сделкам
 * (предоплата считается продажей с первого платежа; сделка с платежами не считается второй раз, когда её закроют).
 */
export interface PlanProgress {
  userId: string;
  planAmount: number;
  planDeals: number;
  factAmount: number;
  factDeals: number;
}
