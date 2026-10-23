import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { CheckCircle2, MessageCircle, XCircle } from "lucide-react";
import { Link } from "@/i18n/client";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { getCurrentUser } from "@/server/auth";
import { container } from "@/server/container";
import { transferRequisites } from "@/server/requisites";
import { isLinkPreviewAgent, isOnlinePayment, isPayToken, payComment } from "@/modules/ordering";
import { env } from "@/config/env";
import { formatPrice, site } from "@/config/site";
import { getLocale, getMessages } from "@/i18n/server";
import { planName } from "@/i18n/labels";
import { storeTimeZone } from "@/shared/domain/time";
import { dealInvoiceKaspiProps } from "@/app/api/payments/kaspi/view";
import { InvoicePayment } from "./InvoicePayment";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).pay.meta, robots: { index: false, follow: false } };
}

/**
 * Оплата счёта из чата по ссылке /pay/<token> (и /kk/pay/<token>): сумма, назначение, номер счёта и срок; способы —
 * Kaspi, карта, перевод. Без входа и без данных клиента: ссылку могли переслать — ни имени, ни контактов здесь нет,
 * номер для Kaspi только с маской. Токен проверяется регуляркой до запроса в базу.
 */
export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isPayToken(token)) notFound();
  const c = container();
  const [invoice, user, locale, m] = await Promise.all([c.ordering.invoices.byToken(token), getCurrentUser(), getLocale(), getMessages()]);
  if (!invoice) notFound();
  const s = invoice.snapshot();
  const t = m.pay;
  // Оплаченный — окончателен; иначе по сделке мог появиться заказ (оплата идёт в нём), счёт — отменён или истечь.
  const deal = s.status === "paid" ? null : await c.sales.deals.findById(s.dealId);
  const state = s.status === "paid" ? "paid" : deal?.orderId ? "ordered" : invoice.isPayable(new Date()) ? "payable" : s.status === "cancelled" ? "cancelled" : "expired";
  const until = new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : "ru-RU", { timeZone: storeTimeZone(), day: "numeric", month: "long" }).format(s.expiresAt);
  const [kaspi, transfer] = state === "payable" ? await Promise.all([dealInvoiceKaspiProps(invoice.id, s.phone), transferRequisites()]) : [null, null];
  // «Клиент открыл счёт» (deals-12): не сотрудник (проверяет ссылку из CRM) и не сборщик превью мессенджера.
  if (state === "payable" && !s.viewedAt && user?.role !== "admin" && !isLinkPreviewAgent((await headers()).get("user-agent")))
    await c.ordering.invoices.viewed(token).catch((err) => console.error("[pay] viewed", err));

  return (
    <>
      <LandingHeader loggedIn={!!user} />
      <main className="pt-28 pb-20 sm:pt-32">
        <div className="container-x max-w-2xl space-y-6">
          <div>
            <div className="eyebrow">{t.eyebrow(invoice.label)}</div>
            <h1 className="mt-3 font-serif text-4xl font-medium sm:text-5xl">{state === "paid" ? t.paidTitle : state === "payable" ? t.meta : t.closedTitle}</h1>
            <p className="mt-3 text-ink-soft">{t.purposeLine(planName(s.plan, locale), t.purpose[s.purpose], s.booksCount)}</p>
            {s.gifts.length ? <p className="mt-1 text-ink-soft" data-testid="pay-gifts">🎁 {t.gifts(s.gifts.map((g) => m.common.agreementGifts[g]).join(", "))}</p> : null}
            <p className="mt-1 text-ink-soft">
              {state === "paid" ? t.amountPaid : state === "payable" ? t.toPay : t.amount}: <b className="text-ink">{formatPrice(s.amount)}</b>
            </p>
            {state === "payable" ? <p className="mt-1 text-sm text-muted">{t.until(until)}</p> : null}
          </div>

          {state === "payable" ? (
            <InvoicePayment
              token={s.token}
              number={s.number}
              amount={s.amount}
              amountLabel={formatPrice(s.amount)}
              currency={site.currency}
              online={isOnlinePayment() ? { publicId: env.cloudpayments.publicId } : null}
              // Реквизиты из «Интеграций» (как manualPaymentProps), но шаги — про счёт: комментарий P<n>, а не номер заказа.
              manual={transfer && { title: m.common.manualPayment.title, steps: t.transferSteps(transfer.phone, transfer.name) }}
              unavailable={m.common.manualPayment.unavailable}
              claimed={!!s.claimedAt}
              kaspi={
                kaspi && {
                  initial: kaspi.initial,
                  defaultPhone: kaspi.defaultPhone,
                  hints: {
                    note: t.kaspi.note(kaspi.recipient, payComment(invoice.label)),
                    phoneHint: kaspi.maskedPhone ? t.kaspi.phoneHint(kaspi.maskedPhone) : null,
                    phonePlaceholder: kaspi.maskedPhone,
                    paid: t.kaspi.paid,
                  },
                }
              }
            />
          ) : null}

          {state === "paid" ? (
            <div className="card space-y-4 p-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                {/* Про WhatsApp — только когда доступ действительно ушёл; иначе честно: пришлёт менеджер. */}
                <p className="text-[15px]">{s.accessStatus === "sent" || s.accessStatus === "delivered" ? t.paidAccess : s.accessStatus === "skipped" ? t.paidAlready : t.paidManager}</p>
              </div>
              <Link href={user ? "/books" : "/login"} className="btn btn-primary">
                {t.login}
              </Link>
            </div>
          ) : null}

          {state === "ordered" || state === "cancelled" || state === "expired" ? (
            <div className="card space-y-4 p-6">
              <div className="flex items-start gap-3">
                <XCircle className="mt-0.5 size-5 shrink-0 text-muted" />
                <p className="text-[15px]">{t[state]}</p>
              </div>
              {state === "ordered" ? (
                <Link href={user ? "/orders" : "/login"} className="btn btn-primary">
                  {t.login}
                </Link>
              ) : (
                <a href={site.contacts.whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                  <MessageCircle className="size-4" /> {t.writeUs}
                </a>
              )}
            </div>
          ) : null}

          <p className="text-sm text-muted">
            <a href={site.contacts.whatsapp} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
              {t.help}
            </a>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
