import { beforeAll, describe, expect, it } from "vitest";
import { editorBook, editorModel } from "@/lib/book/editor-data";
import { editorContent } from "@/lib/book/editor-estimate";
import { firstChapterPage } from "@/lib/book/estimate";
import { fixtureSample, fixtureVariants } from "./fixtures/books";
import { useFixtureStorage } from "./fixtures/photos";

// Колонцифры превью редактора: первая полоса первой главы (после титула, посвящения и оглавления) — та же, что в PDF;
// дальше номера идут по полосам глав, которые превью раскладывает, как react-pdf (tests/paginate.test.tsx).

let render: typeof import("@/modules/production/infrastructure/pdf/render");
beforeAll(async () => {
  await useFixtureStorage();
  render = await import("@/modules/production/infrastructure/pdf/render");
});

const books = [...fixtureSample(), ...fixtureVariants()].filter((b) => ["classic-a5-ru", "luna-a5-kk", "bare"].includes(b.key));

describe("номера полос превью — как в PDF", () => {
  it.each(books.map((b) => [b.key, b] as const))("%s: первая полоса первой главы", async (_, { bundle }) => {
    const letters = (bundle.letters ?? []).filter((l) => l.status === "approved");
    const model = editorModel(bundle.book, bundle.questions, bundle.chapters, bundle.photos, letters);
    const content = editorContent(editorBook(bundle.book, model.coverPhotos), model.questions, model.photos, model.letters, model.chapters);
    const res = await render.renderInterior({ ...bundle, letters }, "preview");
    const first = firstChapterPage(content);
    // Начальная полоса — всегда слева (openersLeft): выпала бы справа — перед ней пустая (так считает и превью).
    expect(content.openersLeft && first % 2 === 1 ? first + 1 : first).toBe(res.chapterPages[content.chapters[0].key]);
  });
});
