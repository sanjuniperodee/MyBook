import { beforeAll, describe, expect, it } from "vitest";
import { CHAPTER_EPIGRAPH_MAX, CHAPTER_TITLE_MAX } from "@/lib/content/kinds";
import type { BookBundle } from "@/modules/production/infrastructure/pdf/render";
import { fixtureBooks, fixtureSample, type FixtureBook } from "./fixtures/books";
import { photoNames, useFixtureStorage } from "./fixtures/photos";

/**
 * Начальная полоса главы с названием в 120 знаков и эпиграфом в 300 (пределы ввода своей книги) занимает ровно одну
 * полосу в каждом оформлении и формате: иначе уезжают номера в оглавлении, оценка объёма и раскладка 3D-книги
 * (она считает начальную полосу за одну). Сравниваем с той же книгой с короткими названиями: число полос и номера
 * начальных полос глав должны совпасть. По умолчанию — каждое оформление один раз; PDF_CRITICAL=all — вся матрица.
 */

const books: FixtureBook[] = process.env.PDF_CRITICAL === "all" ? fixtureBooks() : fixtureSample();

/** Самые широкие буквы подряд со словами: перенос идёт по словам, а название не переносится (noHyphens). */
const LONG_TITLE = {
  ru: "Шестьдесят шумных ширококрылых шагов через широкий шёлковый шорох жёлтых шалашей, шёпот шмелей и жужжание жуков в жаркий июль",
  kk: "Жүрегімді жылытқан жылдардағы жайлы жайлаудың жасыл жағасындағы жұмбақ жолдар мен шуақты шақтар туралы шежіре естеліктерім жинағы",
};
const LONG_EPIGRAPH = {
  ru: "Всё, что мы помним, живёт в нас тихо и незаметно, как корни старого дерева, которые держат крону в любую бурю. Мы записываем воспоминания не для того, чтобы удержать время, а чтобы те, кто придёт после нас, услышали наши голоса, узнали наши дома и почувствовали тепло, которое согревало нас. Пусть эти страницы будут мостом между прошлым и будущим.",
  kk: "Біз есте сақтағанның бәрі бізде үнсіз де байқалмай өмір сүреді, кез келген дауылда тәжін ұстап тұратын ескі ағаштың тамырындай. Біз естеліктерді уақытты тоқтату үшін емес, бізден кейін келетіндер дауысымызды естіп, үйлерімізді танып, бізді жылытқан жылуды сезінсін деп жазамыз. Бұл беттер өткен мен болашақ арасындағы көпір болсын, ұрпақтарға аманат болып қалсын.",
};

/** Книга набора как «своя»: главы автора — по ключам глав набора, разделы — свой текст. */
function asBlank({ bundle }: FixtureBook, title: (lang: "ru" | "kk") => string, epigraph: (lang: "ru" | "kk") => string): BookBundle {
  const lang = bundle.book.language;
  const names = [...new Set(bundle.questions.map((q) => q.chapter))];
  const now = new Date("2026-03-08T09:00:00Z");
  return {
    ...bundle,
    book: { ...bundle.book, theme: "blank", title: "", recipientName: "" },
    chapters: names.map((key, position) => ({ id: `00000000-0000-0000-0000-00000000010${position}`, bookId: bundle.book.id, key, position, title: title(lang), epigraph: epigraph(lang), createdAt: now, updatedAt: now })),
    questions: bundle.questions.map((q) => ({ ...q, questionKey: "custom", displayText: null })),
  };
}

let render: typeof import("@/modules/production/infrastructure/pdf/render");
beforeAll(async () => {
  await useFixtureStorage(undefined, photoNames);
  render = await import("@/modules/production/infrastructure/pdf/render");
});

describe("начальная полоса главы с названием 120 и эпиграфом 300 знаков", () => {
  it("тексты проверки хватает на пределы ввода: обрезанные, они занимают их целиком", () => {
    for (const lang of ["ru", "kk"] as const) {
      expect(LONG_TITLE[lang].length).toBeGreaterThanOrEqual(CHAPTER_TITLE_MAX);
      expect(LONG_EPIGRAPH[lang].length).toBeGreaterThanOrEqual(CHAPTER_EPIGRAPH_MAX);
    }
  });

  it.each(books.map((b) => [b.key, b] as const))("%s: полос и номеров начальных полос столько же, сколько с короткими названиями", async (_key, fb) => {
    const short = await render.renderInterior(asBlank(fb, () => "Детство", () => "Короткий эпиграф."), "print");
    const long = await render.renderInterior(asBlank(fb, (l) => LONG_TITLE[l].slice(0, CHAPTER_TITLE_MAX), (l) => LONG_EPIGRAPH[l].slice(0, CHAPTER_EPIGRAPH_MAX)), "print");
    expect(long.chapterPages).toEqual(short.chapterPages);
    expect(long.contentPages).toBe(short.contentPages);
  }, 120_000);
});
