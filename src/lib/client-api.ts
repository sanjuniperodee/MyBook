import { clientLocale, LOCALE_HEADER, localizePath } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";

/** Ошибка API: текст уже на языке пользователя, code — ключ из словаря api (для логики на клиенте). */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

/** fetch-обёртка для клиентских компонентов: JSON, понятные ошибки на языке страницы. */
export async function apiFetch<T = unknown>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const body = json !== undefined ? JSON.stringify(json) : rest.body;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      // Язык страницы: API отвечает ошибками на нём же (getLocale читает этот заголовок).
      headers: { [LOCALE_HEADER]: clientLocale(), ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      body,
      // keepalive позволяет запросу завершиться, даже если пользователь закрыл вкладку
      keepalive: typeof body === "string" && body.length < 20_000 ? true : rest.keepalive,
    });
  } catch {
    throw new Error(messagesFor(clientLocale()).common.errors.network);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) window.location.assign(localizePath(`/login?next=${encodeURIComponent(location.pathname + location.search)}`, clientLocale()));
    const { error, code } = data as { error?: string; code?: string };
    throw new ApiError(error ?? messagesFor(clientLocale()).common.errors.status(res.status), res.status, code);
  }
  return data as T;
}
