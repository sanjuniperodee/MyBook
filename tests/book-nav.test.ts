import { describe, expect, it } from "vitest";
import { bookNav, stepHref, type NavInput } from "../src/app/(app)/books/[id]/book-nav";

const base: NavInput = { kind: "gift", answered: 0, total: 176, words: 0, photos: 0, letters: { approved: 0, pending: 0 }, coverReady: true, ordered: false, paid: false, order: null };
const status = (i: Partial<NavInput>) => Object.fromEntries(bookNav({ ...base, ...i }).steps.map((s) => [s.key, s.status]));

describe("путь книги", () => {
  it("пустая книга: текст не начат, следующий шаг — вопросы, заказывать рано", () => {
    const nav = bookNav(base);
    expect(nav.steps.map((s) => s.key)).toEqual(["questions", "photos", "pages", "cover", "preview", "order"]);
    expect(status({})).toEqual({ questions: "todo", photos: "todo", pages: "done", cover: "done", preview: "todo", order: "todo" });
    expect(nav.current).toBe("questions");
    expect(nav.ready).toBe(false);
  });

  it("текст начат — шаг «в работе», доля пути до порога 10 ответов", () => {
    const nav = bookNav({ ...base, answered: 3 });
    expect(nav.steps[0]).toMatchObject({ status: "partial" });
    expect(nav.steps[0].fraction).toBeCloseTo(0.3);
  });

  it("10 ответов и обложка в порядке — готова к заказу, следующий шаг — заказ", () => {
    const nav = bookNav({ ...base, answered: 10, words: 300, photos: 2 });
    expect(nav.textDone).toBe(true);
    expect(nav.ready).toBe(true);
    expect(nav.current).toBe("order");
    expect(status({ answered: 10, photos: 2 }).questions).toBe("done");
  });

  it("не хватает обложки: шаг требует внимания и перебивает заказ", () => {
    const nav = bookNav({ ...base, answered: 12, coverReady: false });
    expect(nav.steps[3].status).toBe("attention");
    expect(nav.ready).toBe(false);
    expect(nav.current).toBe("cover");
  });

  it("своя книга считает по словам: 1000 слов — текст готов", () => {
    expect(bookNav({ ...base, kind: "blank", total: 5, answered: 2, words: 400 }).steps[0]).toMatchObject({ status: "partial" });
    expect(bookNav({ ...base, kind: "blank", total: 5, answered: 2, words: 1000 }).steps[0]).toMatchObject({ status: "done", fraction: 1 });
    expect(bookNav({ ...base, kind: "blank", words: 0 }).steps[0].status).toBe("todo");
  });

  it("заказана, ждёт оплаты: заказ «в работе», следующий шаг — оплата, заказывать не нужно", () => {
    const nav = bookNav({ ...base, answered: 20, ordered: true, order: { id: "o1", number: 3, status: "pending_payment", plan: "hardcover" } });
    expect(nav.steps[5]).toMatchObject({ status: "partial" });
    expect(nav.current).toBe("order");
    expect(nav.ready).toBe(false);
  });

  it("оплачена: все шаги заказа готовы, делать нечего", () => {
    const nav = bookNav({ ...base, answered: 20, ordered: true, paid: true, order: { id: "o1", number: 3, status: "in_production", plan: "hardcover" } });
    expect(nav.steps[5].status).toBe("done");
    expect(nav.steps[4].status).toBe("done");
    expect(nav.current).toBeNull();
  });

  it("адрес шага «Заказ»: оформление, а у заказанной книги — страница заказа", () => {
    expect(stepHref("b1", "order", { ordered: false, order: null })).toBe("/books/b1/checkout");
    expect(stepHref("b1", "order", { ordered: true, order: { id: "o9", number: 9, status: "paid", plan: "digital" } })).toBe("/orders/o9");
    expect(stepHref("b1", "questions", { ordered: false, order: null })).toBe("/books/b1/questions");
  });
});
