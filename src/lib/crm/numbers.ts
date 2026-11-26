/** Числа отчётов CRM: строка из SQL → число, доля в процентах, длительность словами. */
export const num = (v: unknown) => Number(v ?? 0);
export const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
export const mins = (sec: number | null) => (sec === null || Number.isNaN(sec) ? "—" : sec < 60 ? `${Math.round(sec)} сек` : sec < 3600 ? `${Math.round(sec / 60)} мин` : `${(sec / 3600).toFixed(1).replace(".", ",")} ч`);
/** Изменение к прошлому периоду: доля (0,15 — +15 %), null — было ноль, стало больше. */
export const change = (a: number, b: number) => (b ? (a - b) / b : a ? null : 0);
