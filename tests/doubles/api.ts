import { vi } from "vitest";

/**
 * ADR 0013: у веба нет локальных веток — страницы и действия ходят в API v1. В тестах запросы веба к mybook-api
 * (`API_INTERNAL_URL`, 127.0.0.1:3044) уходят в приложение apps/api в том же процессе — с теми же двойниками container().
 */
export async function routeWebToApi() {
  const [{ createApp }, { handlers }, { siteAuthenticator }, { handleSiteRoute }] = await Promise.all([
    import("../../apps/api/src/app"),
    import("../../apps/api/src/routes"),
    import("../../apps/api/src/auth"),
    import("../../apps/api/src/site-routes"),
  ]);
  const app = createApp(handlers, siteAuthenticator, handleSiteRoute);
  const real = globalThis.fetch;
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    return url.startsWith("http://127.0.0.1:3044/") ? app(new Request(url, init)) : real(input, init);
  });
  return app;
}
