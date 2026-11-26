import "server-only";
import type { z } from "zod";
import type {
  WebGiftCreateBody,
  WebGiftCreated,
  WebGiftStatus,
  WebInviteWelcome,
  WebLetterInvite,
  WebRedeemCheck,
  WebReviewPage,
  WebReviewsShowcase,
  WebSiteCatalog,
  WebSiteChrome,
} from "@mybook/contracts";
import { env } from "@/config/env";
import { site } from "@/config/site";
import type { Messages } from "@/i18n/messages";

/**
 * Публичные страницы сайта (ADR 0012, A5 — Раздел 4, section: "public"): одни сборщики данных для страниц Next (local)
 * и обработчиков mybook-api (apps/api/src/routes/web-public.ts). Модули с БД — только динамическим импортом и одним
 * общим промисом на процесс: сайт без БД (Vercel) их не грузит, а одновременные первые вызовы (strict-сверка зовёт
 * local и API разом) получают один и тот же экземпляр модуля.
 */
let containerModule: Promise<typeof import("./container")> | undefined;
let catalogModule: Promise<typeof import("./catalog")> | undefined;
let requisitesModule: Promise<typeof import("./requisites")> | undefined;
let kaspiViewModule: Promise<typeof import("./kaspi-view")> | undefined;
let reviewsModule: Promise<typeof import("./reviews")> | undefined;
const loadContainer = () => (containerModule ??= import("./container"));
const loadCatalog = () => (catalogModule ??= import("./catalog"));
const loadRequisites = () => (requisitesModule ??= import("./requisites"));
const loadKaspiView = () => (kaspiViewModule ??= import("./kaspi-view"));
const loadReviews = () => (reviewsModule ??= import("./reviews"));

type Dto<T extends z.ZodType> = z.output<T>;
const iso = (d: Date | string | null | undefined): string | null => (d instanceof Date ? d.toISOString() : typeof d === "string" ? d : null);

// ─── Каталог, подвал, отзывы, приглашение ──────────────────────────────────────────────────────────────────

export async function localSiteCatalog(): Promise<Dto<typeof WebSiteCatalog>> {
  return (await loadCatalog()).readCatalogSettings();
}

export async function localSiteChrome(): Promise<Dto<typeof WebSiteChrome>> {
  const { container } = await loadContainer();
  const c = container();
  const [widget, digits] = await Promise.all([
    c.messaging.widgetConfig().catch(() => null),
    c.marketing.service.shopWhatsapp().catch(() => site.contacts.whatsapp.replace(/\D/g, "")),
  ]);
  return { widget: widget ? { enabled: widget.enabled, chat: widget.chat, whatsapp: widget.whatsapp } : null, shopWhatsappDigits: digits };
}

export async function localReviewsShowcase(limit: number, theme?: string): Promise<Dto<typeof WebReviewsShowcase>> {
  const { reviews, summary } = await (await loadReviews()).siteReviewsLocal(limit, theme);
  return {
    reviews: reviews.map((r) => ({ id: r.id, rating: r.rating, text: r.text, authorName: r.authorName, city: r.city, theme: r.theme, locale: r.locale, photo: r.photo, publishedAt: iso(r.publishedAt) })),
    summary: summary ? { count: summary.count, average: summary.average } : null,
  };
}

export async function localInviteWelcome(code: string): Promise<Dto<typeof WebInviteWelcome>> {
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(code)) return { welcome: null };
  const { container } = await loadContainer();
  return { welcome: await container().referrals.service.welcome(code) };
}

// ─── Сертификат: страница, покупка, «Я оплатил(а)», активация кода ──────────────────────────────────────────

export async function localGiftStatus(token: string, m: Messages): Promise<Dto<typeof WebGiftStatus> | null> {
  const [{ container }, { isOnlinePayment, redeemUrl }] = await Promise.all([loadContainer(), import("@/modules/ordering")]);
  const gift = await container().ordering.queries.giftByToken(token);
  if (!gift) return null;
  const paid = gift.status === "paid" && !!gift.promo;
  let payment: Dto<typeof WebGiftStatus>["payment"] = null;
  if (gift.status === "pending_payment") {
    const [{ kaspiPaymentProps }, { manualPaymentProps }] = await Promise.all([loadKaspiView(), loadRequisites()]);
    const [kaspi, manual] = await Promise.all([kaspiPaymentProps({ kind: "gift", id: gift.id }, gift.buyerPhone), manualPaymentProps(m)]);
    payment = { online: isOnlinePayment() ? { publicId: env.cloudpayments.publicId } : null, manual, kaspi };
  }
  return {
    id: gift.id,
    number: gift.number,
    token: gift.token,
    status: gift.status,
    plan: gift.plan as Dto<typeof WebGiftStatus>["plan"],
    amount: gift.amount,
    currency: gift.currency,
    locale: gift.locale,
    buyerName: gift.buyerName,
    buyerEmail: gift.buyerEmail,
    recipientName: gift.recipientName,
    recipientEmail: gift.recipientEmail,
    message: gift.message,
    sendAt: gift.sendAt,
    sentAt: iso(gift.sentAt),
    paymentClaimedAt: iso(gift.paymentClaimedAt),
    promo: paid ? { code: gift.promo!.code, usedCount: gift.promo!.usedCount, expiresAt: iso(gift.promo!.expiresAt) } : null,
    redeemUrl: paid ? redeemUrl(gift.promo!.code, gift.locale) : null,
    payment,
  };
}

export async function localGiftCreate(input: Dto<typeof WebGiftCreateBody>, buyerUserId: string | null): Promise<Dto<typeof WebGiftCreated>> {
  const [{ container }, { ensureCatalog }, { OrderingError }] = await Promise.all([loadContainer(), loadCatalog(), import("@/modules/ordering")]);
  await ensureCatalog(); // цену считаем по действующему каталогу
  try {
    const gift = await container().ordering.gifts.purchase({ ...input, buyerUserId });
    return { ok: true, token: gift.token, amount: gift.amount };
  } catch (err) {
    if (OrderingError.is(err) && err.code === "giftPastDate") return { ok: false, error: "giftPastDate" };
    throw err;
  }
}

/** «Я оплатил(а)» за сертификат; лимит частоты — у вызывающего (действие сайта или обработчик API v1). */
export async function localGiftClaim(token: string): Promise<{ token: string | null }> {
  // Токен сертификата — 24 знака base64url (randomBytes(18)); мусор до базы не доходит.
  if (!/^[\w-]{16,64}$/.test(token)) return { token: null };
  const { container } = await loadContainer();
  const gift = await container().ordering.gifts.claimPayment(token);
  return { token: gift?.token ?? null };
}

export async function localRedeemCheck(code: string): Promise<Dto<typeof WebRedeemCheck>> {
  const { container } = await loadContainer();
  const ordering = container().ordering;
  const check = await ordering.promos.check(code);
  if (!check.ok) return { check: { ok: false, error: check.error }, gift: null };
  const gift = await ordering.queries.giftByPromo(check.promo.id);
  const { code: c, kind, value, label } = check.promo;
  return {
    check: { ok: true, code: c, kind, value, label },
    gift: gift ? { locale: gift.locale, plan: gift.plan as Dto<typeof WebGiftStatus>["plan"], recipientName: gift.recipientName, buyerName: gift.buyerName, message: gift.message } : null,
  };
}

// ─── Письмо близких, отзыв по ссылке, отписка ──────────────────────────────────────────────────────────────

export async function localLetterInvite(token: string): Promise<Dto<typeof WebLetterInvite> | null> {
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) return null;
  const { container } = await loadContainer();
  const book = await container().authoring.queries.bookByInviteToken(token);
  if (!book) return null;
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

export async function localReviewPage(orderId: string, token: string | null): Promise<Dto<typeof WebReviewPage> | null> {
  const [{ container }, { reviewAccess }, { FeedbackError }] = await Promise.all([loadContainer(), loadReviews(), import("@/modules/feedback")]);
  if (!(await reviewAccess(orderId, token))) return null;
  const c = container();
  const details = await c.ordering.queries.orderDetails(orderId);
  if (!details) return null;
  const b = details.book;
  let state: Awaited<ReturnType<ReturnType<typeof container>["feedback"]["reviews"]["open"]>> | null = null;
  try {
    state = await c.feedback.reviews.open(orderId);
  } catch (err) {
    if (!FeedbackError.is(err)) throw err;
  }
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

export async function localUnsubscribeLink(u: string, t: string): Promise<{ valid: boolean }> {
  const { container } = await loadContainer();
  return { valid: container().notifications.subscriptions.isValidLink(u, t) };
}

export async function localUnsubscribe(u: string, t: string): Promise<{ ok: true }> {
  const { container } = await loadContainer();
  await container().notifications.subscriptions.unsubscribe(u, t);
  return { ok: true };
}
