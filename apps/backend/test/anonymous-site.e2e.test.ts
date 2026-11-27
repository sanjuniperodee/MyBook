import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp, sessionOf, testUser } from "./app";

/**
 * Ответы без входа у трёх маршрутов сайта, где прежний mybook-api отвечал по-своему (живая сверка 27.11):
 * доски — 401 со своим текстом «Войдите заново», живой поток — 403 и текст «forbidden», растр страницы — 400 на кривые
 * параметры раньше проверки входа. Прежнего API больше нет; эталон — то, что ждут веб и приложение: на 401 веб ведёт на
 * вход (apiFetch), поток SSE и у веба, и у приложения переподключается на любой не-200. Поэтому у Nest один вид для всех:
 * 401 и тело контракта `{ error, code: "unauthorized" }`; вход проверяется раньше разбора параметров (ничего не
 * раскрываем анониму), а кривые параметры у вошедшего — 400 badRequest.
 */
const CLIENT = testUser("88888888-8888-4888-8888-888888888888", { name: "Асель", email: "asel@example.kz", role: "user" });
const UNAUTHORIZED = { error: "Нужно войти в аккаунт", code: "unauthorized" };

const BOOK = "00000000-0000-4000-8000-000000000000";
const FP = "a".repeat(16);

let app: NestFastifyApplication;

beforeAll(async () => {
  ({ app } = await bootTestApp({ users: [CLIENT] }));
});

afterAll(() => app.close());

async function expectUnauthorized(method: "GET" | "POST" | "PATCH" | "DELETE", url: string, headers: Record<string, string> = {}) {
  const res = await app.inject({ method, url, headers });
  expect(res.statusCode, `${method} ${url}`).toBe(401);
  expect(res.headers["content-type"], `${method} ${url}`).toMatch(/^application\/json/);
  expect(res.json(), `${method} ${url}`).toEqual(UNAUTHORIZED);
}

describe("маршруты сайта без входа: 401 и тело контракта (не прежние 403/400/свои тексты)", () => {
  it("доски /api/admin/boards — любые путь и метод", async () => {
    for (const prefix of ["/api", "/api/v1/site"]) {
      await expectUnauthorized("GET", `${prefix}/admin/boards`);
      await expectUnauthorized("GET", `${prefix}/admin/boards/${BOOK}?done=1`);
      await expectUnauthorized("POST", `${prefix}/admin/boards`);
      await expectUnauthorized("PATCH", `${prefix}/admin/boards/columns/${BOOK}`);
      await expectUnauthorized("DELETE", `${prefix}/admin/boards/views/${BOOK}`);
    }
  });

  it("живой поток /api/admin/live/stream — 401 JSON, а не 403 «forbidden» текстом", async () => {
    for (const prefix of ["/api", "/api/v1/site"]) {
      await expectUnauthorized("GET", `${prefix}/admin/live/stream`, { accept: "text/event-stream" });
    }
  });

  it("растр страницы — 401 раньше разбора параметров: и с верными, и с кривыми", async () => {
    for (const prefix of ["/api", "/api/v1/site"]) {
      await expectUnauthorized("GET", `${prefix}/books/${BOOK}/pages/${FP}/1?w=800`);
      await expectUnauthorized("GET", `${prefix}/books/${BOOK}/pages/abc/0?w=1`);
      await expectUnauthorized("GET", `${prefix}/books/not-a-uuid/pages/${FP}/1`);
    }
  });

  it("вошедший клиент: кривые параметры растра — 400 badRequest, поток сотрудника — 403 forbidden (JSON)", async () => {
    const headers = { cookie: `mb_session=${sessionOf(CLIENT)}` };
    const raster = await app.inject({ method: "GET", url: `/api/books/${BOOK}/pages/abc/0?w=1`, headers });
    expect(raster.statusCode).toBe(400);
    expect(raster.json()).toMatchObject({ code: "badRequest" });
    const stream = await app.inject({ method: "GET", url: "/api/admin/live/stream", headers: { ...headers, accept: "text/event-stream" } });
    expect(stream.statusCode).toBe(403);
    expect(stream.headers["content-type"]).toMatch(/^application\/json/);
    expect(stream.json()).toMatchObject({ code: "forbidden" });
  });
});
