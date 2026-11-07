import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { CheckCircle2, Gift, MessageCircle, ShieldCheck, XCircle } from "lucide-react";
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

  const r = t.receipt;
  const statusLabel = state === "paid" ? r.status.paid : state === "payable" ? r.status.payable : r.status.closed;
  const amountLabel = state === "paid" ? t.amountPaid : state === "payable" ? t.toPay : t.amount;

  return (
    <>
      <LandingHeader loggedIn={!!user} />
      <main className="overflow-x-clip pt-24 pb-20 sm:pt-32">
        <div className="container-x max-w-5xl">
          <h1 className="font-serif text-[36px] leading-[1.05] font-medium text-balance sm:text-5xl">{state === "paid" ? t.paidTitle : state === "payable" ? t.meta : t.closedTitle}</h1>

          <div className="mt-8 grid gap-8 lg:mt-12 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start lg:gap-14">
            {/* Квитанция: номер и статус, сумма, за что, до какого числа, кто продавец. Контактов клиента здесь нет — ссылку могли переслать. */}
            <aside aria-label={t.eyebrow(invoice.label)} className="rounded-[14px] border border-line bg-white lg:sticky lg:top-24">
              <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6">
                <span className="text-sm text-muted">{t.eyebrow(invoice.label)}</span>
                <span className={`text-sm font-medium ${state === "paid" ? "text-success" : state === "payable" ? "text-wine" : "text-muted"}`}>{statusLabel}</span>
              </div>
              <div className="px-5 pt-3 pb-5 sm:px-6">
                <div className="text-sm text-muted">{amountLabel}</div>
                <div className="mt-1 font-serif text-[52px] leading-none font-medium tabular-nums">{formatPrice(s.amount)}</div>
              </div>
              <dl className="space-y-4 border-t border-dashed border-line-strong px-5 py-5 text-[15px] sm:px-6">
                <div>
                  <dt className="text-sm text-muted">{r.item}</dt>
                  <dd className="mt-0.5 leading-snug">{t.purposeLine(planName(s.plan, locale), t.purpose[s.purpose], s.booksCount)}</dd>
                </div>
                {s.gifts.length ? (
                  <div data-testid="pay-gifts">
                    <dd className="flex items-start gap-2 leading-snug text-ink-soft">
                      <Gift className="mt-1 size-4 shrink-0 text-wine" aria-hidden /> {t.gifts(s.gifts.map((g) => m.common.agreementGifts[g]).join(", "))}
                    </dd>
                  </div>
                ) : null}
                {state === "payable" ? (
                  <div>
                    <dd className="text-sm text-muted">{t.until(until)}</dd>
                  </div>
                ) : null}
              </dl>
              <div className="space-y-1 border-t border-dashed border-line-strong px-5 py-4 text-sm sm:px-6">
                <div className="text-muted">{r.seller}</div>
                <div className="font-medium">{site.company.legalName}</div>
                <div className="text-muted">{r.bin(site.company.bin)}</div>
              </div>
            </aside>

            <div className="min-w-0 space-y-6">
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
                <div className="space-y-5 rounded-[14px] border border-line bg-white p-6 sm:p-8">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
                    {/* Про WhatsApp — только когда доступ действительно ушёл; иначе честно: пришлёт менеджер. */}
                    <p className="text-[17px] leading-relaxed">{s.accessStatus === "sent" || s.accessStatus === "delivered" ? t.paidAccess : s.accessStatus === "skipped" ? t.paidAlready : t.paidManager}</p>
                  </div>
                  <Link href={user ? "/books" : "/login"} className="btn btn-primary btn-lg w-full sm:w-auto">
                    {t.login}
                  </Link>
                </div>
              ) : null}

              {state === "ordered" || state === "cancelled" || state === "expired" ? (
                <div className="space-y-5 rounded-[14px] border border-line bg-white p-6 sm:p-8">
                  <div className="flex items-start gap-3">
                    <XCircle className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
                    <p className="text-[17px] leading-relaxed">{t[state]}</p>
                  </div>
                  {state === "ordered" ? (
                    <Link href={user ? "/orders" : "/login"} className="btn btn-primary btn-lg w-full sm:w-auto">
                      {t.login}
                    </Link>
                  ) : (
                    <a href={site.contacts.whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-lg w-full sm:w-auto">
                      <MessageCircle className="size-4" /> {t.writeUs}
                    </a>
                  )}
                </div>
              ) : null}

              {state === "payable" ? (
                <div className="flex items-start gap-3 text-sm leading-relaxed text-muted">
                  <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
                  <p>
                    <span className="font-medium text-ink-soft">{r.secureTitle}.</span> {r.secureText}
                  </p>
                </div>
              ) : null}

              <p className="text-sm text-muted">
                <a href={site.contacts.whatsapp} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                  {t.help}
                </a>
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
