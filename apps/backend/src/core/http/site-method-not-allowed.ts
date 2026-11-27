import type { SiteMethod } from "./site-route";

/** Адрес принадлежит более точному маршруту сайта без этого метода — ответ 405 с его Allow (ApiExceptionFilter). */
export class SiteMethodNotAllowed extends Error {
  constructor(readonly allow: SiteMethod[]) {
    super("Method Not Allowed");
  }
}
