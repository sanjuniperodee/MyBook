import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { env } from "@/config/env";
import { api as ru } from "@/i18n/messages/ru/api";
import { api as kk } from "@/i18n/messages/kk/api";
import { DomainError, NotFoundError } from "@/shared/domain";
import { AuthoringError } from "@/modules/authoring/domain";
import { OrderingError } from "@/modules/ordering/domain";
import { api, apiStaff, apiUser, checkOrigin, HttpError } from "@/server/api";
import { ForbiddenError } from "@/server/access";
import { anna, client, owner, request, resetContainer, resetRequest, security, signIn } from "./doubles/web";

vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);
vi.mock("next/navigation", async () => (await import("./doubles/web")).nextNavigation);
vi.mock("@/server/container", async () => (await import("./doubles/web")).containerModule);

// Характеристические тесты (фаза 3, S6): фиксируют ТЕКУЩЕЕ поведение веб-адаптера src/server/api.ts.

const appHost = new URL(env.appUrl).host;

const post = (headers: Record<string, string> = {}, body?: string) => new Request("http://localhost/api/x", { method: "POST", headers, body });

/** Ответ обёртки api() на ошибку обработчика: статус и тело. */
async function failWith(err: unknown) {
  const res = await api(async () => {
    throw err;
  })(post(), {});
  return { status: res.status, body: (await res.json()) as { error: string; code?: string } };
}

/** Ответ api() на обработчик, который сам вызывает проверку (apiUser, apiStaff и т. п.). */
async function respond(handler: (req: Request) => Promise<unknown>, req = post()) {
  const res = await api(async (r: Request) => Response.json(await handler(r)))(req, {});
  return { status: res.status, body: await res.json() };
}

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetRequest();
  resetContainer();
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => logged.mockRestore());

describe("api(): перевод ошибок в HTTP", () => {
  it("успешный ответ обработчика отдаётся как есть, ctx передаётся", async () => {
    const res = await api(async (_req, ctx: { id: string }) => Response.json({ id: ctx.id }, { status: 201 }))(post(), { id: "7" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "7" });
  });

  it("HttpError: статус из ошибки, текст по словарю api, ключ — в code; параметры подставляются", async () => {
    expect(await failWith(new HttpError(404, "bookNotFound"))).toEqual({ status: 404, body: { error: "Книга не найдена", code: "bookNotFound" } });
    expect(await failWith(new HttpError(400, "photosLimit", 30))).toEqual({ status: 400, body: { error: "В книгу можно добавить до 30 фото", code: "photosLimit" } });
    expect((await failWith(new HttpError(429, "photosRate"))).status).toBe(429);
  });

  it("язык: cookie mb_locale (роуты API), заголовок proxy x-mb-locale важнее, по умолчанию — ru", async () => {
    request.cookies.set("mb_locale", "kk");
    expect((await failWith(new HttpError(404, "bookNotFound"))).body).toEqual({ error: "Кітап табылмады", code: "bookNotFound" });
    expect((await failWith(new HttpError(400, "photoTooBig", "a.heic"))).body.error).toBe("a.heic: файл 25 МБ-тан үлкен");
    expect((await failWith(new Error("x"))).body.error).toBe("Сервердің ішкі қатесі");
    request.headers.set("x-mb-locale", "ru");
    expect((await failWith(new HttpError(404, "bookNotFound"))).body.error).toBe("Книга не найдена");
    request.cookies.set("mb_locale", "en");
    request.headers.delete("x-mb-locale");
    expect((await failWith(new HttpError(404, "bookNotFound"))).body.error).toBe("Книга не найдена");
  });

  it("код домена из словаря api → статус по правилу domainStatus, текст на языке пользователя", async () => {
    const special: Record<string, number> = {
      bookLocked: 409,
      bookHasOrders: 409,
      letterPrinted: 409,
      reviewLocked: 409,
      reviewNotAllowed: 403,
      kaspiUnavailable: 503,
      kaspiNotConnected: 503,
      letterClosed: 404,
      letterInvalid: 404,
      // Оглавление своей книги: не та книга и устаревший вид у клиента — конфликт состояния.
      outlineNotAllowed: 409,
      outlineOutdated: 409,
      // …NotFound и «notFound» (регистр не важен, B10) → 404
      notFound: 404,
      bookNotFound: 404,
      photoNotFound: 404,
      questionNotFound: 404,
      letterNotFound: 404,
      orderNotFound: 404,
      reviewNotFound: 404,
      invoiceNotFound: 404,
      chapterNotFound: 404,
    };
    const statuses: Record<string, number> = {};
    for (const code of Object.keys(ru)) statuses[code] = (await failWith(new DomainError(code))).status;
    expect(statuses).toEqual(Object.fromEntries(Object.keys(ru).map((code) => [code, special[code] ?? 400])));

    expect((await failWith(new AuthoringError("bookLocked"))).body).toEqual({ error: ru.bookLocked, code: "bookLocked" });
    request.cookies.set("mb_locale", "kk");
    expect((await failWith(new OrderingError("kaspiUnavailable"))).body).toEqual({ error: kk.kaspiUnavailable, code: "kaspiUnavailable" });
  });

  it("B10: параметры ошибки домена попадают в текст — предел фото приходит из домена, роуту не нужно ловить ошибку", async () => {
    expect(await failWith(new AuthoringError("photosLimit", undefined, [30]))).toEqual({ status: 400, body: { error: "В книгу можно добавить до 30 фото", code: "photosLimit" } });
    request.cookies.set("mb_locale", "kk");
    expect((await failWith(new AuthoringError("photosLimit", undefined, [30]))).body.error).toBe(kk.photosLimit(30));
    // код без параметров и ошибка без params работают как раньше
    expect((await failWith(new AuthoringError("bookLocked"))).body.error).toBe(kk.bookLocked);
  });

  it("ForbiddenError (assertStaff, assertVisible) → 403 forbidden, как у apiStaff; текст на языке пользователя; сбоем не считается", async () => {
    expect(await failWith(new ForbiddenError())).toEqual({ status: 403, body: { error: "Запрос отклонён", code: "forbidden" } });
    request.cookies.set("mb_locale", "kk");
    expect(await failWith(new ForbiddenError("нет прав"))).toEqual({ status: 403, body: { error: kk.forbidden, code: "forbidden" } });
    // ошибка из другой копии класса (другой слой бандла) узнаётся по метке
    const otherLayer = Object.assign(new Error("копия"), { [Symbol.for("mybook.forbidden-error")]: true });
    expect((await failWith(otherLayer)).status).toBe(403);
    expect(logged).not.toHaveBeenCalled();
  });

  it("код домена не из словаря api и прочие исключения → 500 без утечки текста", async () => {
    const server = { status: 500, body: { error: "Внутренняя ошибка сервера", code: "server" } };
    expect(await failWith(new NotFoundError("Book", "b1"))).toEqual(server);
    expect(await failWith(new OrderingError("invalidTransition", "переход draft → shipped"))).toEqual(server);
    const leak = await failWith(new Error("password=hunter2 at db.internal:5432"));
    expect(leak).toEqual(server);
    expect(JSON.stringify(leak.body)).not.toContain("hunter2");
    expect(await failWith("строка вместо ошибки")).toEqual(server);
    expect(logged).toHaveBeenCalledWith("[api]", expect.any(Error));
  });

  it("битый JSON (SyntaxError) → 400 badRequest", async () => {
    const res = await api(async (req) => Response.json(await req.json()))(post({ "content-type": "application/json" }, "{"), {});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Некорректный запрос", code: "badRequest" });
  });

  it("zod: сообщение-ключ словаря → его текст; встроенное сообщение zod → badData; берётся первая ошибка", async () => {
    const schema = z.object({ answer: z.string().max(3, "answerTooLong"), hideHeading: z.boolean() });
    expect(await failWith(schema.safeParse({ answer: "длинный", hideHeading: "да" }).error)).toEqual({ status: 400, body: { error: "Слишком длинный ответ", code: "answerTooLong" } });
    expect(await failWith(schema.safeParse({ answer: "ок", hideHeading: "да" }).error)).toEqual({ status: 400, body: { error: "Некорректные данные", code: "badData" } });
    request.cookies.set("mb_locale", "kk");
    expect((await failWith(schema.safeParse({ answer: "длинный", hideHeading: true }).error)).body.error).toBe(kk.answerTooLong);
  });
});

describe("checkOrigin: защита от CSRF", () => {
  const origin = (method: string, headers: Record<string, string>) => () => checkOrigin(new Request("http://localhost/api/x", { method, headers }));

  it("GET, HEAD и OPTIONS не проверяются даже с чужим Origin", () => {
    for (const m of ["GET", "HEAD", "OPTIONS"]) expect(origin(m, { origin: "https://evil.com" })).not.toThrow();
  });

  it("без Origin — пропускает", () => {
    expect(origin("POST", {})).not.toThrow();
    expect(origin("DELETE", { host: "mybook.kz" })).not.toThrow();
  });

  it("свой Origin: хост APP_URL или хост запроса (X-Forwarded-Host важнее Host); схема не сравнивается", () => {
    expect(origin("POST", { origin: `http://${appHost}` })).not.toThrow();
    expect(origin("POST", { origin: `https://${appHost}` })).not.toThrow();
    expect(origin("PATCH", { origin: "https://mybook.kz", host: "mybook.kz" })).not.toThrow();
    expect(origin("PATCH", { origin: "https://mybook.kz", host: "127.0.0.1:3000", "x-forwarded-host": "mybook.kz" })).not.toThrow();
  });

  it("чужой Origin (другой домен, порт или Host за прокси) → HttpError 403 forbidden", () => {
    const foreign: Record<string, string>[] = [{ origin: "https://evil.com" }, { origin: "http://localhost:3001", host: "localhost:3002" }, { origin: "https://mybook.kz", host: "mybook.kz", "x-forwarded-host": "proxy.kz" }];
    for (const headers of foreign) {
      expect(origin("POST", headers)).toThrow(expect.objectContaining({ status: 403, code: "forbidden" }));
    }
  });

  it("B5: Origin: null (песочные iframe, часть приватных режимов) и мусор вместо адреса → 403 forbidden, а не 500", async () => {
    for (const value of ["null", "not an origin", "://"]) {
      expect(origin("POST", { origin: value })).toThrow(expect.objectContaining({ status: 403, code: "forbidden" }));
    }
    expect(await respond(apiUser, post({ origin: "null" }))).toEqual({ status: 403, body: { error: "Запрос отклонён", code: "forbidden" } });
    // без Host запроса «пустой» хост Origin не совпадает ни с чем
    expect(origin("POST", { origin: "null", host: "" })).toThrow(expect.objectContaining({ status: 403 }));
  });
});

describe("apiUser и apiStaff", () => {
  it("apiUser: сначала Origin (403), потом сессия (401), иначе — пользователь", async () => {
    expect(await respond(apiUser, post({ origin: "https://evil.com" }))).toEqual({ status: 403, body: { error: "Запрос отклонён", code: "forbidden" } });
    expect(await respond(apiUser)).toEqual({ status: 401, body: { error: "Нужно войти в аккаунт", code: "unauthorized" } });
    request.cookies.set("mb_locale", "kk");
    expect((await respond(apiUser)).body.error).toBe("Аккаунтқа кіру керек");
    signIn(client);
    expect(await respond(async (r) => (await apiUser(r)).id)).toEqual({ status: 200, body: "u1" });
  });

  it("apiStaff: клиент, сотрудник без права, сотрудник не из белого списка IP → 403; с правом → сотрудник", async () => {
    const staffId = (...perms: Parameters<typeof apiStaff>[1][]) => respond(async (r) => (await apiStaff(r, ...perms)).user.id);
    expect((await staffId()).status).toBe(401);
    signIn(client);
    expect(await staffId()).toEqual({ status: 403, body: { error: "Запрос отклонён", code: "forbidden" } });
    signIn(anna);
    expect(await staffId("deals.view")).toEqual({ status: 200, body: "anna" });
    expect((await staffId("deals.view", "clients.view")).status).toBe(403);
    signIn(owner);
    expect((await staffId("settings.manage")).body).toBe("boss");
    security.allowlist = "10.1.2.0/24";
    request.headers.set("x-real-ip", "10.9.9.9");
    expect((await staffId()).status).toBe(403);
    request.headers.set("x-real-ip", "10.1.2.5");
    expect((await staffId()).status).toBe(200);
    security.require2fa = true;
    expect((await staffId()).status).toBe(403);
  });
});
