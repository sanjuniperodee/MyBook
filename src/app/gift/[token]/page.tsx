import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { TrackOnce } from "@/components/analytics/TrackOnce";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, Download, Mail } from "lucide-react";
import { Flourish } from "@/components/landing/FilmFrame";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { GiftCardVisual } from "@/components/GiftCardVisual";
import { getCurrentUser } from "@/server/auth";
import { container } from "@/server/container";
import { manualPaymentProps } from "@/server/requisites";
import { isOnlinePayment, redeemUrl } from "@/modules/ordering";
import { env } from "@/config/env";
import { formatPrice, site } from "@/config/site";
import { parseDay } from "@/lib/occasions";
import { getLocale, getMessages } from "@/i18n/server";
import { planName } from "@/i18n/labels";
import { messagesFor } from "@/i18n/messages";
import { kaspiPaymentProps } from "@/app/api/payments/kaspi/view";
import { GiftPayment } from "./GiftPayment";
import { CopyLink } from "./CopyLink";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).gift.status.meta, robots: { index: false } };
}

export default async function GiftStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [gift, user, locale, m] = await Promise.all([container().ordering.queries.giftByToken(token), getCurrentUser(), getLocale(), getMessages()]);
  if (!gift) notFound();
  const t = m.gift.status;
  const paid = gift.status === "paid" && gift.promo;
  const kaspi = gift.status === "pending_payment" ? await kaspiPaymentProps({ kind: "gift", id: gift.id }, gift.buyerPhone) : null;
  const redeemed = !!gift.promo && gift.promo.usedCount > 0;

  const rows: [string, string][] = [
    [t.rows.book, planName(gift.plan, locale)],
    [t.rows.recipient, gift.recipientName],
    [t.rows.amount, formatPrice(gift.amount)],
  ];

  return (
    <>
      <LandingHeader loggedIn={!!user} />
      <main className="overflow-x-clip pt-24 pb-20 sm:pt-32">
        <div className="container-x grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start lg:gap-14">
          {/* Слева — сам сертификат: после оплаты на нём появляется код. На телефоне он идёт после действия. */}
          <div className="order-2 lg:sticky lg:top-24 lg:order-1">
            <GiftCardVisual locale={gift.locale} plan={gift.plan} recipientName={gift.recipientName} buyerName={gift.buyerName} message={gift.message} code={paid ? gift.promo!.code : null} />
          </div>

          <div className="order-1 space-y-8 lg:order-2">
            <div>
              <div className="text-sm text-muted">{t.number(gift.number)}</div>
              <h1 className="mt-3 font-serif text-[38px] leading-[1.05] font-medium text-balance sm:text-[52px]">{gift.status === "cancelled" ? t.cancelled : paid ? t.ready : t.oneStep}</h1>
              <Flourish className="mt-3 text-wine/45" />
              {gift.status === "pending_payment" ? <p className="mt-4 text-ink-soft">{t.payLead}</p> : paid ? <p className="mt-4 text-ink-soft">{t.readyLead}</p> : null}
            </div>

            {/* Суть заказа — квитанцией: подпись, пунктир, значение. */}
            <dl className="divide-y divide-line border-y border-line">
              {rows.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-sm text-muted">{k}</dt>
                  <dd className={k === t.rows.amount ? "font-serif text-2xl tabular-nums" : "text-right font-medium"}>{v}</dd>
                </div>
              ))}
            </dl>

            {gift.status === "pending_payment" ? (
              <GiftPayment
                token={gift.token}
                number={gift.number}
                amount={gift.amount}
                amountLabel={formatPrice(gift.amount)}
                currency={gift.currency}
                email={gift.buyerEmail}
                online={isOnlinePayment() ? { publicId: env.cloudpayments.publicId } : null}
                manual={await manualPaymentProps(m)}
                unavailable={m.common.manualPayment.unavailable}
                claimed={!!gift.paymentClaimedAt}
                kaspi={kaspi}
              />
            ) : null}

            {paid ? (
              <>
                <TrackOnce id={`gift_${gift.id}`} name="gift_purchase" value={gift.amount} />
                <section aria-labelledby="gift-next">
                  <h2 id="gift-next" className="text-sm font-semibold text-muted">{t.nextTitle}</h2>
                  <ul className="mt-3 divide-y divide-line border-y border-line text-[15px]">
                    <li className="flex items-start gap-3 py-4">
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
                      <p>
                        {t.codeBefore} <b className="tracking-wide">{gift.promo!.code}</b> {t.codeAfter(gift.buyerEmail)}
                        {gift.promo!.expiresAt ? t.validUntil(m.common.untilFull(gift.promo!.expiresAt)) : null}
                      </p>
                    </li>
                    {gift.recipientEmail ? (
                      <li className="flex items-start gap-3 py-4">
                        {gift.sentAt ? <Mail className="mt-0.5 size-5 shrink-0 text-wine" aria-hidden /> : <Clock className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />}
                        <p>{gift.sentAt ? t.sentTo(gift.recipientEmail) : t.willSend(gift.sendAt ? m.common.date(parseDay(gift.sendAt)) : t.soon, gift.recipientEmail)}</p>
                      </li>
                    ) : null}
                    {redeemed ? (
                      <li className="py-4">
                        <p className="border-l-[3px] border-wine bg-rose px-4 py-3 text-sm text-ink">{t.redeemed}</p>
                      </li>
                    ) : null}
                  </ul>
                  <a href={`/api/gifts/${gift.token}/pdf`} className="btn btn-primary btn-lg mt-5 w-full sm:w-auto">
                    <Download className="size-4" /> {t.download}
                  </a>
                </section>
                <section className="border-t border-line pt-6">
                  <div className="font-medium">{t.linkTitle}</div>
                  <p className="mt-1 text-sm text-muted">{t.linkText}</p>
                  <div className="mt-4">
                    {/* Текст для получателя — на языке сертификата */}
                    <CopyLink url={redeemUrl(gift.promo!.code, gift.locale)} text={messagesFor(gift.locale).gift.status.share(gift.recipientName)} />
                  </div>
                </section>
              </>
            ) : null}

            <p className="text-sm text-muted">
              {t.help} <a href={site.contacts.whatsapp} className="underline">WhatsApp</a> {t.helpTail(site.contacts.email)}{" "}
              <Link href="/gift" className="underline">{t.buyMore}</Link>
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
