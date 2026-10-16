/**
 * Ссылка на оплату счёта из чата: /pay/<token>. Токен — 32 случайных байта base64url (43 знака); всё остальное
 * отсекается регуляркой до запроса в базу (страница, «Я оплатил(а)», роуты Kaspi).
 */
export const PAY_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function isPayToken(raw: unknown): raw is string {
  return typeof raw === "string" && PAY_TOKEN.test(raw);
}

/** Комментарий к платежу в Kaspi по счёту из чата («MyBooks P12»): по нему счёт находят в выписке. */
export const payComment = (label: string) => `MyBooks ${label}`;
