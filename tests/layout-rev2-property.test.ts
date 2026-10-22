import { describe, expect, it } from "vitest";
import { isChapterPhotoKey, PHOTO_OFF_KEY, type QuestionLike } from "@/lib/book/layout";
import { layoutSignature } from "@/lib/book/layout-signature";
import { GALLERY_KEY } from "@/lib/book/toc";
import { planLayoutRev2, type LayoutBundle, type LayoutPhoto, type LayoutRev2Plan } from "@/modules/authoring/application/layout-rev2";
import { applyPins, buildLayout, layoutBundle, layoutPhoto, layoutQuestion, YEAR } from "./fixtures/layout-books";

/**
 * Перевод на правила 2 на случайных книгах: 1–6 глав × 0–14 фото × раскладка фото × оформление (с фото главы и без) ×
 * выбранные заранее места × снимки обложки и оборота (с шаблоном и вариантом оборота: видны не все). Каждый найденный
 * план даёт ту же подпись вёрстки (у черновика со снимком обложки в ответе — ту же без этого снимка), а план B
 * не находится только у заказанной книги со снимком обложки в ответе.
 */

/** Повторяемый генератор (mulberry32). */
function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LAYOUTS = ["full", "half", "grid", "bleed"] as const;
const PAGE = { width: 100, align: "center", anchor: 0, aspect: "original", focusX: 0.5, focusY: 0.5, frame: "none", page: true } as const;
const SIZES = [
  [1600, 1200],
  [1200, 1600],
  [2000, 2000],
  [3000, 1000],
] as const;

function scenario(seed: number, c: number, n: number, placement: "chapters" | "end" | "none", interior: string, prePins: boolean, coverExtras: boolean): LayoutBundle {
  const r = random(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const keys = Array.from({ length: c }, (_, i) => `c${i}`);
  // У главы одна-две истории; часть историй без текста (глава без текста ждёт), фото в ответе печатает и пустую.
  const questions: QuestionLike[] = [];
  for (const key of keys) for (let k = 0, m = 1 + Math.floor(r() * 2); k < m; k++) questions.push(layoutQuestion(`${key}-q${k}`, key, questions.length, r() < 0.75 ? "Текст истории." : ""));
  const order = Array.from({ length: n }, (_, i) => i).sort(() => r() - 0.5);
  const photos: LayoutPhoto[] = order.map((position, i) => {
    const [width, height] = pick(SIZES);
    const base = { layout: pick(LAYOUTS), width, height };
    // Фото в ответе: в тексте или на всю страницу (история делится в его месте).
    if (questions.length && r() < 0.15) return layoutPhoto(`p${i}`, position, { ...base, questionId: pick(questions).id, inline: r() < 0.4 ? PAGE : null });
    if (!prePins || r() < 0.45) return layoutPhoto(`p${i}`, position, base);
    const chapter = pick([...keys, ...keys, "zz", GALLERY_KEY, PHOTO_OFF_KEY]);
    return layoutPhoto(`p${i}`, position, { ...base, chapter, opener: isChapterPhotoKey(chapter) && r() < 0.4 });
  });
  const ids = photos.map((p) => p.id);
  const some = (max: number) => ids.filter(() => r() < max / Math.max(1, ids.length)).slice(0, max);
  const hidden = keys.slice(1).filter(() => r() < 0.2);
  return layoutBundle({
    chapters: keys,
    questions,
    photos,
    letters: r() < 0.2 ? [{ id: "l1", authorName: "Мама", relation: "", text: "Письмо." }] : [],
    book: {
      interior,
      photoPlacement: placement,
      status: r() < 0.3 ? "ordered" : "draft",
      coverPhotoId: ids.length && r() < 0.6 ? pick(ids) : null,
      coverPhotoExtra: coverExtras ? some(3) : [],
      backPhotoId: coverExtras && ids.length && r() < 0.5 ? pick(ids) : null,
      backPhotoExtra: coverExtras ? some(3) : [],
      // Шаблон на 0–3 фото и вариант оборота: снимок, выбранный для обложки, может быть на ней не виден.
      ...(coverExtras ? { coverTemplate: pick(["linen", "photo", "diptych", "collage"]), backLayout: pick(["quote", "photo", "polaroids"]), backText: "" } : {}),
      tocLines: Object.fromEntries(hidden.map((k) => [`c:${k}`, { hidden: true }])),
    },
  });
}

const signature = (b: LayoutBundle, rows: readonly LayoutPhoto[], rev: number) => layoutSignature(buildLayout(b, rows, rev));

/** Найденный план — та же вёрстка; места фото не нарушают правил Photo (фото начала — у главы, фото в ответе без главы). */
function expectExact(b: LayoutBundle, plan: Extract<LayoutRev2Plan, { ok: true }>, label: string) {
  const rows = applyPins(b.photos, plan.changes);
  for (const p of rows) {
    if (p.questionId) expect([p.chapter, p.opener], label).toEqual([null, false]);
    if (p.opener) expect(isChapterPhotoKey(p.chapter), label).toBe(true);
  }
  expect(new Set(rows.map((p) => p.position)).size, label).toBe(rows.length);
  if (!plan.coverInAnswer) return expect(signature(b, rows, 2), label).toBe(signature(b, b.photos, 1));
  // Черновик со снимком обложки в ответе: снимок остаётся в ответе (по правилам 2 печатается там), без него — та же вёрстка.
  const cover = b.book.coverPhotoId;
  expect([b.book.status, rows.find((p) => p.id === cover)?.questionId], label).toEqual(["draft", plan.coverInAnswer.questionId]);
  const hidden = rows.map((p) => (p.id === cover ? { ...p, questionId: null, chapter: PHOTO_OFF_KEY, opener: false } : p));
  expect(signature(b, hidden, 2), label).toBe(signature(b, b.photos, 1));
}

describe("перевод на правила 2: свойство на случайных книгах", () => {
  it("каждый план повторяет вёрстку; план B не находится только у заказанной книги со снимком обложки в ответе", () => {
    // Снимок обложки в ответе: черновик переводится (снимок печатается в ответе, остальное как было), заказанная книга
    // остаётся на правилах 1; offCover — основное фото обложки, которого на ней не видно, закреплено «не печатается».
    const seen = { A: 0, B: 0, coverDraft: 0, coverOrdered: 0, offCover: 0 };
    let seed = 1;
    for (let c = 1; c <= 6; c++)
      for (let n = 0; n <= 14; n++)
        for (const placement of ["chapters", "end", "none"] as const)
          for (const interior of ["photobook", "classic"])
            for (const prePins of [false, true])
              for (const coverExtras of [false, true]) {
                const b = scenario(seed++, c, n, placement, interior, prePins, coverExtras);
                const label = `seed ${seed - 1}: ${c} гл., ${n} фото, ${placement}, ${interior}${prePins ? ", места" : ""}${coverExtras ? ", обложка" : ""}`;
                const plan = planLayoutRev2(b, YEAR);
                const onlyB = planLayoutRev2(b, YEAR, ["B"]);
                for (const p of [plan, onlyB]) {
                  if (p.ok) expectExact(b, p, label);
                  else expect([p.reason, b.book.status], label).toEqual(["coverInAnswer", "ordered"]);
                }
                expect(plan.ok, label).toBe(onlyB.ok);
                if (plan.ok && plan.coverInAnswer) seen.coverDraft++;
                else if (plan.ok) seen[plan.plan]++;
                else seen.coverOrdered++;
                if (plan.ok && plan.changes.some((c) => c.id === b.book.coverPhotoId && c.after.chapter === PHOTO_OFF_KEY)) seen.offCover++;
              }
    // Набор задевает все ветки перевода.
    expect(seen.A).toBeGreaterThan(100);
    expect(seen.B).toBeGreaterThan(100);
    expect(seen.coverDraft).toBeGreaterThan(5);
    expect(seen.coverOrdered).toBeGreaterThan(5);
    expect(seen.offCover).toBeGreaterThan(5);
  });
});
