import type { Metadata } from "next";
import { Gift, TriangleAlert } from "lucide-react";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { GiftCardVisual } from "@/components/GiftCardVisual";
import { Flourish } from "@/components/landing/FilmFrame";
import { getCurrentUser } from "@/server/auth";
import { container } from "@/server/container";
import { getLocale, getMessages } from "@/i18n/server";
import { planName } from "@/i18n/labels";
import { localizePath } from "@/i18n/config";
import { activateGiftAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).gift.redeem.meta, robots: { index: false } };
}

export default async function RedeemPage({ searchParams }: { searchParams: Promise<{ code?: string; error?: string }> }) {
  const { code, error } = await searchParams;
  const [user, locale, m] = await Promise.all([getCurrentUser(), getLocale(), getMessages()]);
  const t = m.gift.redeem;
  const ordering = container().ordering;
  const check = code ? await ordering.promos.check(code) : null;
  const gift = check?.ok ? await ordering.queries.giftByPromo(check.promo.id) : null;

  return (
    <>
      <LandingHeader loggedIn={!!user} />
      <main className="pt-28 pb-24 sm:pt-40">
        <div className="container-x max-w-5xl">
          {gift && check?.ok ? (
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <GiftCardVisual locale={gift.locale} plan={gift.plan} recipientName={gift.recipientName} buyerName={gift.buyerName} message={gift.message} code={check.promo.code} className="rotate-[-1.5deg]" />
              <div>
                <div className="text-sm text-muted">{t.forYou}</div>
                <h1 className="mt-3 font-serif text-[40px] leading-[1.06] font-medium text-balance sm:text-5xl">
                  {t.headline(gift.recipientName, gift.buyerName)}
                </h1>
                <p className="mt-5 text-lg leading-relaxed text-ink-soft">
                  {t.text(planName(gift.plan, locale))}
                </p>
                <form action={activateGiftAction} className="mt-8">
                  <input type="hidden" name="code" value={check.promo.code} />
                  <button className="btn btn-primary btn-lg">
                    <Gift className="size-5" /> {t.start}
                  </button>
                </form>
                <p className="mt-3 text-sm text-muted">{t.pace}</p>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-xl text-center">
              <h1 className="font-serif text-[42px] leading-[1.04] font-medium text-balance sm:text-6xl">{t.title}</h1>
              <Flourish className="mx-auto mt-3 text-wine/45" />
              <p className="mt-4 text-lg text-ink-soft">{t.enter}</p>
              {code && check && !check.ok ? (
                <p className="mt-6 flex items-center justify-center gap-2 text-sm text-danger">
                  <TriangleAlert className="size-4" /> {m.checkout.promo[check.error]}
                </p>
              ) : null}
              {error === "limit" ? <p className="mt-6 text-sm text-danger">{t.limit}</p> : null}
              {check?.ok && !gift ? (
                <form action={activateGiftAction} className="mt-8 rounded-[14px] border border-line bg-white p-6">
                  <input type="hidden" name="code" value={check.promo.code} />
                  <p className="text-sm">{t.promoOk}</p>
                  <button className="btn btn-primary mt-4">{t.start}</button>
                </form>
              ) : (
                <form className="mt-8 flex flex-col gap-3 sm:flex-row" action={localizePath("/redeem", locale)}>
                  <input name="code" defaultValue={code} className="input h-13 flex-1 text-center text-base font-medium tracking-widest uppercase" placeholder="GIFT-XXXX-XXXX" required maxLength={40} aria-label={t.codeAria} />
                  <button className="btn btn-primary btn-lg">{t.check}</button>
                </form>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
