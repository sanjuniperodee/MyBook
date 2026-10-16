import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { contentFingerprint, contentFor, type BookBundle } from "@/modules/production/infrastructure/pdf/render";
import type { Book, BookQuestion, Photo } from "@/shared/infrastructure/db/schema";
import { fixtureBook } from "../fixtures/books";
import { characterizationBooks } from "./books";

/**
 * Характеристика contentFingerprint — ключа кэша предпросмотров. Снимок отпечатков страхует LAYOUT_VERSION:
 * изменился отпечаток — либо поменялось содержимое (тогда поднимают версию осознанно), либо его сериализация.
 */

// В содержимом год печати — по умолчанию текущий, поэтому часы фиксированы.
beforeAll(() => vi.useFakeTimers({ toFake: ["Date"] }));
beforeEach(() => vi.setSystemTime(new Date("2026-06-15T12:00:00Z")));
afterAll(() => vi.useRealTimers());

const bundle = () => fixtureBook("photobook", "a5", "ru").bundle;

/** Правки бандла: поля книги, вопрос по позиции, фото по имени снимка набора. */
type Change = (b: BookBundle) => BookBundle;
const book = (patch: Partial<Book>): Change => (b) => ({ ...b, book: { ...b.book, ...patch } });
const question = (position: number, patch: Partial<BookQuestion>): Change => (b) => ({ ...b, questions: b.questions.map((q) => (q.position === position ? { ...q, ...patch } : q)) });
const photo = (name: string, patch: (p: Photo) => Partial<Photo>): Change => (b) => ({ ...b, photos: b.photos.map((p) => (p.storageKey.endsWith(`/${name}.jpg`) ? { ...p, ...patch(p) } : p)) });

describe("contentFingerprint", () => {
  it("отпечатки книг набора", () => {
    expect(Object.fromEntries(characterizationBooks().map((fb) => [fb.key, contentFingerprint(fb.bundle)]))).toMatchSnapshot();
  });

  it("формула: sha1 от версии вёрстки 5, содержимого книги и id:раскладка:подпись каждого фото, первые 16 знаков", () => {
    const b = bundle();
    const photos = b.photos.map((p) => `${p.id}:${p.layout}:${p.caption}`).join("|");
    const expected = createHash("sha1").update("v5").update(JSON.stringify(contentFor(b))).update(photos).digest("hex").slice(0, 16);
    expect(contentFingerprint(b)).toBe(expected);
  });

  it("от чего меняется, а от чего нет", () => {
    const changes: Record<string, Change> = {
      "текст ответа": question(1, { answer: "Другой ответ." }),
      "скрытый заголовок": question(5, { hideHeading: true }),
      "подсказка и формулировка вопроса": question(5, { hint: "Подсказка", prompt: "Другой вопрос" }),
      оформление: book({ interior: "classic" }),
      формат: book({ format: "square" }),
      "фото в конце книги": book({ photoPlacement: "end" }),
      посвящение: book({ dedication: "Другое посвящение" }),
      "раскладка фотостраницы": photo("p3", () => ({ layout: "full" })),
      "подпись фото": photo("p3", () => ({ caption: "Новая подпись" })),
      "рамка фото в ответе": photo("b", (p) => ({ inline: p.inline && { ...p.inline, frame: "polaroid" } })),
      // Лишний промах кэша: фото обложки внутри книги нет, но его подпись входит в отпечаток.
      "подпись фото обложки": photo("cover", () => ({ caption: "Обложка" })),
      "поле position фото без перестановки": photo("p3", () => ({ position: 99 })),
      "текст письма": (b) => ({ ...b, letters: b.letters?.map((l, i) => (i === 1 ? { ...l, text: "Другое письмо." } : l)) }),
      "шаблон обложки и оборот": book({ coverTemplate: "linen", backText: "Другой текст", backLayout: "minimal", photoFrames: {} }),
      "получатель скрыт на обложке": book({ hideRecipientOnCover: true }),
      "статус и даты": book({ status: "ordered", updatedAt: new Date("2026-05-01T00:00:00Z") }),
    };
    const base = contentFingerprint(bundle());
    expect(Object.fromEntries(Object.entries(changes).map(([name, change]) => [name, contentFingerprint(change(bundle())) !== base]))).toEqual({
      "текст ответа": true,
      "скрытый заголовок": true,
      "подсказка и формулировка вопроса": false,
      оформление: true,
      формат: true,
      "фото в конце книги": true,
      посвящение: true,
      "раскладка фотостраницы": true,
      "подпись фото": true,
      "рамка фото в ответе": true,
      "подпись фото обложки": true,
      "поле position фото без перестановки": false,
      "текст письма": true,
      "шаблон обложки и оборот": false,
      "получатель скрыт на обложке": false,
      "статус и даты": false,
    });
  });

  it("виды книг: название и эпиграф главы своей книги, порядок её глав, «кто записал» у автобиографии", () => {
    const variant = (key: string) => characterizationBooks().find((fb) => fb.key === key)!.bundle;
    const blank = variant("blank");
    const auto = variant("autobiography");
    const changes: Record<string, [BookBundle, BookBundle]> = {
      "название главы своей книги": [blank, { ...blank, chapters: blank.chapters.map((c, i) => (i === 0 ? { ...c, title: "Другое название" } : c)) }],
      "эпиграф главы своей книги": [blank, { ...blank, chapters: blank.chapters.map((c, i) => (i === 1 ? { ...c, epigraph: "Другой эпиграф" } : c)) }],
      "порядок глав своей книги": [blank, { ...blank, chapters: [blank.chapters[1], blank.chapters[0], ...blank.chapters.slice(2)].map((c, position) => ({ ...c, position })) }],
      "название пустой главы (в книгу не попадает)": [blank, { ...blank, chapters: blank.chapters.map((c) => (c.title === "Пока пустая глава" ? { ...c, title: "Всё ещё пустая" } : c)) }],
      "кто записал (автобиография)": [auto, { ...auto, book: { ...auto.book, recordedBy: "сын Ерлан" } }],
    };
    expect(Object.fromEntries(Object.entries(changes).map(([name, [a, b]]) => [name, contentFingerprint(a) !== contentFingerprint(b)]))).toEqual({
      "название главы своей книги": true,
      "эпиграф главы своей книги": true,
      "порядок глав своей книги": true,
      "название пустой главы (в книгу не попадает)": false,
      "кто записал (автобиография)": true,
    });
  });

  it("меняется с наступлением нового года: год печати входит в содержимое", () => {
    const before = contentFingerprint(bundle());
    vi.setSystemTime(new Date("2027-01-02T12:00:00Z"));
    expect(contentFingerprint(bundle())).not.toBe(before);
  });
});
