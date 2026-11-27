import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Контекст запроса API: сам Request и задачи «после ответа» (after). Через него next/headers и next/server
 * (http/next-shim.ts) отдают общему коду сайта (auth, access, i18n) заголовки и cookie текущего запроса.
 */
export interface RequestContext {
  request: Request;
  afterResponse: (() => unknown)[];
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function currentContext(): RequestContext {
  const ctx = requestContext.getStore();
  if (!ctx) throw new Error("бэкенд: вызов прокладки next/* вне HTTP-запроса");
  return ctx;
}
