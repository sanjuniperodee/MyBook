import "server-only";
import type { Book, Photo } from "./db/schema";
import type { BookStats } from "./books";
import { getCoverTemplate } from "./book/covers";
import { getFormat, print } from "./book/formats";
import { effectiveDpi, photoAreaMm } from "./book/layout";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";

export interface ReadinessIssue {
  level: "error" | "warning";
  text: string;
  href?: string;
}

export function checkReadiness(book: Book, stats: BookStats, photos: Photo[], locale: Locale = "ru"): ReadinessIssue[] {
  const t = messagesFor(locale).books.readiness;
  const issues: ReadinessIssue[] = [];
  const base = `/books/${book.id}`;
  if (stats.answered === 0) issues.push({ level: "error", text: t.noAnswers, href: `${base}/questions` });
  if (getCoverTemplate(book.coverTemplate).requiresPhoto && !book.coverPhotoId)
    issues.push({ level: "error", text: t.coverPhoto, href: `${base}/cover` });
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
