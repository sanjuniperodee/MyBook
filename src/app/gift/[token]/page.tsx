import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { TrackOnce } from "@/components/analytics/TrackOnce";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, Download, Mail } from "lucide-react";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { GiftCardVisual } from "@/components/GiftCardVisual";
import { getCurrentUser } from "@/lib/auth";
import { container } from "@/server/container";
import { isOnlinePayment, redeemUrl } from "@/modules/ordering";
import { env } from "@/lib/env";
import { formatPrice, site } from "@/config/site";
import { parseDay } from "@/lib/occasions";
import { getLocale, getMessages } from "@/i18n/server";
import { planName } from "@/i18n/labels";
import { messagesFor } from "@/i18n/messages";
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
  const redeemed = !!gift.promo && gift.promo.usedCount > 0;

  return (
    <>
      <LandingHeader loggedIn={!!user} />
      <main className="pt-28 pb-20 sm:pt-32">
        <div className="container-x grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <GiftCardVisual locale={gift.locale} plan={gift.plan} recipientName={gift.recipientName} buyerName={gift.buyerName} message={gift.message} code={paid ? gift.promo!.code : null} />
          </div>
          <div className="space-y-6">
            <div>
              <div className="eyebrow">{t.number(gift.number)}</div>
              <h1 className="mt-3 font-serif text-4xl font-medium sm:text-5xl">
                {gift.status === "cancelled" ? t.cancelled : paid ? t.ready : t.oneStep}
              </h1>
              <p className="mt-3 text-ink-soft">
                {t.summary(planName(gift.plan, locale), gift.recipientName, formatPrice(gift.amount))}
              </p>
            </div>

            {gift.status === "pending_payment" ? (
              <GiftPayment
                token={gift.token}
                number={gift.number}
                amount={gift.amount}
                amountLabel={formatPrice(gift.amount)}
                currency={gift.currency}
                email={gift.buyerEmail}
                online={isOnlinePayment() ? { publicId: env.cloudpayments.publicId } : null}
                manual={m.common.manualPayment}
                claimed={!!gift.paymentClaimedAt}
              />
            ) : null}

            {paid ? (
              <>
                <TrackOnce id={`gift_${gift.id}`} name="gift_purchase" value={gift.amount} />
                <div className="card space-y-4 p-6">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                    <p className="text-[15px]">
                      {t.codeBefore} <b className="tracking-wide">{gift.promo!.code}</b> {t.codeAfter(gift.buyerEmail)}
                      {gift.promo!.expiresAt ? t.validUntil(m.common.untilFull(gift.promo!.expiresAt)) : null}
                    </p>
                  </div>
                  {gift.recipientEmail ? (
                    <div className="flex items-start gap-3">
                      {gift.sentAt ? <Mail className="mt-0.5 size-5 shrink-0 text-wine" /> : <Clock className="mt-0.5 size-5 shrink-0 text-muted" />}
                      <p className="text-[15px]">
                        {gift.sentAt ? t.sentTo(gift.recipientEmail) : t.willSend(gift.sendAt ? m.common.date(parseDay(gift.sendAt)) : t.soon, gift.recipientEmail)}
                      </p>
                    </div>
                  ) : null}
                  {redeemed ? <p className="rounded-xl bg-cream px-4 py-3 text-sm">{t.redeemed}</p> : null}
                  <a href={`/api/gifts/${gift.token}/pdf`} className="btn btn-primary">
                    <Download className="size-4" /> {t.download}
                  </a>
                </div>
                <div className="card p-6">
                  <div className="font-medium">{t.linkTitle}</div>
                  <p className="mt-1 text-sm text-muted">{t.linkText}</p>
                  <div className="mt-4">
                    {/* Текст для получателя — на языке сертификата */}
                    <CopyLink url={redeemUrl(gift.promo!.code, gift.locale)} text={messagesFor(gift.locale).gift.status.share(gift.recipientName)} />
                  </div>
                </div>
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
