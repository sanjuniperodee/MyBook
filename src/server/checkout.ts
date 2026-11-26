import "server-only";
import { getDeliveryOptions, getPlan, getPlans, getVisiblePlans, giftNoteEnabled, isAbroadDelivery, isQuotedDelivery, soldAddons, formatPrice, site, type DeliveryId, type PlanId } from "@/config/site";
import { quoteCheckout } from "@/shared/domain/pricing";
import { buildBookContent } from "@/lib/book/book-content";
import { toPhotoItem } from "@/lib/book/layout";
import { coverName, interiorName } from "@/i18n/labels";
import { getFormat } from "@/lib/book/formats";
import { getOccasion } from "@/lib/occasions";
import type { AgreementGift } from "@/shared/domain/agreementGifts";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import type { getAccessibleBook } from "@/server/books";

/**
 * Оформление заказа — одна логика для страницы сайта (/books/[id]/checkout) и приложения (API v1 cabinetCheckout*):
 * проверка формы, создание заказа, модель экрана (тарифы, доставка, допы, договорённость, проверка макета) и расчёт
 * итога теми же правилами цены (quoteCheckout), что считает сервер при создании заказа.
 *
 * Без статических импортов `./container`, `./catalog` или `@/modules/*`: `checkoutSchema` может импортироваться
 * на фронте без БД (Vercel, `WEB_API_ONLY=1`), а серверные функции подгружают контейнер лениво.
 */

type Book = Awaited<ReturnType<typeof getAccessibleBook>>;
import { checkoutSchema, type CheckoutInput } from "@/lib/book/checkout-schema";

export { checkoutSchema, type CheckoutInput };

/** Создать заказ по проверенной форме (ошибки домена — исключением OrderingError, текст — у вызывающего). */
export async function placeOrder(user: { id: string; phone: string | null }, locale: Locale, d: CheckoutInput) {
  const [{ container }, { ensureCatalog }] = await Promise.all([import("./container"), import("./catalog")]);
  await ensureCatalog(); // цену считаем по действующему каталогу, а не по тому, что видел клиент
  // Скрытый тариф продаётся только по договорённости — это проверит сервис заказов (ошибка planUnavailable, без подмены).
  const plan = getPlan(d.plan)!;
  const order = await container().ordering.orders.place({
    userId: user.id,
    userPhone: user.phone,
    locale,
    bookId: d.bookId,
    plan: plan.id,
    quantity: d.quantity,
    delivery: { method: plan.printed ? (d.delivery as DeliveryId) : null, country: d.country || null, city: d.city || null, address: d.address || null, postalCode: d.postalCode || null },
    addons: d.addons ? d.addons.split(",").filter((id) => soldAddons(plan.id).some((a) => a.id === id)) : [],
    contact: { name: d.contactName, phone: d.contactPhone, email: d.contactEmail },
    promoCode: d.promoCode || undefined,
    customerComment: d.comment,
    // Открытка выключена в CRM — текст не сохраняем, даже если его прислала старая открытая вкладка.
    giftNote: giftNoteEnabled() ? d.giftNote : undefined,
    desiredDate: d.desiredDate || undefined,
    surprise: d.surprise === "on",
    agreementMode: d.agreementMode,
    upgradeFromOrderId: d.upgradeFrom || undefined,
  });
  return order;
}

/** Договорённость с менеджером для формы: как её видит клиент (сотрудник смотрит глазами владельца книги). */
async function agreementOf(book: Book) {
  const { container } = await import("./container");
  const a = await container().ordering.orders.agreementFor(book.userId);
  if (!a) return null;
  return { dealNumber: a.dealNumber, agreedTotal: a.agreedTotal, prepaid: a.prepaid, batch: a.batch && !a.batch.implicit ? { index: a.batch.index, size: a.batch.size } : null, plan: a.plan && getPlan(a.plan) ? (a.plan as PlanId) : null, gifts: (a.gifts ?? []) as AgreementGift[] };
}

/**
 * Модель экрана оформления для приложения. closed — оформлять нельзя: книга уже заказана (orderId — открыть заказ).
 * Тексты — на языке пользователя.
 */
export async function checkoutModel(book: Book, user: { id: string; name: string; email: string; phone: string | null }, locale: Locale, m: Messages) {
  const [{ container }, { checkReadiness }] = await Promise.all([import("./container"), import("@/modules/authoring/domain/readiness")]);
  const t = m.checkout;
  const c = m.common;
  const bookOrder = await container().ordering.queries.lastOrderOfBook(book.id);
  if (book.status !== "draft" || (bookOrder && bookOrder.status !== "cancelled")) return { closed: true as const, orderId: bookOrder && bookOrder.status !== "cancelled" ? bookOrder.id : null };
  const q = container().authoring.queries;
  const [stats, photos, questions, chapters, letters, built, agreement] = await Promise.all([
    q.stats(book),
    q.photos(book.id),
    q.questions(book.id),
    q.chapters(book.id),
    q.approvedLetters(book.id),
    container().previews.current(book.id).catch(() => null),
    agreementOf(book),
  ]);
  const content = buildBookContent(book, questions, photos.map(toPhotoItem), chapters, undefined, letters);
  const issues = checkReadiness(book, built ? { ...stats, estimatedPages: built.contentPages } : stats, photos, locale, content);
  const plans = agreement?.plan ? getPlans().filter((p) => p.id === agreement.plan) : getVisiblePlans();
  const gifts = agreement?.gifts ?? [];
  const occasion = getOccasion(book.occasion);
  return {
    closed: false as const,
    orderId: null,
    title: t.title,
    summary: t.summary(book.title, built?.pageCount ?? stats.printedPages, stats.answered, stats.photos, !!built),
    design: [t.design.cover(coverName(book.coverTemplate, locale)), t.design.pages(interiorName(book.interior, locale)), getFormat(book.format).short],
    checkPreview: t.checkPreview,
    blocked: issues.some((i) => i.level === "error"),
    issues: issues.map((i) => ({ level: i.level, text: i.text, href: i.href ?? null })),
    plans: plans.map((p) => ({ id: p.id, name: c.plans[p.id].name, features: c.plans[p.id].features.slice(0, 4), price: p.price, priceLabel: formatPrice(p.price), printed: !!p.printed, extraCopy: p.extraCopyPrice ? t.nextCopy(formatPrice(p.extraCopyPrice)) : null, addons: soldAddons(p.id).map((a) => ({ id: a.id, name: c.addons[a.id].name, description: c.addons[a.id].description, priceLabel: a.id === "giftwrap" && gifts.includes("giftwrap") ? t.agreement.giftFree : `+${formatPrice(a.price)}` })) })),
    lockedPlan: agreement?.plan ? t.agreement.planLocked(c.plans[agreement.plan].name) : null,
    deliveries: getDeliveryOptions().map((d) => ({ id: d.id, name: c.delivery[d.id].name, description: c.delivery[d.id].description, priceLabel: isQuotedDelivery(d.id, gifts) ? t.quoted.price : !d.price ? c.free : gifts.includes("delivery") ? t.agreement.giftFree : formatPrice(d.price), quoted: isQuotedDelivery(d.id, gifts), abroad: isAbroadDelivery(d.id) })),
    quotedNote: t.quoted.note,
    giftNote: giftNoteEnabled(),
    occasionLabel: occasion ? m.common.occasions[occasion.id].label : null,
    agreement: agreement
      ? {
          title: t.agreement.title,
          summary: t.agreement.summary(agreement.dealNumber, formatPrice(agreement.agreedTotal), formatPrice(agreement.prepaid)),
          batch: agreement.batch && agreement.batch.size > 1 ? t.agreement.batch(agreement.batch.index + 1, agreement.batch.size) : null,
          gifts: gifts.length ? t.agreement.gifts(gifts.map((g) => c.agreementGifts[g]).join(", ")) : null,
          modes: [
            { id: "agreed", title: t.agreement.continueTitle, hint: t.agreement.continueHint },
            { id: "advance", title: t.agreement.newTitle, hint: t.agreement.newHint(formatPrice(agreement.prepaid)) },
          ],
          refund: t.agreement.refund,
          whatsapp: site.contacts.whatsapp,
        }
      : null,
    defaults: { name: user.name, email: user.email, phone: user.phone ?? "", desiredDate: book.occasionDate ?? "" },
    offerUrl: "/offer",
    privacyUrl: "/privacy",
  };
}

/** Расчёт итога для выбранного (тариф, количество, доставка, допы, промокод, режим договорённости): строки и «К оплате». */
export async function checkoutQuote(book: Book, userId: string, input: { plan: string; quantity: number; delivery: string | null; addons: string[]; promoCode: string | null; mode: "agreed" | "advance" | null }, m: Messages) {
  const [{ container }, { ensureCatalog }] = await Promise.all([import("./container"), import("./catalog")]);
  await ensureCatalog();
  const t = m.checkout;
  const c = m.common;
  const plan = getPlan(input.plan) ?? getVisiblePlans()[0];
  const agreement = await agreementOf(book);
  const promo = input.promoCode ? await container().ordering.promos.check(input.promoCode, userId) : null;
  const discount = promo?.ok ? { kind: promo.promo.kind, value: promo.promo.value } : null;
  const mode = input.mode ?? "agreed";
  const delivery = plan.printed ? ((getDeliveryOptions().find((d) => d.id === input.delivery)?.id ?? "courier") as DeliveryId) : null;
  const quote = quoteCheckout({ plan: plan.id, quantity: Math.min(20, Math.max(1, input.quantity)), delivery, discount, addons: input.addons, agreement: agreement ? { ...agreement, plan: agreement.plan } : null, mode });
  const p = quote.price;
  const gifted = p.gifted ?? [];
  const qPlan = getPlan(quote.plan)!;
  const deliveryQuoted = !!delivery && isQuotedDelivery(delivery, gifted);
  const lines: { label: string; value: string; tone: "plain" | "success" | "muted" }[] = [{ label: `${c.plans[qPlan.id].name}${qPlan.printed && input.quantity > 1 ? ` × ${input.quantity}` : ""}`, value: formatPrice(p.itemsAmount), tone: "plain" }];
  if (quote.promoDiscount && promo?.ok) lines.push({ label: `${promo.promo.code.startsWith("GIFT-") ? t.certificate : t.promoCode} ${promo.promo.code} (${promo.promo.label})`, value: `−${formatPrice(quote.promoDiscount)}`, tone: "success" });
  if (quote.agreedDiscount > 0) lines.push({ label: t.agreement.agreedLine, value: `−${formatPrice(quote.agreedDiscount)}`, tone: "success" });
  const prepaid = "prepaidAmount" in p ? (p.prepaidAmount as number) : 0;
  if (prepaid > 0) lines.push({ label: t.agreement.prepaidLine, value: `−${formatPrice(prepaid)}`, tone: "success" });
  for (const id of p.addons) {
    const a = soldAddons(qPlan.id).find((x) => x.id === id);
    if (a) lines.push({ label: c.addons[a.id].name, value: gifted.includes(a.id as AgreementGift) ? t.agreement.giftFree : formatPrice(a.price), tone: gifted.includes(a.id as AgreementGift) ? "success" : "plain" });
  }
  if (qPlan.printed) lines.push({ label: t.delivery, value: deliveryQuoted ? t.quoted.price : gifted.includes("delivery") ? t.agreement.giftFree : p.deliveryAmount ? formatPrice(p.deliveryAmount) : c.free, tone: deliveryQuoted ? "muted" : gifted.includes("delivery") ? "success" : "plain" });
  return {
    plan: qPlan.id,
    lines,
    totalLabel: t.toPay,
    total: formatPrice(p.amount),
    quotedTotal: deliveryQuoted ? t.quoted.total : null,
    promo: input.promoCode ? (promo?.ok ? { ok: true, text: `${promo.promo.code} · ${promo.promo.label}` } : { ok: false, text: promo ? t.promo[promo.error] : t.promo.notFound }) : null,
  };
}
