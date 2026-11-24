import { beforeAll, describe, expect, it } from "vitest";
import { fixtureSample, fixtureVariants, type FixtureBook } from "./fixtures/books";
import { useFixtureStorage } from "./fixtures/photos";

// Черновые проходы доводки вёрстки по частям книги (pdf/drafts.tsx: только части с новыми решениями, окна от полосы,
// с которой раскладку можно начать заново) дают ту же книгу, что проходы по всей книге целиком (как до 24.11):
// те же решения, полосы, номера глав и историй. На книгах с заказами то же сверяет scripts/pdf-draft-parity.ts.

let render: typeof import("@/modules/production/infrastructure/pdf/render");
beforeAll(async () => {
  await useFixtureStorage();
  render = await import("@/modules/production/infrastructure/pdf/render");
}, 60_000);

// Масштабы рядов — отдельно, с допуском 1e-6: последние разряды координат Yoga (float32) зависят от того, сколько
// текста ещё стоит в документе после полосы (scripts/pdf-draft-parity.ts).
const flowString = (flow: object) => JSON.stringify(Object.entries(flow).map(([k, v]) => [k, v instanceof Map ? [...v].sort().map(([m, x]) => [m, k === "rowScale" ? null : x]) : v instanceof Set ? [...v].sort() : v]));
const scales = (flow: { rowScale: Map<string, number> }) => [...flow.rowScale].sort(([a], [b]) => (a < b ? -1 : 1));

const books = [...fixtureSample(), ...fixtureVariants()].filter((_, i) => i % 3 === 0);

describe("черновые проходы по частям = по всей книге", () => {
  it.each(books.map((b) => [b.key, b] as const))("%s", async (_, { bundle }: FixtureBook) => {
    const letters = (bundle.letters ?? []).filter((l) => l.status === "approved");
    const book = { ...bundle, letters };
    const whole = await render.renderInterior(book, "print", undefined, { wholeBookDrafts: true });
    const parts = await render.renderInterior(book, "print");
    expect(flowString(parts.flow)).toBe(flowString(whole.flow));
    const a = scales(whole.flow);
    const b = scales(parts.flow);
    expect(b.map(([m]) => m)).toEqual(a.map(([m]) => m));
    b.forEach(([, x], i) => expect(x).toBeCloseTo(a[i][1], 6));
    expect(parts.contentPages).toBe(whole.contentPages);
    expect(parts.chapterPages).toEqual(whole.chapterPages);
    expect(parts.pages).toEqual(whole.pages);
    expect(parts.entryPages).toEqual(whole.entryPages);
  }, 120_000);
});
