import type { z } from "zod";
import type { WebBookHubResponse, WebBookRow, WebSpreadSample } from "@mybook/contracts";
import { isLocale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { nowMs } from "@/lib/dates";
import { deadlineFor, getOccasion, parseDay } from "@/lib/occasions";
import type { PhotoPlace } from "@/lib/book/photo-place";
import type { bookSpreadSample } from "@/lib/book/spread-sample";
import type { books } from "@/shared/infrastructure/db/schema";

/**
 * Чистые преобразования базовой записи книги, мест фото и баннера срока — общие для v1-local-bridge-book.ts
 * (без статических импортов @/modules/*), authoring/ui и бэкенда на Nest (ADR 0014).
 */

type BookSchemaRow = typeof books.$inferSelect;
export type WebBookRowDto = z.output<typeof WebBookRow>;
export type WebBookHubDeadlineDto = z.output<typeof WebBookHubResponse>["deadline"];
export type WebSpreadSampleDto = z.output<typeof WebSpreadSample>;

/** Сколько ответов считаем «полноценной книгой» для расчёта темпа (как DeadlineBanner). */
const GOOD_BOOK_ANSWERS = 30;

const toIsoOrEpoch = (d: Date | string | null | undefined): string =>
  d instanceof Date ? d.toISOString() : typeof d === "string" ? d : new Date(0).toISOString();

export const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export const asRecordOrNull = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

export const placesToEntries = (places: ReadonlyMap<string, PhotoPlace>) =>
  [...places.entries()].map(([id, place]) => ({ id, place }));

export const entriesToPlacePairs = (entries: readonly { id: string; place: PhotoPlace }[]): [string, PhotoPlace][] =>
  entries.map((e) => [e.id, e.place]);

export function normalizeSpreadSample(raw: ReturnType<typeof bookSpreadSample>): WebSpreadSampleDto {
  return {
    ...raw,
    toc: raw.toc.map((l) => ({ ...l })),
    ...(raw.captions ? { captions: [...raw.captions] } : {}),
  };
}

export function toWebBookRow(book: BookSchemaRow): WebBookRowDto {
  return {
    id: book.id,
    userId: book.userId,
    theme: book.theme,
    status: book.status,
    title: book.title,
    subtitle: book.subtitle,
    authorName: book.authorName,
    authorGender: book.authorGender,
    recordedBy: book.recordedBy,
    recipientName: book.recipientName,
    recipientGender: book.recipientGender,
    namesOnCover: book.namesOnCover,
    hideRecipientOnCover: book.hideRecipientOnCover,
    coverLines: book.coverLines,
    coverTemplate: book.coverTemplate,
    coverPhotoId: book.coverPhotoId ?? null,
    coverPhotoExtra: Array.isArray(book.coverPhotoExtra) ? book.coverPhotoExtra : [],
    backText: book.backText,
    backLayout: book.backLayout,
    backPhotoId: book.backPhotoId ?? null,
    backPhotoExtra: Array.isArray(book.backPhotoExtra) ? book.backPhotoExtra : [],
    photoFrames: (book.photoFrames && typeof book.photoFrames === "object" && !Array.isArray(book.photoFrames)
      ? book.photoFrames
      : {}) as WebBookRowDto["photoFrames"],
    dedication: book.dedication,
    interior: book.interior,
    interiorStyle: asRecord(book.interiorStyle),
    coverDesign: asRecordOrNull(book.coverDesign),
    coverBack: asRecordOrNull(book.coverBack),
    format: book.format,
    photoPlacement: book.photoPlacement,
    showToc: book.showToc,
    tocMode: book.tocMode,
    tocLines: (book.tocLines && typeof book.tocLines === "object" && !Array.isArray(book.tocLines)
      ? book.tocLines
      : {}) as WebBookRowDto["tocLines"],
    layoutRev: book.layoutRev,
    paginationRev: book.paginationRev,
    inviteToken: book.inviteToken ?? null,
    inviteText: book.inviteText,
    endText: book.endText ?? null,
    chapterStart: book.chapterStart,
    titlePage: book.titlePage,
    language: isLocale(book.language) ? book.language : "ru",
    occasion: book.occasion ?? null,
    occasionDate: book.occasionDate ?? null,
    createdAt: toIsoOrEpoch(book.createdAt),
    updatedAt: toIsoOrEpoch(book.updatedAt),
  };
}

export function fromWebBookRow(dto: WebBookRowDto): BookSchemaRow {
  return {
    ...dto,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}

/** Срок к празднику для обзора книги — те же строки, что DeadlineBanner. */
export function buildHubDeadline(occasion: string | null, occasionDate: string | null, answered: number, m: Messages, now: Date = new Date(nowMs())): WebBookHubDeadlineDto {
  const o = getOccasion(occasion);
  if (!o || !occasionDate) return null;
  const c = m.common;
  const dl = deadlineFor(occasionDate, now);
  if (dl.state === "past") return null;
  const left = Math.max(0, GOOD_BOOK_ANSWERS - answered);
  const perDay = left && dl.daysToOrder > 0 ? Math.ceil(left / dl.daysToOrder) : 0;
  const tone = dl.state === "relaxed" ? "calm" : dl.state === "soon" ? "warm" : "hot";
  const line =
    dl.state === "digital"
      ? c.deadline.digital
      : dl.state === "premium"
        ? c.deadline.premium(dl.orderByPremium)
        : `${c.deadline.orderBy(dl.orderBy, dl.daysToOrder)}${perDay ? c.deadline.pace(perDay) : ""}`;
  return {
    days: dl.daysToTarget,
    daysShort: c.daysShort,
    tone,
    headline: c.deadline.headline(c.occasions[o.id].label, parseDay(occasionDate), dl.daysToTarget),
    line,
    icon: dl.state === "digital" ? null : dl.state === "premium" ? "zap" : "clock",
    changeLabel: c.deadline.changeDate,
  };
}
