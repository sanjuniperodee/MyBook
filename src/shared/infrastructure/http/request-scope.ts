import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Контекст запроса бэкенда: сам Request и задачи «после ответа» (after). Через него request.ts отдаёт старому слою
 * (src/server: auth, access, язык) заголовки и cookie текущего запроса.
 */
export interface RequestContext {
  request: Request;
  afterResponse: (() => unknown)[];
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function currentContext(): RequestContext {
  const ctx = requestContext.getStore();
  if (!ctx) throw new Error("backend: request data is unavailable outside an HTTP request");
  return ctx;
}
