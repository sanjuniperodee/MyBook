import "server-only";
import { z } from "zod";
import type {
  WebCheckoutPageResponse,
  WebDealAgreement,
  WebOrderBookCover,
  WebOrderDetailResponse,
  WebOrdersListResponse,
  WebPayPageResponse,
  WebPromoCheckResponse,
} from "@mybook/contracts";
import { env } from "@/config/env";
import { getPlan, site, type PlanId } from "@/config/site";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { buildBookContent } from "@/lib/book/book-content";
import { toPhotoItem } from "@/lib/book/layout";
import { getOccasion } from "@/lib/occasions";
import type { BookRow } from "@/modules/authoring";
import type { AgreementGift } from "@/shared/domain/agreementGifts";
import { isPayToken, PAY_TOKEN, payComment } from "@/shared/domain/orders";
import type { User } from "./auth";
import type { CheckoutInput } from "./checkout";

/**
 * Ленивые модули с БД — один общий промис на процесс: веб без БД (Vercel) их не грузит, а одновременные первые вызовы
 * (strict-сверка зовёт local и API разом) получают один и тот же экземпляр модуля, а не два.
 */
let containerModule: Promise<typeof import("./container")> | undefined;
let catalogModule: Promise<typeof import("./catalog")> | undefined;
let requisitesModule: Promise<typeof import("./requisites")> | undefined;
const loadContainer = () => (containerModule ??= import("./container"));
const loadCatalog = () => (catalogModule ??= import("./catalog"));
const loadRequisites = () => (requisitesModule ??= import("./requisites"));

/**
 * Ленивый мост `local()` фолбэков для Раздела 3 (оформление заказа, заказы и оплата, section: "orders"):
 * НИКАКИХ статических top-level импортов `./container`, `./access`, `./catalog`, `./requisites`, `./kaspi-view`, `pg`
 * или `@/modules/*` — только динамический `await import(...)`. На Vercel без БД (`webApiOnly() === true`) локальные
 * функции не вызываются и модули БД не загружаются.
 */

export type WebCheckoutPageResponseDto = z.output<typeof WebCheckoutPageResponse>;
export type WebPromoCheckResponseDto = z.output<typeof WebPromoCheckResponse>;
export type WebOrdersListResponseDto = z.output<typeof WebOrdersListResponse>;
export type WebOrderDetailResponseDto = z.output<typeof WebOrderDetailResponse>;
export type WebPayPageResponseDto = z.output<typeof WebPayPageResponse>;
type WebDealAgreementDto = z.output<typeof WebDealAgreement>;
type WebOrderBookCoverDto = z.output<typeof WebOrderBookCover>;

const toIsoOrEpoch = (d: Date | string | null | undefined): string =>
  d instanceof Date ? d.toISOString() : typeof d === "string" ? d : new Date(0).toISOString();

const asRecordOrNull = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function toOrderBookCover(book: {
  id: string;
  title: string;
  subtitle: string;
  coverTemplate: string;
  coverLines: boolean;
  format: string;
  theme: string;
  authorName: string;
  recipientName: string;
  hideRecipientOnCover: boolean;
  namesOnCover: string;
  coverPhotoId: string | null;
  coverPhotoExtra: string[] | null;
  coverDesign: unknown;
}): WebOrderBookCoverDto {
  return {
    id: book.id,
    title: book.title,
    subtitle: book.subtitle,
    coverTemplate: book.coverTemplate,
    coverLines: book.coverLines,
    format: book.format,
    theme: book.theme,
    authorName: book.authorName,
    recipientName: book.recipientName,
    hideRecipientOnCover: book.hideRecipientOnCover,
    namesOnCover: book.namesOnCover,
    coverPhotoId: book.coverPhotoId ?? null,
    coverPhotoExtra: Array.isArray(book.coverPhotoExtra) ? [...book.coverPhotoExtra] : null,
    coverDesign: asRecordOrNull(book.coverDesign),
  };
}

// ─── Оформление заказа (books/[id]/checkout/page.tsx + actions.ts) ───────────────────────────────────────────

export async function localCheckoutPageDto(
  book: BookRow,
  user: Pick<User, "id" | "name" | "email" | "phone">,
  locale: Locale,
  m: Messages,
  opts: { promo?: string; upgrade?: string } = {},
): Promise<WebCheckoutPageResponseDto> {
  const [{ container }, { ensureCatalog }, { checkReadiness }] = await Promise.all([
    loadContainer(),
    loadCatalog(),
    import("@/modules/authoring/domain/readiness"),
  ]);
  await ensureCatalog();
  const c = container();
  const upgrade = opts.upgrade && /^[0-9a-f-]{36}$/i.test(opts.upgrade) ? await c.ordering.orders.upgradeOffer(opts.upgrade, user.id) : null;
  const upgradeOk = !!upgrade && upgrade.bookId === book.id;
  if (book.status !== "draft" && !upgradeOk) return { closed: true, data: null };
  const bookOrder = upgradeOk ? null : await c.ordering.queries.lastOrderOfBook(book.id);
  if (bookOrder && bookOrder.status !== "cancelled") return { closed: true, data: null };

  const q = c.authoring.queries;
  const [stats, photos, questions, chapters, letters, built, agreement, giftCheck] = await Promise.all([
    q.stats(book),
    q.photos(book.id),
    q.questions(book.id),
    q.chapters(book.id),
    q.approvedLetters(book.id),
    c.previews.current(book.id).catch(() => null),
    upgradeOk ? null : c.ordering.orders.agreementFor(book.userId),
    opts.promo ? c.ordering.promos.check(opts.promo, user.id) : null,
  ]);

  const content = buildBookContent(book, questions, photos.map(toPhotoItem), chapters, undefined, letters);
  const issues = checkReadiness(book, built ? { ...stats, estimatedPages: built.contentPages } : stats, photos, locale, content);
  const initialPromo = giftCheck?.ok
    ? { ok: true as const, code: giftCheck.promo.code, kind: giftCheck.promo.kind, value: giftCheck.promo.value, label: giftCheck.promo.label }
    : null;
  const giftPlanRaw = giftCheck?.ok ? (await c.ordering.queries.giftByPromo(giftCheck.promo.id))?.plan : undefined;
  const initialPlan = giftPlanRaw && getPlan(giftPlanRaw) ? (giftPlanRaw as PlanId) : null;
  const occasion = getOccasion(book.occasion);

  return {
    closed: false,
    data: {
      pageCount: built?.pageCount ?? stats.printedPages,
      exactPages: !!built,
      answered: stats.answered,
      photosCount: stats.photos,
      photos: photos.map((p) => ({ id: p.id, width: p.width, height: p.height })),
      issues: issues.map((i) => ({ level: i.level, text: i.text, href: i.href ?? null })),
      blocked: issues.some((i) => i.level === "error"),
      staffView: book.userId !== user.id,
      initialPromo,
      initialPlan,
      upgrade: upgradeOk ? { orderId: upgrade.orderId, number: upgrade.number, credit: upgrade.credit } : null,
      agreement: agreement
        ? {
            dealNumber: agreement.dealNumber,
            agreedTotal: agreement.agreedTotal,
            prepaid: agreement.prepaid,
            batch: agreement.batch && !agreement.batch.implicit ? { index: agreement.batch.index, size: agreement.batch.size } : null,
            plan: agreement.plan && getPlan(agreement.plan) ? (agreement.plan as PlanId) : null,
            gifts: (agreement.gifts ?? []) as AgreementGift[],
          }
        : null,
      defaults: {
        name: user.name,
        email: user.email,
        phone: user.phone ?? "",
        desiredDate: book.occasionDate ?? null,
        occasionLabel: occasion ? m.common.occasions[occasion.id].label : null,
      },
    },
  };
}

export async function localCheckPromo(userId: string, code: string, m: Messages): Promise<WebPromoCheckResponseDto> {
  const t = m.checkout;
  const { trustedClientIp, rateLimit } = await import("./rateLimit");
  if (!(await rateLimit(`promo:${await trustedClientIp()}`, 20, 600_000))) return { ok: false, error: t.errors.tooMany };
  const input = z.string().max(100).safeParse(code);
  if (!input.success) return { ok: false, error: t.promo.notFound };
  const { container } = await loadContainer();
  const check = await container().ordering.promos.check(input.data, userId);
  if (!check.ok) return { ok: false, error: t.promo[check.error] };
  const { code: c, kind, value, label } = check.promo;
  return { ok: true, code: c, kind, value, label };
}

export async function localPlaceOrder(
  user: Pick<User, "id" | "phone">,
  locale: Locale,
  input: CheckoutInput,
): Promise<{ ok: true; orderId: string; amount: number } | { ok: false; error: string; code: string }> {
  const [{ placeOrder }, { actionError }, { OrderingError }] = await Promise.all([
    import("./checkout"),
    import("./errors"),
    import("@/modules/ordering"),
  ]);
  try {
    const order = await placeOrder(user, locale, input);
    return { ok: true, orderId: order.id, amount: order.amount };
  } catch (err) {
    const error = await actionError(err, OrderingError);
    if (error === null) throw err;
    return { ok: false, error, code: OrderingError.is(err) ? err.code : "refused" };
  }
}

// ─── Список заказов и карточка заказа (orders/page.tsx, orders/[id]/page.tsx, orders/actions.ts) ────────────

export async function localOrdersListDto(userId: string, locale: Locale): Promise<WebOrdersListResponseDto> {
  const [{ container }, { ensureCatalog }, { isPrintedPlan, orderStatusLabel, orderStatusTone }] = await Promise.all([
    loadContainer(),
    loadCatalog(),
    import("@/modules/ordering/ui/status"),
  ]);
  await ensureCatalog();
  const c = container();
  const [list, rawAgreement] = await Promise.all([c.ordering.queries.userOrders(userId), c.ordering.orders.agreementFor(userId)]);
  const agreement: WebDealAgreementDto | null = rawAgreement
    ? {
        dealId: rawAgreement.dealId,
        dealNumber: rawAgreement.dealNumber,
        agreedTotal: rawAgreement.agreedTotal,
        prepaid: rawAgreement.prepaid,
        plan: rawAgreement.plan,
        ...(rawAgreement.gifts !== undefined ? { gifts: rawAgreement.gifts } : {}),
        deadline: rawAgreement.deadline,
        ...(rawAgreement.batch !== undefined ? { batch: rawAgreement.batch } : {}),
        ...(rawAgreement.recipient !== undefined ? { recipient: rawAgreement.recipient } : {}),
      }
    : null;
  const agreementBooks = agreement
    ? (await c.authoring.queries.userBooks(userId)).map((r) => ({
        id: r.book.id,
        status: r.book.status,
        theme: r.book.theme,
        answered: r.answered,
        total: r.total,
        words: r.words,
      }))
    : [];

  return {
    orders: list.map((o) => {
      const printed = isPrintedPlan(o.plan);
      return {
        id: o.id,
        number: o.number,
        plan: o.plan,
        printed,
        quantity: o.quantity,
        amount: o.amount,
        status: o.status,
        statusLabel: orderStatusLabel(o.status, locale, printed),
        statusTone: orderStatusTone[o.status],
        createdAt: toIsoOrEpoch(o.createdAt),
        book: toOrderBookCover(o.book),
      };
    }),
    agreement,
    agreementBooks,
  };
}

export async function localOrderDetailDto(
  orderId: string,
  user: Pick<User, "id" | "role" | "staffDisabled">,
  locale: Locale,
  m: Messages,
): Promise<WebOrderDetailResponseDto | null> {
  const [
    { container },
    { ensureCatalog },
    { manualPaymentProps },
    { kaspiPaymentProps },
    { isOnlinePayment },
    { canReview, THANK_YOU },
    { REFERRAL },
    { isPaid },
    { orderStatusLabel, orderStatusTone },
  ] = await Promise.all([
    loadContainer(),
    loadCatalog(),
    loadRequisites(),
    import("./kaspi-view"),
    import("@/modules/ordering"),
    import("@/modules/feedback"),
    import("@/modules/referrals"),
    import("@/modules/ordering/domain"),
    import("@/modules/ordering/ui/status"),
  ]);
  await ensureCatalog();
  const c = container();
  const order = await c.ordering.queries.orderDetails(orderId);
  if (!order) return null;

  const own = order.userId === user.id;
  if (!own) {
    const isStaffUser = user.role === "admin" && !user.staffDisabled;
    if (!isStaffUser) return null;
    const { can, canSeeOrder, getStaff } = await import("./access");
    const staff = await getStaff();
    const acting = staff?.user.id === user.id ? staff : null;
    if (!(acting && can(acting, "orders.view") && (await canSeeOrder(acting, order.id)))) return null;
  }

  const plan = getPlan(order.plan);
  const printed = !!plan?.printed;
  const paid = isPaid(order.status);
  const reviewable = own && canReview({ status: order.status, plan: order.plan, paid });

  const [review, upgrade, payment] = await Promise.all([
    own ? c.feedback.queries.byOrder(order.id) : null,
    own && !plan?.printed && order.status === "paid" ? c.ordering.orders.upgradeOffer(order.id, user.id) : null,
    own && order.status === "pending_payment"
      ? Promise.all([manualPaymentProps(m), kaspiPaymentProps({ kind: "order", id: order.id }, order.contactPhone)]).then(([manual, kaspi]) => ({
          online: isOnlinePayment() ? { publicId: env.cloudpayments.publicId } : null,
          manual,
          kaspi,
        }))
      : null,
  ]);

  return {
    own,
    printed,
    paid,
    statusLabel: orderStatusLabel(order.status, locale, printed),
    statusTone: orderStatusTone[order.status],
    reviewable,
    reviewThankYouPercent: THANK_YOU.percent,
    referral: { friendPercent: REFERRAL.friendPercent, rewardPercent: REFERRAL.rewardPercent },
    review: review ? { rating: review.rating, status: review.status, thankYouCode: review.thankYouCode ?? null } : null,
    upgrade: upgrade ? { bookId: upgrade.bookId, orderId: upgrade.orderId, number: upgrade.number, credit: upgrade.credit } : null,
    payment,
    order: {
      id: order.id,
      number: order.number,
      status: order.status,
      plan: order.plan,
      quantity: order.quantity,
      currency: order.currency,
      itemsAmount: order.itemsAmount,
      discountAmount: order.discountAmount,
      addonsAmount: order.addonsAmount,
      deliveryAmount: order.deliveryAmount,
      prepaidAmount: order.prepaidAmount,
      amount: order.amount,
      promoCode: order.promoCode ?? null,
      addons: Array.isArray(order.addons) ? [...order.addons] : [],
      deliveryMethod: order.deliveryMethod ?? null,
      deliveryCountry: order.deliveryCountry ?? null,
      postalCode: order.postalCode ?? null,
      city: order.city ?? null,
      address: order.address ?? null,
      contactName: order.contactName,
      contactPhone: order.contactPhone,
      contactEmail: order.contactEmail,
      giftNote: order.giftNote ?? null,
      desiredDate: order.desiredDate ?? null,
      surprise: !!order.surprise,
      customerComment: order.customerComment ?? null,
      trackingNumber: order.trackingNumber ?? null,
      paymentClaimedAt: order.paymentClaimedAt ? toIsoOrEpoch(order.paymentClaimedAt) : null,
      createdAt: toIsoOrEpoch(order.createdAt),
      book: toOrderBookCover(order.book),
    },
  };
}

export async function localClaimOrderPayment(orderId: string, userId: string): Promise<{ ok: true }> {
  const { container } = await loadContainer();
  await container().ordering.orders.claimPayment(orderId, userId);
  return { ok: true };
}

export async function localCancelOrder(orderId: string, userId: string): Promise<{ ok: true }> {
  const { container } = await loadContainer();
  await container().ordering.orders.cancelByCustomer(orderId, userId);
  return { ok: true };
}

// ─── Оплата счёта из чата по ссылке /pay/[token] + pay/actions.ts ───────────────────────────────────────────

export async function localPayPageDto(token: string): Promise<WebPayPageResponseDto | null> {
  if (!isPayToken(token)) return null;
  const [{ container }, { ensureCatalog }, { transferRequisites }, { dealInvoiceKaspiProps }, { isOnlinePayment }] = await Promise.all([
    loadContainer(),
    loadCatalog(),
    loadRequisites(),
    import("./kaspi-view"),
    import("@/modules/ordering"),
  ]);
  await ensureCatalog();
  const c = container();
  const invoice = await c.ordering.invoices.byToken(token);
  if (!invoice) return null;
  const s = invoice.snapshot();
  const deal = s.status === "paid" ? null : await c.sales.deals.findById(s.dealId);
  const state = s.status === "paid" ? "paid" : deal?.orderId ? "ordered" : invoice.isPayable(new Date()) ? "payable" : s.status === "cancelled" ? "cancelled" : "expired";
  const [kaspiRaw, transfer] = state === "payable" ? await Promise.all([dealInvoiceKaspiProps(invoice.id, s.phone), transferRequisites()]) : [null, null];

  return {
    token: s.token,
    number: s.number,
    label: invoice.label,
    state,
    viewed: !!s.viewedAt,
    amount: s.amount,
    plan: s.plan,
    purpose: s.purpose,
    booksCount: s.booksCount,
    gifts: [...s.gifts],
    expiresAt: toIsoOrEpoch(s.expiresAt),
    claimed: !!s.claimedAt,
    accessStatus: s.accessStatus,
    seller: { legalName: site.company.legalName, bin: site.company.bin },
    online: state === "payable" && isOnlinePayment() ? { publicId: env.cloudpayments.publicId } : null,
    transfer,
    kaspi: kaspiRaw ? { ...kaspiRaw, comment: payComment(invoice.label) } : null,
  };
}

export async function localPayViewed(token: string): Promise<{ ok: true }> {
  if (!isPayToken(token)) return { ok: true };
  const { container } = await loadContainer();
  await container().ordering.invoices.viewed(token);
  return { ok: true };
}

/** «Я оплатил(а)» по ссылке /pay/<token>; лимит частоты — у вызывающего (действие сайта или обработчик API v1). */
export async function localPayClaim(rawToken: string): Promise<{ ok: true; claimed: boolean; token: string | null }> {
  const parsed = z.string().regex(PAY_TOKEN).safeParse(rawToken);
  if (!parsed.success) return { ok: true, claimed: false, token: null };
  const { container } = await loadContainer();
  const invoice = await container().ordering.invoices.claim(parsed.data);
  return { ok: true, claimed: !!invoice, token: invoice?.token ?? null };
}
