import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { InjectOptions } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { v1 } from "@mybook/contracts";
import { FeedbackError } from "@/modules/feedback";
import { Review } from "@/modules/feedback/domain/Review";
import { FEEDBACK, REVIEW_ORDERS, type ReviewOrder } from "../src/modules/feedback/feedback.tokens";
import { bootTestApp, sessionOf, testUser, type FakeLimiter } from "./app";

const OWNER = testUser("11111111-1111-4111-8111-111111111111");
const STRANGER = testUser("22222222-2222-4222-8222-222222222222");
const ORDER = "33333333-3333-4333-8333-333333333333";
const URL = `/api/v1/orders/${ORDER}/review`;

const order: ReviewOrder = {
  userId: OWNER.id,
  number: 1042,
  book: { id: "book-1", theme: "mom", coverTemplate: "classic", coverDesign: null, coverPhotoId: null, title: "Мама", subtitle: "", format: "a5", authorName: "Айгерим", recipientName: "Мама", hideRecipientOnCover: false },
} as unknown as ReviewOrder;

const review = Review.restore("44444444-4444-4444-8444-444444444444", {
  orderId: ORDER,
  userId: OWNER.id,
  locale: "ru",
  theme: "mom",
  rating: 5,
  text: "Мама плакала от счастья",
  authorName: "Айгерим",
  city: "Алматы",
  consent: true,
  photo: null,
  status: "new",
  featured: false,
  thankYouCode: "THANKS-7Q",
  createdAt: new Date("2026-11-20T10:00:00Z"),
  updatedAt: new Date("2026-11-20T10:00:00Z"),
  publishedAt: null,
} as never);

const reviews = { open: vi.fn(), submit: vi.fn(), setPhoto: vi.fn() };
const body = { rating: 5, text: "Мама плакала от счастья", authorName: "Айгерим", city: "Алматы", consent: true };
const asOwner = { cookie: `mb_session=${sessionOf(OWNER)}` };

let app: NestFastifyApplication;
let limiter: FakeLimiter;
const call = (opts: InjectOptions) => app.inject(opts);

beforeAll(async () => {
  ({ app, limiter } = await bootTestApp({
    users: [OWNER, STRANGER],
    overrides: [
      [FEEDBACK, { reviews }],
      [REVIEW_ORDERS, { find: async (id: string) => (id === ORDER ? order : null) }],
    ],
  }));
});
afterAll(() => app.close());
beforeEach(() => {
  vi.clearAllMocks();
  limiter.hits.length = 0;
  limiter.deny = false;
  reviews.open.mockResolvedValue({ order: { name: "Айгерим" }, review });
  reviews.submit.mockResolvedValue(review);
  reviews.setPhoto.mockResolvedValue(review);
});

describe("бэкенд на Nest: ядро", () => {
  it("health без входа", async () => {
    const res = await call({ method: "GET", url: "/api/v1/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("список адресов для теневой сверки: маршруты контекстов без служебных; с X-Real-IP снаружи — 404", async () => {
    const res = await call({ method: "GET", url: "/api/v1/__nest/routes" });
    expect(res.statusCode).toBe(200);
    const routes = res.json().routes as { method: string; path: string }[];
    expect(routes).toContainEqual({ method: "GET", path: "/api/v1/orders/:orderId/review" });
    expect(routes).toContainEqual({ method: "DELETE", path: "/api/v1/orders/:orderId/review/photo" });
    expect(routes.some((r) => r.path === "/api/v1/health" || r.method === "HEAD")).toBe(false);

    const proxied = await call({ method: "GET", url: "/api/v1/__nest/routes", headers: { "x-real-ip": "1.2.3.4" } });
    expect(proxied.statusCode).toBe(404);
    expect(proxied.json().code).toBe("notFound");
  });

  it("неизвестный адрес — 404, путь контракта с другим методом — 405 с Allow (как у mybook-api)", async () => {
    const res = await call({ method: "GET", url: "/api/v1/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Not found", code: "notFound" });
    const wrong = await call({ method: "PATCH", url: URL });
    expect(wrong.statusCode).toBe(405);
    expect(wrong.headers.allow).toBe("GET, PUT");
  });
});

describe("отзыв к заказу (контекст Feedback)", () => {
  it("без входа — 401 на языке клиента", async () => {
    const ru = await call({ method: "GET", url: URL });
    expect(ru.statusCode).toBe(401);
    expect(ru.json()).toEqual({ error: "Нужно войти в аккаунт", code: "unauthorized" });
    const en = await call({ method: "GET", url: URL, headers: { cookie: "mb_locale=en" } });
    expect(en.json().code).toBe("unauthorized");
    expect(en.json().error).not.toBe(ru.json().error);
  });

  it("чужой заказ — 404; кривой номер — 400 по схеме, до проверки доступа (как у mybook-api)", async () => {
    const foreign = await call({ method: "GET", url: URL, headers: { cookie: `mb_session=${sessionOf(STRANGER)}` } });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json().code).toBe("reviewNotFound");
    const bad = await call({ method: "GET", url: "/api/v1/orders/not-a-uuid/review", headers: asOwner });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe("badData");
  });

  it("экран отзыва по контракту: свой отзыв, обложка, надписи; ETag и 304", async () => {
    const res = await call({ method: "GET", url: URL, headers: { authorization: `Bearer ${sessionOf(OWNER)}` } });
    expect(res.statusCode).toBe(200);
    const view = v1.reviewGet.response.parse(res.json());
    expect(view).toMatchObject({ canReview: true, defaultName: "Айгерим", review: { rating: 5, thankYouCode: "THANKS-7Q", photoUrl: null } });
    expect(view.coverUrl).toMatch(/^\/api\/books\/book-1\/cover-image\?w=480&v=/);
    expect(view.labels.order).toContain("1042");
    const tag = res.headers.etag as string;
    expect(tag).toBeTruthy();
    const again = await call({ method: "GET", url: URL, headers: { ...asOwner, "if-none-match": tag } });
    expect(again.statusCode).toBe(304);
    expect(again.body).toBe("");
  });

  it("заказ, к которому отзыв ещё нельзя, — canReview: false", async () => {
    reviews.open.mockRejectedValue(new FeedbackError("reviewNotAllowed"));
    const res = await call({ method: "GET", url: URL, headers: asOwner });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ canReview: false, defaultName: "", review: null });
  });

  it("отправка: тело по схеме, лимит по адресу, ответ — отзыв", async () => {
    const res = await call({ method: "PUT", url: URL, headers: { ...asOwner, "x-real-ip": "10.0.0.7" }, payload: body });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(v1.reviewSubmit.response.parse(res.json()).authorName).toBe("Айгерим");
    expect(reviews.submit).toHaveBeenCalledWith(ORDER, body, "keep");
    expect(limiter.hits).toEqual(["review:10.0.0.7"]);
  });

  it("лимит исчерпан — 429 reviewRate, сервис не зовётся", async () => {
    limiter.deny = true;
    const res = await call({ method: "PUT", url: URL, headers: asOwner, payload: body });
    expect(res.statusCode).toBe(429);
    expect(res.json().code).toBe("reviewRate");
    expect(reviews.submit).not.toHaveBeenCalled();
  });

  it("чужой заказ не тратит лимит: доступ проверяется раньше", async () => {
    await call({ method: "PUT", url: URL, headers: { cookie: `mb_session=${sessionOf(STRANGER)}` }, payload: body });
    expect(limiter.hits).toEqual([]);
  });

  it("неверное тело — 400 до проверки доступа и лимита; не JSON — 400", async () => {
    const foreign = await call({ method: "PUT", url: URL, headers: { cookie: `mb_session=${sessionOf(STRANGER)}` }, payload: { ...body, rating: 9 } });
    expect(foreign.statusCode).toBe(400);
    expect(limiter.hits).toEqual([]);
    const empty = await call({ method: "PUT", url: URL, headers: asOwner, payload: { ...body, authorName: "  " } });
    expect(empty.statusCode).toBe(400);
    expect(empty.json().code).toBe("reviewInvalid");
    const extra = await call({ method: "PUT", url: URL, headers: asOwner, payload: { ...body, admin: true } });
    expect(extra.statusCode).toBe(400);
    expect(extra.json().code).toBe("badData");
    const junk = await call({ method: "PUT", url: URL, headers: { ...asOwner, "content-type": "application/json" }, payload: "{oops" });
    expect(junk.statusCode).toBe(400);
    expect(junk.json().code).toBe("badRequest");
  });

  it("чужой Origin у изменяющего запроса — 403 (CSRF)", async () => {
    const res = await call({ method: "PUT", url: URL, headers: { ...asOwner, origin: "https://evil.example" }, payload: body });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("forbidden");
    expect(reviews.submit).not.toHaveBeenCalled();
  });

  it("ошибка домена — статус из общего реестра (reviewLocked → 409)", async () => {
    reviews.submit.mockRejectedValue(new FeedbackError("reviewLocked"));
    const res = await call({ method: "PUT", url: URL, headers: asOwner, payload: body });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("reviewLocked");
  });

  it("сбой сервиса — 500 без подробностей", async () => {
    reviews.submit.mockRejectedValue(new Error("db down: password=secret"));
    const res = await call({ method: "PUT", url: URL, headers: asOwner, payload: body });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "Внутренняя ошибка сервера", code: "server" });
  });

  it("фото: multipart с полем photo; без файла — 400", async () => {
    const boundary = "----mb";
    const multipart = (name: string, data: string) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="p.jpg"\r\nContent-Type: image/jpeg\r\n\r\n${data}\r\n--${boundary}--\r\n`;
    const headers = { ...asOwner, "content-type": `multipart/form-data; boundary=${boundary}` };
    const ok = await call({ method: "POST", url: `${URL}/photo`, headers, payload: multipart("photo", "JPEGDATA") });
    expect(ok.statusCode).toBe(200);
    const [orderId, change] = reviews.setPhoto.mock.calls[0];
    expect(orderId).toBe(ORDER);
    expect(Buffer.isBuffer(change.file) && change.file.toString()).toBe("JPEGDATA");
    const none = await call({ method: "POST", url: `${URL}/photo`, headers, payload: multipart("other", "X") });
    expect(none.statusCode).toBe(400);
    expect(none.json().code).toBe("badRequest");
  });

  it("убрать фото", async () => {
    const res = await call({ method: "DELETE", url: `${URL}/photo`, headers: asOwner });
    expect(res.statusCode).toBe(200);
    expect(reviews.setPhoto).toHaveBeenCalledWith(ORDER, "remove");
  });
});
