import "server-only";
import type { Book, Photo } from "./db/schema";
import type { BookStats } from "./books";
import { getCoverTemplate } from "./book/covers";
import { getFormat, print } from "./book/formats";
import { effectiveDpi, photoAreaMm } from "./book/layout";

export interface ReadinessIssue {
  level: "error" | "warning";
  text: string;
  href?: string;
}

export function checkReadiness(book: Book, stats: BookStats, photos: Photo[]): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const base = `/books/${book.id}`;
  if (stats.answered === 0) issues.push({ level: "error", text: "В книге пока нет ни одного ответа.", href: `${base}/questions` });
  if (getCoverTemplate(book.coverTemplate).requiresPhoto && !book.coverPhotoId)
    issues.push({ level: "error", text: "Для обложки «Ваше фото» нужно выбрать фотографию.", href: `${base}/cover` });
  if (!book.authorName.trim()) issues.push({ level: "warning", text: "Не указано ваше имя на обложке.", href: `${base}/cover` });
  if (stats.answered > 0 && stats.answered < 10)
    issues.push({ level: "warning", text: `Заполнено всего ${stats.answered} ответов — книга получится совсем короткой.`, href: `${base}/questions` });
  if (stats.estimatedPages < print.minPages)
    issues.push({ level: "warning", text: `Минимальный объём печатной книги — ${print.minPages} страниц. Недостающие страницы останутся чистыми (их можно использовать для записей от руки).` });
  const format = getFormat(book.format);
  const lowRes = photos.filter((p) => effectiveDpi(p, photoAreaMm(format, p.layout), p.layout === "bleed" ? "cover" : "contain") < 150);
  if (lowRes.length)
    issues.push({ level: "warning", text: `${lowRes.length} фото с низким разрешением могут напечататься нечётко.`, href: `${base}/photos` });
  return issues;
}
