import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, it, vi } from "vitest";
import { LOCALE_HEADER } from "@/i18n/config";
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

const sharedMocks = vi.hoisted(() => ({
  reviews: { open: vi.fn(), submit: vi.fn(), setPhoto: vi.fn() },
  allowAccess: vi.fn<(orderId: string) => Promise<boolean>>(),
  allowRate: vi.fn<() => Promise<boolean>>(),
}));

vi.mock("next/headers", () => import("@/server/http/next-shim"));
vi.mock("next/server", () => import("@/server/http/next-shim"));
vi.mock("@/server/reviews", () => ({ reviewAccess: (orderId: string) => sharedMocks.allowAccess(orderId) }));
vi.mock("@/server/rateLimit", () => ({ rateLimit: () => sharedMocks.allowRate(), trustedClientIp: async () => "203.0.113.10" }));
vi.mock("@/server/container", () => ({
  container: () => ({
    feedback: { reviews: sharedMocks.reviews },
    ordering: { queries: { orderDetails: async (id: string) => (id === ORDER ? order : null) } },
  }),
}));

const { assertRoute } = await import("./expected");

const body = { rating: 5, text: "Мама плакала от счастья", authorName: "Айгерим", city: "Алматы", consent: true };
const asOwner = { cookie: `mb_session=${sessionOf(OWNER)}` };

let app: NestFastifyApplication;
let limiter: FakeLimiter;

beforeAll(async () => {
  ({ app, limiter } = await bootTestApp({
    users: [OWNER, STRANGER],
    overrides: [
      [FEEDBACK, { reviews: sharedMocks.reviews }],
      [REVIEW_ORDERS, { find: async (id: string) => (id === ORDER ? order : null) }],
    ],
  }));
});

afterAll(() => app.close());

beforeEach(() => {
  vi.clearAllMocks();
  limiter.hits.length = 0;
  limiter.deny = false;
  sharedMocks.allowAccess.mockResolvedValue(true);
  sharedMocks.allowRate.mockResolvedValue(true);
  sharedMocks.reviews.open.mockResolvedValue({ order: { name: "Айгерим" }, review });
  sharedMocks.reviews.submit.mockResolvedValue(review);
  sharedMocks.reviews.setPhoto.mockResolvedValue(review);
});

describe("ответы Nest байт в байт (эталон — прежний mybook-api) (Feedback)", () => {
  it("GET /review совпадает байт в байт на 200 (с ETag и 304) и при canReview: false", async () => {
    await assertRoute({ nest: app, method: "GET", url: URL, headers: asOwner });

    sharedMocks.reviews.open.mockRejectedValue(new FeedbackError("reviewNotAllowed"));
    await assertRoute({ nest: app, method: "GET", url: URL, headers: asOwner });
  });

  it("401 (ru/kk/en), 400 (невалидный UUID), 403 (чужой Origin), 404 (чужой заказ) и 405 совпадают байт в байт", async () => {
    for (const locale of ["ru", "kk", "en"]) {
      await assertRoute({ nest: app, method: "GET", url: URL, headers: { [LOCALE_HEADER]: locale } });
    }

    await assertRoute({ nest: app, method: "GET", url: "/api/v1/orders/not-a-uuid/review", headers: asOwner });

    sharedMocks.allowAccess.mockResolvedValue(false);
    await assertRoute({
      nest: app,
      method: "GET",
      url: URL,
      headers: { cookie: `mb_session=${sessionOf(STRANGER)}` },
    });

    await assertRoute({
      nest: app,
      method: "PUT",
      url: URL,
      headers: { ...asOwner, origin: "https://evil.example" },
      body,
    });

    await assertRoute({ nest: app, method: "PATCH", url: URL, headers: asOwner });
  });

  it("PUT /review и DELETE /review/photo совпадают байт в байт на 200, 400, 409 и 429", async () => {
    const origin = { origin: "http://localhost:3000" };
    await assertRoute({ nest: app, method: "PUT", url: URL, headers: { ...asOwner, ...origin }, body });

    await assertRoute({
      nest: app,
      method: "PUT",
      url: URL,
      headers: { ...asOwner, ...origin },
      body: { rating: 6, text: "", authorName: "", city: "", consent: false },
    });

    sharedMocks.reviews.submit.mockRejectedValueOnce(new FeedbackError("reviewLocked"));
    await assertRoute({ nest: app, method: "PUT", url: URL, headers: { ...asOwner, ...origin }, body });

    limiter.deny = true;
    sharedMocks.allowRate.mockResolvedValueOnce(false);
    await assertRoute({ nest: app, method: "PUT", url: URL, headers: { ...asOwner, ...origin }, body });
    limiter.deny = false;

    await assertRoute({ nest: app, method: "DELETE", url: `${URL}/photo`, headers: { ...asOwner, ...origin } });
  });
});
