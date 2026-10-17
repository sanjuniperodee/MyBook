import { coverPhotoSlots, getCoverTemplate } from "@/lib/book/covers";
import { getFormat, print } from "@/lib/book/formats";
import { effectiveDpi, photoAreaMm } from "@/lib/book/layout";
import { bookKind, progressOf } from "@/lib/content/kinds";
import type { BookStats } from "./stats";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";

export interface ReadinessIssue {
  level: "error" | "warning";
  text: string;
  href?: string;
}

type ReadinessBook = { id: string; theme: string; coverTemplate: string; coverPhotoId: string | null; coverPhotoExtra: string[]; authorName: string; format: string };
type ReadinessPhoto = { width: number; height: number; layout: "full" | "bleed" | "half" | "grid" };

/** Готова ли книга к печати: ошибки блокируют заказ, предупреждения — подсказки. */
export function checkReadiness(book: ReadinessBook, stats: BookStats, photos: ReadinessPhoto[], locale: Locale = "ru"): ReadinessIssue[] {
  const t = messagesFor(locale).books.readiness;
  const issues: ReadinessIssue[] = [];
  const base = `/books/${book.id}`;
  const kind = bookKind(book.theme);
  const progress = progressOf(kind, stats);
  if (stats.answered === 0) issues.push({ level: "error", text: kind === "blank" ? t.noText : t.noAnswers, href: `${base}/questions` });
  const template = getCoverTemplate(book.coverTemplate);
  const slots = coverPhotoSlots(template);
  const chosen = [book.coverPhotoId, ...book.coverPhotoExtra.slice(0, slots - 1)].filter(Boolean).length;
  if (slots && chosen < slots) issues.push({ level: "error", text: t.coverPhoto(messagesFor(locale).catalog.covers[template.id] ?? template.id, slots), href: `${base}/cover` });
  if (!book.authorName.trim()) issues.push({ level: "warning", text: kind === "autobiography" ? t.narratorName : t.authorName, href: `${base}/cover` });
  // «Короткая» — по тем же порогам, что шаг «Текст» на хабе и воронка CRM (progressOf): ответы, у своей книги — слова.
  if (progress.short) issues.push({ level: "warning", text: kind === "blank" ? t.shortWords(stats.words) : t.short(stats.answered), href: `${base}/questions` });
  // Пустые главы своей книги в печать не попадают: автор создаёт главы осознанно и может не заметить, что одна исчезнет.
  if (kind === "blank" && stats.emptyChapters > 0) issues.push({ level: "warning", text: t.emptyChapters(stats.emptyChapters), href: `${base}/questions` });
  if (stats.estimatedPages < print.minPages)
    issues.push({ level: "warning", text: t.minPages(print.minPages) });
  const format = getFormat(book.format);
  const lowRes = photos.filter((p) => effectiveDpi(p, photoAreaMm(format, p.layout), p.layout === "bleed" ? "cover" : "contain") < 150);
  if (lowRes.length)
    issues.push({ level: "warning", text: t.lowRes(lowRes.length), href: `${base}/photos` });
  return issues;
}
