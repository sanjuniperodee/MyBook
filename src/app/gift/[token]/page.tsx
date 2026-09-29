import type { Metadata } from "next";
import Link from "next/link";
import { TrackOnce } from "@/components/analytics/TrackOnce";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, Download, Mail } from "lucide-react";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { GiftCardVisual } from "@/components/GiftCardVisual";
import { getCurrentUser } from "@/lib/auth";
import { getGiftByToken, redeemUrl } from "@/lib/gifts";
import { isOnlinePayment } from "@/lib/payments";
import { env } from "@/lib/env";
import { formatPrice, getPlan, site } from "@/config/site";
import { humanDay } from "@/lib/occasions";
import { GiftPayment } from "./GiftPayment";
import { CopyLink } from "./CopyLink";

export const metadata: Metadata = { title: "Подарочный сертификат", robots: { index: false } };

export default async function GiftStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [gift, user] = await Promise.all([getGiftByToken(token), getCurrentUser()]);
  if (!gift) notFound();
  const plan = getPlan(gift.plan);
  const paid = gift.status === "paid" && gift.promo;
  const redeemed = !!gift.promo && gift.promo.usedCount > 0;

  return (
    <>
      <LandingHeader loggedIn={!!user} />
      <main className="pt-28 pb-20 sm:pt-32">
        <div className="container-x grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <GiftCardVisual plan={gift.plan} recipientName={gift.recipientName} buyerName={gift.buyerName} message={gift.message} code={paid ? gift.promo!.code : null} />
          </div>
          <div className="space-y-6">
            <div>
              <div className="eyebrow">Сертификат №{gift.number}</div>
              <h1 className="mt-3 font-serif text-4xl font-medium sm:text-5xl">
                {gift.status === "cancelled" ? "Сертификат отменён" : paid ? "Сертификат готов" : "Остался один шаг"}
              </h1>
              <p className="mt-3 text-ink-soft">
                Книга «{plan?.name}» · получатель: {gift.recipientName} · {formatPrice(gift.amount)}
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
                manual={site.manualPayment}
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
                      Код <b className="tracking-wide">{gift.promo!.code}</b> отправлен на {gift.buyerEmail}. Сертификат действует до {gift.promo!.expiresAt ? humanDay(gift.promo!.expiresAt) + " " + gift.promo!.expiresAt.getFullYear() : "—"}.
                    </p>
                  </div>
                  {gift.recipientEmail ? (
                    <div className="flex items-start gap-3">
                      {gift.sentAt ? <Mail className="mt-0.5 size-5 shrink-0 text-wine" /> : <Clock className="mt-0.5 size-5 shrink-0 text-muted" />}
                      <p className="text-[15px]">
                        {gift.sentAt ? `Письмо получателю отправлено на ${gift.recipientEmail}.` : `Письмо получателю уйдёт ${gift.sendAt ? humanDay(gift.sendAt) : "в ближайшие минуты"} на ${gift.recipientEmail}.`}
                      </p>
                    </div>
                  ) : null}
                  {redeemed ? <p className="rounded-xl bg-cream px-4 py-3 text-sm">Сертификат уже использован — книга заказана.</p> : null}
                  <a href={`/api/gifts/${gift.token}/pdf`} className="btn btn-primary">
                    <Download className="size-4" /> Скачать PDF для печати
                  </a>
                </div>
                <div className="card p-6">
                  <div className="font-medium">Ссылка для получателя</div>
                  <p className="mt-1 text-sm text-muted">По ней откроется страница с вашим пожеланием и кнопкой «Начать книгу» — код подставится сам.</p>
                  <div className="mt-4">
                    <CopyLink url={redeemUrl(gift.promo!.code)} text={`${gift.recipientName}, это тебе подарок — книга, которую ты напишешь сам(а):`} />
                  </div>
                </div>
              </>
            ) : null}

            <p className="text-sm text-muted">
              Вопросы? Напишите нам в <a href={site.contacts.whatsapp} className="underline">WhatsApp</a> или на {site.contacts.email} — укажите номер сертификата.{" "}
              <Link href="/gift" className="underline">Купить ещё один</Link>
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
