import { describe, expect, it } from "vitest";
import { after, cookies, headers, isRedirectError, notFound, redirect, redirectResponse } from "@/shared/infrastructure/http/request";
import { requestContext } from "@/shared/infrastructure/http/request-scope";

// Данные запроса бэкенда (src/shared/infrastructure/http/request.ts) — замена прокладки next/* (legacy-removal-plan, этап 1).
const inRequest = <T>(init: HeadersInit, fn: () => T) => {
  const afterResponse: (() => unknown)[] = [];
  const result = requestContext.run({ request: new Request("https://api.mybooks.kz/x", { headers: init }), afterResponse }, fn);
  return { result, afterResponse };
};

describe("запрос бэкенда", () => {
  it("заголовки и cookie текущего запроса", async () => {
    const { result } = inRequest({ cookie: "mb_session=abc; mb_locale=kk", "x-test": "1" }, async () => ({
      h: (await headers()).get("x-test"),
      jar: await cookies(),
    }));
    const { h, jar } = await result;
    expect(h).toBe("1");
    expect(jar.get("mb_session")).toEqual({ name: "mb_session", value: "abc" });
    expect(jar.has("mb_locale")).toBe(true);
    expect(jar.getAll()).toHaveLength(2);
    expect(() => jar.set("x", "y")).toThrow(/токеном/);
  });

  it("вне запроса — понятная ошибка", async () => {
    await expect(headers()).rejects.toThrow(/outside an HTTP request/);
    expect(() => after(() => {})).toThrow(/outside an HTTP request/);
  });

  it("after копит задачи до отправки ответа", () => {
    const task = () => {};
    const { afterResponse } = inRequest({}, () => after(task));
    expect(afterResponse).toEqual([task]);
  });

  it("redirect и notFound бросают с digest, как Next", () => {
    try {
      redirect("/admin/deals/1");
    } catch (err) {
      expect(isRedirectError(err)).toBe(true);
      expect(Reflect.get(err as object, "digest")).toBe("NEXT_REDIRECT;replace;/admin/deals/1;307;");
    }
    try {
      notFound();
    } catch (err) {
      expect(isRedirectError(err)).toBe(false);
      expect(Reflect.get(err as object, "digest")).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
    }
    expect.assertions(4);
  });

  it("redirectResponse: 307 по умолчанию, заголовки можно дописать", () => {
    const res = redirectResponse(new URL("https://mybooks.kz/admin/tasks"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://mybooks.kz/admin/tasks");
    res.headers.set("cache-control", "no-store");
    expect(redirectResponse("https://mybooks.kz/", 302).status).toBe(302);
  });
});
