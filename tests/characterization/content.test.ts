import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LETTERS_CHAPTER, toPhotoItem, type BookContent, type PhotoItem } from "@/lib/book/layout";
import { buildBookContent } from "@/lib/book/book-content";
import { fixtureBook, fixtureVariants } from "../fixtures/books";
import { characterizationBooks, contentOf, fixtureNames, YEAR } from "./books";

/**
 * Характеристика buildBookContent: что попадает в книгу, в каком порядке и куда уходят фото.
 * Длинные тексты в снимке книги — длиной и хешем, целиком они в снимке «тексты для печати» (один на язык:
 * тексты не зависят от оформления и формата). Оформление и формат — по id, фото — именем, раскладкой и подписью.
 */

const digest = (text: string) => `${text.length} зн. #${createHash("sha256").update(text).digest("hex").slice(0, 8)}`;
const indent = (text: string) => text.replace(/^/gm, "      ");

function describeContent(c: BookContent, names: Map<string, string>, fullText = false): string {
  const photo = (p: PhotoItem) => [names.get(p.id), p.layout, p.caption && `«${p.caption}»`].filter(Boolean).join(" ");
  const text = (s: string) => (!fullText ? ` · ${digest(s)}` : s ? `:\n${indent(s)}` : " · без текста");
  const lines = [
    `${c.language} · ${c.format.id} · ${c.interior.id} · год ${c.year} · оглавление: ${c.showToc ? "да" : "нет"}`,
    `«${c.title}» / «${c.subtitle}» · ${c.authorName} → ${c.recipientName}`,
    `посвящение: «${c.dedication}»`,
  ];
  // Подписи по виду книги — только у автобиографии и своей книги: снимки книг-подарков от новых полей не меняются
  // (у подарков они проверяются отдельно — «подписи книги-подарка»).
  if (c.kind !== "gift") lines.push(`вид: ${c.kind} · галерея «${c.galleryTitle}» · записано со слов: «${c.recordedBy}»`);
  for (const ch of c.chapters) {
    lines.push(`${ch.number}. ${ch.key} «${ch.title}»${ch.epigraph ? ` · эпиграф «${ch.epigraph}»` : ""}`);
    for (const it of ch.items) {
      const photos = it.photos?.length ? ` · в ответе: ${it.photos.map(photo).join(", ")}` : "";
      lines.push(`  ${names.get(it.id)} ${it.heading === null ? "без заголовка" : `«${it.heading}»`}${photos}${text(it.answer)}`);
    }
    if (ch.openerPhoto) lines.push(`  начальная полоса: ${photo(ch.openerPhoto)}`);
    if (ch.photos.length) lines.push(`  фотостраницы: ${ch.photos.map(photo).join(", ")}`);
  }
  lines.push(`галерея: ${c.galleryPhotos.map(photo).join(", ") || "—"}`);
  return lines.join("\n");
}

const keysOf = (objects: object[]) => [...new Set(objects.flatMap((o) => Object.keys(o)))].sort();

describe("buildBookContent: структура книги", () => {
  it("снимок описывает все поля содержимого, фото переносятся как есть", () => {
    // Новое поле в BookContent — повод дописать describeContent, иначе снимок его не увидит.
    const { book, questions, photos, letters } = fixtureBook("photobook", "a5", "ru").bundle;
    const input = photos.map(toPhotoItem);
    const c = buildBookContent(book, questions, input, [], YEAR, letters);
    const items = c.chapters.flatMap((ch) => ch.items);
    expect(keysOf([c])).toEqual(["authorName", "chapters", "dedication", "format", "galleryPhotos", "galleryTitle", "interior", "kind", "language", "recipientName", "recordedBy", "showToc", "subtitle", "title", "year"]);
    expect(keysOf(c.chapters)).toEqual(["epigraph", "items", "key", "number", "openerPhoto", "photos", "title"]);
    expect(keysOf(items)).toEqual(["answer", "heading", "id", "photos"]);
    // Фото в содержимом — те же объекты, что на входе (toPhotoItem), поэтому в снимке их достаточно назвать.
    // Каждое — по одному разу, кроме фото обложки.
    const placed = [...c.chapters.flatMap((ch) => [...ch.photos, ...(ch.openerPhoto ? [ch.openerPhoto] : [])]), ...items.flatMap((it) => it.photos ?? []), ...c.galleryPhotos];
    expect(new Set(placed).size).toBe(input.length - 1);
    expect(placed).toHaveLength(input.length - 1);
    expect(placed.every((p) => input.includes(p))).toBe(true);
  });

  it("подписи книги-подарка: вид gift, галерея — «Наши моменты» на языке книги, строки «записано со слов» нет", () => {
    for (const fb of characterizationBooks().filter((b) => b.bundle.book.theme !== "autobiography" && b.bundle.book.theme !== "blank")) {
      const c = contentOf(fb);
      expect([fb.key, c.kind, c.galleryTitle, c.recordedBy]).toEqual([fb.key, "gift", c.language === "kk" ? "Біздің сәттеріміз" : "Наши моменты", ""]);
    }
  });

  it("статус письма не проверяется: неодобренное письмо в бандле печатается — отбор только в queries.approvedLetters", () => {
    const fb = fixtureVariants().find((v) => v.key === "gender")!;
    const letters = contentOf(fb).chapters.find((ch) => ch.key === LETTERS_CHAPTER)?.items ?? [];
    expect(fb.bundle.letters?.map((l) => l.status)).toEqual(["approved", "pending"]);
    expect(letters.map((it) => fixtureNames(fb).get(it.id))).toEqual(["letter0", "letter1"]);
  });

  it.each(characterizationBooks().map((fb) => [fb.key, fb] as const))("%s", (_, fb) => {
    expect(describeContent(contentOf(fb), fixtureNames(fb))).toMatchSnapshot();
  });
});

describe("buildBookContent: тексты для печати", () => {
  it.each(["ru", "kk"] as const)("%s", (language) => {
    const fb = fixtureBook("classic", "a5", language);
    expect(describeContent(contentOf(fb), fixtureNames(fb), true)).toMatchSnapshot();
  });
});
