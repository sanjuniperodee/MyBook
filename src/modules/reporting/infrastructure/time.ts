/** Часовой пояс магазина: границы дней в отчётах. */
export const SHOP_TZ = "Asia/Almaty";

/** Начало дня по времени магазина со сдвигом в днях. */
export function localDay(offsetDays: number) {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: SHOP_TZ }));
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
