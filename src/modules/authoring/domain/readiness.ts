import { coverPhotoSlots, getCoverTemplate } from "@/lib/book/covers";
import { getFormat, print } from "@/lib/book/formats";
import { effectiveDpi, isChapterPhotoKey, photoAreaMm, type BookContent } from "@/lib/book/layout";
import { photoLosses, WARN_LOSS } from "@/lib/book/photo-loss";
import { tocKey, type TocLines } from "@/lib/book/toc";
import { bookKind, progressOf } from "@/lib/content/kinds";
import type { BookStats } from "./stats";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";

export interface ReadinessIssue {
  level: "error" | "warning";
  text: string;
  href?: string;
}

/** tocLines — решение автора «без фото» у главы (noOpenerPhoto): сборка книги его не несёт. */
type ReadinessBook = { id: string; theme: string; coverTemplate: string; coverPhotoId: string | null; coverPhotoExtra: string[]; authorName: string; format: string; tocLines?: TocLines | null };
type ReadinessPhoto = { width: number; height: number; layout: "full" | "bleed" | "half" | "grid" };
/**
 * Собранная книга (buildBookContent: оформление, формат, оглавление, правила раскладки и места фото — та же сборка,
 * что у PDF): фото глав и обрезка фото на их местах. Нет — эти две проверки не делаются.
 */
export type ReadinessContent = Pick<BookContent, "chapters" | "galleryPhotos" | "format" | "interior">;

/** Готова ли книга к печати: ошибки блокируют заказ, предупреждения — подсказки. */
export function checkReadiness(book: ReadinessBook, stats: BookStats, photos: ReadinessPhoto[], locale: Locale = "ru", content?: ReadinessContent): ReadinessIssue[] {
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
  if (content) issues.push(...photoPlaceIssues(book, content, locale));
  return issues;
}

/**
 * Предупреждения о местах фото (не блокируют заказ): главы без фото в оформлении с фото главы — кроме тех, где автор
 * решил «без фото» (ссылка — на первый ответ первой такой главы), и фото с сильной обрезкой на своём месте (≥ WARN_LOSS).
 */
function photoPlaceIssues(book: ReadinessBook, content: ReadinessContent, locale: Locale): ReadinessIssue[] {
  const m = messagesFor(locale);
  const t = m.books.readiness;
  const base = `/books/${book.id}`;
  const out: ReadinessIssue[] = [];
  if (content.interior.opener.photo) {
    const lines = book.tocLines ?? {};
    const missing = content.chapters.filter((ch) => isChapterPhotoKey(ch.key) && !ch.openerPhoto && !lines[tocKey.chapter(ch.key)]?.noOpenerPhoto);
    const first = missing[0]?.items[0]?.id;
    if (missing.length) out.push({ level: "warning", text: t.missingOpeners(missing.length, m.catalog.interiors[content.interior.id]?.name ?? content.interior.id), href: first ? `${base}/questions?s=${first}` : `${base}/questions` });
  }
  const cropped = [...photoLosses(content).values()].filter((loss) => loss >= WARN_LOSS).length;
  if (cropped) out.push({ level: "warning", text: t.heavyCrop(cropped), href: `${base}/photos?filter=crop` });
  return out;
}
