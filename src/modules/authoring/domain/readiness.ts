import { coverPhotoSlots, getCoverTemplate } from "@/lib/book/covers";
import { getFormat, print } from "@/lib/book/formats";
import { effectiveDpi, photoAreaMm } from "@/lib/book/layout";
import type { BookStats } from "./stats";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";

export interface ReadinessIssue {
  level: "error" | "warning";
  text: string;
  href?: string;
}

type ReadinessBook = { id: string; coverTemplate: string; coverPhotoId: string | null; coverPhotoExtra: string[]; authorName: string; format: string };
type ReadinessPhoto = { width: number; height: number; layout: "full" | "bleed" | "half" | "grid" };

/** Готова ли книга к печати: ошибки блокируют заказ, предупреждения — подсказки. */
export function checkReadiness(book: ReadinessBook, stats: BookStats, photos: ReadinessPhoto[], locale: Locale = "ru"): ReadinessIssue[] {
  const t = messagesFor(locale).books.readiness;
  const issues: ReadinessIssue[] = [];
  const base = `/books/${book.id}`;
  if (stats.answered === 0) issues.push({ level: "error", text: t.noAnswers, href: `${base}/questions` });
  const template = getCoverTemplate(book.coverTemplate);
  const slots = coverPhotoSlots(template);
  const chosen = [book.coverPhotoId, ...book.coverPhotoExtra.slice(0, slots - 1)].filter(Boolean).length;
  if (slots && chosen < slots) issues.push({ level: "error", text: t.coverPhoto(messagesFor(locale).catalog.covers[template.id] ?? template.id, slots), href: `${base}/cover` });
  if (!book.authorName.trim()) issues.push({ level: "warning", text: t.authorName, href: `${base}/cover` });
  if (stats.answered > 0 && stats.answered < 10)
    issues.push({ level: "warning", text: t.short(stats.answered), href: `${base}/questions` });
  if (stats.estimatedPages < print.minPages)
    issues.push({ level: "warning", text: t.minPages(print.minPages) });
  const format = getFormat(book.format);
  const lowRes = photos.filter((p) => effectiveDpi(p, photoAreaMm(format, p.layout), p.layout === "bleed" ? "cover" : "contain") < 150);
  if (lowRes.length)
    issues.push({ level: "warning", text: t.lowRes(lowRes.length), href: `${base}/photos` });
  return issues;
}
