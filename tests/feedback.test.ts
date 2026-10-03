import { describe, expect, it } from "vitest";
import type { Clock, Logger, UnitOfWork } from "@/shared/application";
import type { AggregateRoot, DomainEvent } from "@/shared/domain";
import { canReview, FeedbackError, ratingSummary, Review, THANK_YOU, type ReviewInput, type ReviewPhoto, type ReviewRepository } from "@/modules/feedback/domain";
import { ReviewsService, type ReviewOrderContext } from "@/modules/feedback/application";
import { getThemes } from "@/lib/content/themes";
import { interiorsForCover, isInteriorId } from "@/lib/book/interiors";

const NOW = new Date("2026-10-01T10:00:00Z");
const order = { orderId: "o1", userId: "u1", locale: "ru" as const, theme: "mom" };
const input = (over: Partial<ReviewInput> = {}): ReviewInput => ({
  rating: 5,
  text: "Мама плакала от счастья, читала весь вечер вслух",
  authorName: "Айгерим",
  city: "Алматы",
  consent: true,
  ...over,
});
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return FeedbackError.is(e) ? e.code : "other";
  }
  return null;
};

describe("правила отзывов", () => {
  it("отзыв — только когда книга у клиента", () => {
    expect(canReview({ status: "delivered", plan: "hardcover", paid: true })).toBe(true);
    expect(canReview({ status: "shipped", plan: "premium", paid: true })).toBe(true);
    expect(canReview({ status: "paid", plan: "digital", paid: true })).toBe(true);
    // Печатная книга ещё в работе — отзыв рано.
    expect(canReview({ status: "paid", plan: "hardcover", paid: true })).toBe(false);
    expect(canReview({ status: "in_production", plan: "hardcover", paid: true })).toBe(false);
    // Без оплаты и после отмены — никогда.
    expect(canReview({ status: "pending_payment", plan: "digital", paid: false })).toBe(false);
    expect(canReview({ status: "cancelled", plan: "digital", paid: true })).toBe(false);
    expect(canReview({ status: "delivered", plan: "hardcover", paid: false })).toBe(false);
  });

  it("средняя оценка — по всем отзывам, с одним знаком", () => {
    expect(ratingSummary([])).toEqual({ average: 0, count: 0 });
    expect(ratingSummary([5, 5, 4])).toEqual({ average: 4.7, count: 3 });
    expect(ratingSummary([1, 5])).toEqual({ average: 3, count: 2 });
  });
});

describe("Review", () => {
  it("чистит ввод и сообщает о новом отзыве", () => {
    const r = Review.submit("r1", input({ text: "  Очень\n\n\n\nтрогательно, спасибо за книгу  ", authorName: "  Айгерим   С. ", city: " Астана " }), order, NOW);
    const s = r.snapshot();
    expect(s.text).toBe("Очень\n\nтрогательно, спасибо за книгу");
    expect(s.authorName).toBe("Айгерим С.");
    expect(s.city).toBe("Астана");
    expect(s.status).toBe("new");
    expect(r.pullEvents().map((e) => e.type)).toEqual(["feedback.review_submitted"]);
  });

  it("отклоняет неверную оценку, пустое имя и слишком длинный текст", () => {
    for (const rating of [0, 6, 4.5, Number.NaN]) expect(code(() => Review.submit("r", input({ rating }), order, NOW))).toBe("reviewInvalid");
    expect(code(() => Review.submit("r", input({ authorName: "   " }), order, NOW))).toBe("reviewInvalid");
    expect(code(() => Review.submit("r", input({ text: "а".repeat(2001) }), order, NOW))).toBe("reviewInvalid");
  });

  it("на сайт — только с согласием и содержательным текстом", () => {
    expect(code(() => Review.submit("r", input({ consent: false }), order, NOW).publish(NOW))).toBe("reviewNotPublishable");
    expect(code(() => Review.submit("r", input({ text: "Супер!" }), order, NOW).publish(NOW))).toBe("reviewNotPublishable");
    const r = Review.submit("r", input(), order, NOW);
    r.publish(NOW);
    expect(r.snapshot()).toMatchObject({ status: "published", publishedAt: NOW });
  });

  it("после проверки отзыв не правится; закрепить можно только опубликованный", () => {
    const r = Review.submit("r", input(), order, NOW);
    expect(code(() => r.feature(true, NOW))).toBe("reviewNotPublishable");
    r.publish(NOW);
    r.feature(true, NOW);
    expect(code(() => r.revise(input({ rating: 1 }), NOW))).toBe("reviewLocked");
    expect(code(() => r.attachPhoto(null, NOW))).toBe("reviewLocked");
    r.hide(NOW);
    expect(r.snapshot()).toMatchObject({ status: "hidden", featured: false });
  });

  it("промокод-благодарность выдаётся один раз", () => {
    const r = Review.submit("r", input(), order, NOW);
    r.thank("SPASIBO-AAAAAA");
    r.thank("SPASIBO-BBBBBB");
    expect(r.thankYouCode).toBe("SPASIBO-AAAAAA");
  });
});

// ─── сервис ────────────────────────────────────────────────────────────────

class MemReviews implements ReviewRepository {
  rows = new Map<string, ReturnType<Review["snapshot"]>>();
  snapshot = () => new Map(this.rows);
  restore = (s: unknown) => (this.rows = s as typeof this.rows);
  nextId() {
    return crypto.randomUUID();
  }
  private load(s: ReturnType<Review["snapshot"]> | undefined) {
    if (!s) return null;
    const { id, ...props } = structuredClone(s);
    return Review.restore(id, props);
  }
  async byId(id: string) {
    return this.load(this.rows.get(id));
  }
  async byOrder(orderId: string) {
    return this.load([...this.rows.values()].find((r) => r.orderId === orderId));
  }
  async save(r: Review) {
    this.rows.set(r.id, structuredClone(r.snapshot()));
  }
}

class FakeUow implements UnitOfWork {
  published: DomainEvent[] = [];
  private tracked = new Set<AggregateRoot<object, string | number>>();
  constructor(private readonly store: MemReviews) {}
  async run<T>(work: () => Promise<T>): Promise<T> {
    const snap = this.store.snapshot();
    try {
      const v = await work();
      for (const a of this.tracked) this.published.push(...a.pullEvents());
      return v;
    } catch (e) {
      this.store.restore(snap);
      throw e;
    } finally {
      this.tracked.clear();
    }
  }
  track(...a: AggregateRoot<object, string | number>[]) {
    a.forEach((x) => this.tracked.add(x));
  }
}

function setup(over: Partial<ReviewOrderContext> = {}, promoReplies: (string | null | Error)[] = []) {
  const ctx: ReviewOrderContext = { orderId: "o1", number: 1042, userId: "u1", status: "delivered", plan: "hardcover", paid: true, locale: "ru", theme: "mom", name: "Айгерим", ...over };
  const repo = new MemReviews();
  const uow = new FakeUow(repo);
  const issued: { code: string; percent: number; validHours: number }[] = [];
  const alerts: { rating: number; orderNumber: number }[] = [];
  const stored: string[] = [];
  const removed: string[] = [];
  let n = 0;
  const clock: Clock = { now: () => NOW };
  const logger: Logger = { info() {}, warn() {}, error() {} };
  const service = new ReviewsService(
    repo,
    { forReview: async (id) => (id === ctx.orderId ? ctx : null) },
    {
      maxBytes: 1000,
      async save(orderId, file): Promise<ReviewPhoto> {
        const key = `reviews/${orderId}/${++n}.jpg`;
        stored.push(key);
        return { key, width: file.length, height: 10 };
      },
      async remove(key) {
        removed.push(key);
      },
    },
    {
      async issue(i) {
        issued.push(i);
        const reply = promoReplies.length ? promoReplies.shift()! : i.code;
        if (reply instanceof Error) throw reply;
        return reply;
      },
    },
    () => `SPASIBO-${String(++n).padStart(6, "0")}`,
    { lowRating: async (a) => void alerts.push(a) },
    uow,
    clock,
    logger,
  );
  return { service, repo, uow, issued, alerts, stored, removed };
}

const failsWith = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return FeedbackError.is(e) ? e.code : "other";
  }
  return null;
};

describe("ReviewsService", () => {
  it("нет отзыва к чужому, неизвестному или ещё не доставленному заказу", async () => {
    expect(await failsWith(setup().service.open("nope"))).toBe("reviewNotAllowed");
    expect(await failsWith(setup({ status: "in_production" }).service.submit("o1", input()))).toBe("reviewNotAllowed");
  });

  it("первый отзыв приносит промокод, правка — нет", async () => {
    const { service, issued, uow } = setup();
    const first = await service.submit("o1", input());
    expect(first.thankYouCode).toMatch(/^SPASIBO-/);
    expect(issued).toHaveLength(1);
    expect(issued[0]).toMatchObject({ percent: THANK_YOU.percent, validHours: THANK_YOU.validDays * 24 });
    const again = await service.submit("o1", input({ text: "Дописала: папа тоже прочитал и попросил такую же" }));
    expect(again.id).toBe(first.id);
    expect(again.thankYouCode).toBe(first.thankYouCode);
    expect(again.text).toContain("Дописала");
    expect(issued).toHaveLength(1);
    expect(uow.published.map((e) => e.type)).toEqual(["feedback.review_submitted"]);
  });

  it("занятый код — пробует другой; сбой промокодов не теряет отзыв", async () => {
    const busy = setup({}, [null, "SPASIBO-SECOND"]);
    expect((await busy.service.submit("o1", input())).thankYouCode).toBe("SPASIBO-SECOND");
    expect(busy.issued).toHaveLength(2);

    const down = setup({}, [new Error("db"), new Error("db"), new Error("db")]);
    const r = await down.service.submit("o1", input());
    expect(r.thankYouCode).toBeNull();
    expect(down.repo.rows.size).toBe(1);
  });

  it("низкая оценка сразу уходит поддержке — один раз", async () => {
    const { service, alerts } = setup();
    await service.submit("o1", input({ rating: 2, text: "Обложка пришла помятой" }));
    await service.submit("o1", input({ rating: 1, text: "Обложка пришла помятой, и ещё опечатка" }));
    expect(alerts).toEqual([expect.objectContaining({ rating: 2, orderNumber: 1042 })]);
    const happy = setup();
    await happy.service.submit("o1", input({ rating: 4 }));
    expect(happy.alerts).toEqual([]);
  });

  it("фото: замена удаляет прежний файл, слишком большой файл отклоняется", async () => {
    const { service, removed, stored } = setup();
    await service.submit("o1", input(), { file: Buffer.alloc(100) });
    const r = await service.submit("o1", input(), { file: Buffer.alloc(200) });
    expect(r.photo?.key).toBe(stored[1]);
    expect(removed).toEqual([stored[0]]);
    const kept = await service.submit("o1", input(), "keep");
    expect(kept.photo?.key).toBe(stored[1]);
    const gone = await service.submit("o1", input(), "remove");
    expect(gone.photo).toBeNull();
    expect(removed).toEqual([stored[0], stored[1]]);
    expect(await failsWith(service.submit("o1", input(), { file: Buffer.alloc(5000) }))).toBe("reviewPhotoInvalid");
  });

  it("модерация: опубликованный отзыв автор уже не правит", async () => {
    const { service } = setup();
    const r = await service.submit("o1", input());
    await service.moderate(r.id, "publish");
    await service.moderate(r.id, "feature");
    expect(await failsWith(service.submit("o1", input({ rating: 1 })))).toBe("reviewLocked");
    expect(await failsWith(service.moderate("missing", "publish"))).toBe("reviewNotFound");
  });

  it("короткий отзыв без согласия учитывается, но не публикуется", async () => {
    const { service } = setup();
    const r = await service.submit("o1", input({ text: "Класс", consent: false }));
    expect(await failsWith(service.moderate(r.id, "publish"))).toBe("reviewNotPublishable");
    expect((await service.moderate(r.id, "hide")).status).toBe("hidden");
  });
});

describe("темы и оформление по умолчанию", () => {
  it("у каждой темы — существующее оформление страниц в пару к её обложке", () => {
    for (const locale of ["ru", "kk"] as const)
      for (const theme of getThemes(locale)) {
        expect(isInteriorId(theme.defaultInterior), `${theme.id}: ${theme.defaultInterior}`).toBe(true);
        const paired = interiorsForCover(theme.defaultCover).map((d) => d.id);
        expect(paired, `${theme.id}: ${theme.defaultCover} → ${theme.defaultInterior}`).toContain(theme.defaultInterior);
      }
  });
});
