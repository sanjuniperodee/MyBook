import { z } from "zod";
import type {
  WebAnswerFilePage,
  WebGiftStatus,
  WebLetterInvite,
  WebRedeemCheck,
  WebReviewPage,
  WebReviewsShowcase,
} from "@mybook/contracts";
import { isLocale, type Locale } from "@/i18n/config";
import type { GiftStatus } from "@/shared/domain/orders";
import { CITY_MAX, NAME_MAX, RATING_MAX, TEXT_MAX, type ReviewStatus } from "@/shared/domain/reviews";

/**
 * Общие чистые правила, схемы и отображение ответов Контекста 3 («Публичное и маркетинг»):
 * без next/*, БД и @nestjs/* — используются и в mybook-api / обработчиках сайта, и в бэкенде на Nest (ADR 0014).
 */

type Dto<T extends z.ZodType> = z.output<T>;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const INVITE_CODE_RE = /^[A-Za-z0-9_-]{3,40}$/;
export const GIFT_CLAIM_TOKEN_RE = /^[\w-]{16,64}$/;
export const LETTER_INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{10,40}$/;
export const VISITOR_TOKEN_RE = /^[\w-]{20,64}$/;

/** Фото отзыва до 15 МБ плюс поля формы; больше — 413 до чтения тела в память. */
export const REVIEW_SUBMIT_BODY_MAX = 16 * 1024 * 1024;

export const INVITE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
export const SOURCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 60;
export const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

/** Схема отправки письма близких по ссылке-приглашению (POST /api/letters/{token}). */
export const letterSubmitSchema = z.object({
  authorName: z.string().trim().min(1, "letterName").max(80),
  relation: z.string().trim().max(80).default(""),
  text: z.string().trim().min(10, "letterShort").max(8000, "letterLong"),
  website: z.string().max(0).optional(), // ловушка для ботов
});

/** Схема полей multipart-формы отзыва к заказу (POST /api/reviews/{orderId}). */
export const reviewSubmitFormSchema = z.object({
  rating: z.coerce.number().int().min(1).max(RATING_MAX),
  text: z.string().max(TEXT_MAX),
  authorName: z.string().trim().min(1, "reviewInvalid").max(NAME_MAX),
  city: z.string().max(CITY_MAX),
  consent: z.enum(["0", "1"]).transform((v) => v === "1"),
});

/** Схема «Перезвоните мне» из виджета на сайте (POST /api/chat/callback). */
export const siteCallbackSchema = z.object({
  name: z.string().trim().max(80).default(""),
  phone: z.string().trim().max(30),
  comment: z.string().trim().max(500).optional(),
  page: z.string().max(200).optional(),
});

/** Схема сообщения посетителя в онлайн-чате на сайте (POST /api/chat). */
export const siteChatPostSchema = z.object({
  text: z.string().trim().min(1, "widgetText").max(2000),
  name: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  page: z.string().max(200).optional(),
});

export type PublicPlanId = "digital" | "hardcover" | "premium";

function toPlanId(raw: string): PublicPlanId {
  if (raw === "digital" || raw === "hardcover" || raw === "premium") return raw;
  throw new Error(`Unknown gift plan: ${raw}`);
}

function toLocale(raw: string): Locale {
  return isLocale(raw) ? raw : "ru";
}

export const toIsoDate = (d: Date | string | null | undefined): string | null =>
  d instanceof Date ? d.toISOString() : typeof d === "string" ? d : null;

// ─── Входные структуры и мапперы публичных DTO ─────────────────────────────────────────────────────────────

export interface PublicAnswerFileData {
  file: {
    kind: string;
    status: string;
    hasPoster: boolean;
    width: number | null;
    height: number | null;
    durationSec: number | null;
  };
  bookTitle: string;
  authorName: string;
  caption: string;
}

export function toPublicAnswerFileDto(found: PublicAnswerFileData | null): Dto<typeof WebAnswerFilePage> {
  if (!found) return { found: null };
  const f = found.file;
  const kind: "video" | "audio" = f.kind === "audio" ? "audio" : "video";
  return {
    found: {
      file: {
        kind,
        status: f.status,
        hasPoster: !!f.hasPoster,
        width: f.width ?? null,
        height: f.height ?? null,
        durationSec: f.durationSec ?? null,
      },
      bookTitle: found.bookTitle,
      authorName: found.authorName,
      caption: found.caption,
    },
  };
}

export interface ShowcaseReviewItem {
  id: string;
  rating: number;
  text: string;
  authorName: string;
  city: string;
  theme: string;
  locale: string;
  photo: { width: number; height: number } | null;
  publishedAt: Date | string | null;
}

export function toReviewsShowcaseDto(
  reviews: readonly ShowcaseReviewItem[],
  summary: { count: number; average: number } | null,
): Dto<typeof WebReviewsShowcase> {
  return {
    reviews: reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      text: r.text,
      authorName: r.authorName,
      city: r.city,
      theme: r.theme,
      locale: r.locale,
      photo: r.photo,
      publishedAt: toIsoDate(r.publishedAt),
    })),
    summary: summary ? { count: summary.count, average: summary.average } : null,
  };
}

export type GiftPaymentView = NonNullable<Dto<typeof WebGiftStatus>["payment"]>;

export interface GiftStatusSource {
  id: string;
  number: number;
  token: string;
  status: GiftStatus;
  plan: string;
  amount: number;
  currency: string;
  locale: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  recipientName: string;
  recipientEmail: string | null;
  message: string;
  sendAt: string | null;
  sentAt: Date | string | null;
  paymentClaimedAt: Date | string | null;
  promo?: { code: string; usedCount: number; expiresAt: Date | string | null } | null;
}

export function toGiftStatusDto(
  gift: GiftStatusSource,
  payment: GiftPaymentView | null,
  redeemLink: string | null,
): Dto<typeof WebGiftStatus> {
  const paid = gift.status === "paid" && !!gift.promo;
  return {
    id: gift.id,
    number: gift.number,
    token: gift.token,
    status: gift.status,
    plan: toPlanId(gift.plan),
    amount: gift.amount,
    currency: gift.currency,
    locale: toLocale(gift.locale),
    buyerName: gift.buyerName,
    buyerEmail: gift.buyerEmail,
    recipientName: gift.recipientName,
    recipientEmail: gift.recipientEmail,
    message: gift.message,
    sendAt: gift.sendAt,
    sentAt: toIsoDate(gift.sentAt),
    paymentClaimedAt: toIsoDate(gift.paymentClaimedAt),
    promo: paid && gift.promo ? { code: gift.promo.code, usedCount: gift.promo.usedCount, expiresAt: toIsoDate(gift.promo.expiresAt) } : null,
    redeemUrl: paid ? redeemLink : null,
    payment,
  };
}

export type RedeemCheckSource =
  | { ok: true; promo: { id: string; code: string; kind: "percent" | "fixed"; value: number; label: string } }
  | { ok: false; error: string };

export interface RedeemGiftSource {
  locale: string;
  plan: string;
  recipientName: string;
  buyerName: string;
  message: string;
}

export function toRedeemCheckDto(check: RedeemCheckSource, gift: RedeemGiftSource | null): Dto<typeof WebRedeemCheck> {
  if (!check.ok) return { check: { ok: false, error: check.error }, gift: null };
  const { code, kind, value, label } = check.promo;
  return {
    check: { ok: true, code, kind, value, label },
    gift: gift
      ? {
          locale: toLocale(gift.locale),
          plan: toPlanId(gift.plan),
          recipientName: gift.recipientName,
          buyerName: gift.buyerName,
          message: gift.message,
        }
      : null,
  };
}

export interface LetterInviteSource {
  status: string;
  theme: string;
  title: string;
  authorName: string;
  recipientName: string;
  inviteText: string;
  coverTemplate: string;
  coverLines: boolean;
  format: string;
}

export function toLetterInviteDto(book: LetterInviteSource): Dto<typeof WebLetterInvite> {
  return {
    status: book.status,
    theme: book.theme,
    title: book.title,
    authorName: book.authorName,
    recipientName: book.recipientName,
    inviteText: book.inviteText,
    coverTemplate: book.coverTemplate,
    coverLines: book.coverLines,
    format: book.format,
  };
}

export interface ReviewPageDetailsSource {
  number: number;
  book: {
    theme: string;
    title: string;
    coverTemplate: string;
    coverLines: boolean;
    format: string;
    authorName: string;
    recipientName: string;
    hideRecipientOnCover: boolean;
    namesOnCover: string;
  };
}

export interface ReviewPageSnapshot {
  rating: number;
  text: string;
  authorName: string;
  city: string;
  consent: boolean;
  photo: { width: number; height: number } | null;
  status: ReviewStatus;
  thankYouCode: string | null;
}

export interface ReviewPageStateSource {
  order: { name: string };
  review: { snapshot(): ReviewPageSnapshot } | null;
}

export function toReviewPageDto(details: ReviewPageDetailsSource, state: ReviewPageStateSource | null): Dto<typeof WebReviewPage> {
  const b = details.book;
  const review = state?.review?.snapshot() ?? null;
  return {
    number: details.number,
    book: {
      theme: b.theme,
      title: b.title,
      coverTemplate: b.coverTemplate,
      coverLines: b.coverLines,
      format: b.format,
      authorName: b.authorName,
      recipientName: b.recipientName,
      hideRecipientOnCover: b.hideRecipientOnCover,
      namesOnCover: b.namesOnCover,
    },
    state: state
      ? {
          defaultName: state.order.name,
          review: review
            ? {
                rating: review.rating,
                text: review.text,
                authorName: review.authorName,
                city: review.city,
                consent: review.consent,
                hasPhoto: !!review.photo,
                status: review.status,
                thankYouCode: review.thankYouCode,
              }
            : null,
        }
      : null,
  };
}

export interface GiftPdfData {
  gift: { status: GiftStatus; locale: Locale; number: number };
  pdf: Uint8Array;
}

export interface ReviewPhotoRecord {
  key: string;
  published: boolean;
  userId: string;
}

export interface SubmittedReviewResult {
  status: ReviewStatus;
  thankYouCode: string | null;
  hasPhoto: boolean;
}

export interface SiteChatMessageDto {
  id: string;
  mine: boolean;
  text: string;
  at: string;
}

// ─── Cookie и редиректы (совпадение байт в байт с @edge-runtime/cookies в NextResponse) ────────────────────

export interface SetCookieOptions {
  path?: string;
  maxAge?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "lax" | "strict" | "none";
}

/**
 * Сериализация заголовка Set-Cookie в точном формате ResponseCookies из Next / mybook-api
 * (`Path`, `Expires`, `Max-Age`, `Secure`, `HttpOnly`, `SameSite`, `encodeURIComponent(value)`).
 */
export function serializeSetCookie(name: string, value: string, opts: SetCookieOptions, nowMs = Date.now()): string {
  const attrs = [
    opts.path ? `Path=${opts.path}` : "",
    typeof opts.maxAge === "number" ? `Expires=${new Date(nowMs + opts.maxAge * 1000).toUTCString()}` : "",
    typeof opts.maxAge === "number" ? `Max-Age=${opts.maxAge}` : "",
    opts.secure ? "Secure" : "",
    opts.httpOnly ? "HttpOnly" : "",
    opts.sameSite ? `SameSite=${opts.sameSite}` : "",
  ].filter(Boolean);
  const pair = `${name}=${encodeURIComponent(value)}`;
  return attrs.length ? `${pair}; ${attrs.join("; ")}` : pair;
}

export function buildInviteSourceCookie(campaign: string, now = new Date()): string {
  return JSON.stringify({
    source: "invite",
    medium: "referral",
    campaign,
    landing: "/r",
    at: now.toISOString().slice(0, 10),
  });
}

export function hasCookieNamed(cookieHeader: string | null, name: string): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.split(";").some((c) => c.trim().startsWith(`${name}=`));
}
