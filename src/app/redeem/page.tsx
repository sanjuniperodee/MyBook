import type { Metadata } from "next";
import { Gift, TriangleAlert } from "lucide-react";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { GiftCardVisual } from "@/components/GiftCardVisual";
import { FilmFrame, Flourish } from "@/components/landing/FilmFrame";
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

  // Подарок найден — страница-«кадр»: одно действие, ничего лишнего. Без кода — спокойный ввод на бумаге.
  if (gift && check?.ok) {
    const card = <GiftCardVisual locale={gift.locale} plan={gift.plan} recipientName={gift.recipientName} buyerName={gift.buyerName} message={gift.message} code={check.promo.code} className="w-full max-w-[34rem]" />;
    return (
      <>
        <LandingHeader loggedIn={!!user} overlay />
        <FilmFrame photo="postcards" position="50% 45%" priority aside={<div className="w-[30rem]">{card}</div>} label={t.title}>
          <div className="max-w-xl">
            <div className="text-sm font-medium text-white/75">{t.forYou}</div>
            <h1 className="mt-3 font-serif text-[40px] leading-[1.05] font-medium text-balance sm:text-6xl">{t.headline(gift.recipientName, gift.buyerName)}</h1>
            <Flourish className="mt-3 text-white/55" />
            <p className="mt-5 text-[17px] leading-relaxed text-white/85 sm:text-lg">{t.text(planName(gift.plan, locale))}</p>
            <div className="mt-8 lg:hidden">{card}</div>
            <form action={activateGiftAction} className="mt-8">
              <input type="hidden" name="code" value={check.promo.code} />
              <button className="btn btn-primary btn-lg w-full sm:w-auto">
                <Gift className="size-5" /> {t.start}
              </button>
            </form>
            <p className="mt-4 text-sm text-white/70">{t.pace}</p>
          </div>
        </FilmFrame>
        <Footer />
      </>
    );
  }

  return (
    <>
      <LandingHeader loggedIn={!!user} />
      <main className="pt-28 pb-24 sm:pt-40">
        <div className="container-x max-w-xl">
          <h1 className="font-serif text-[40px] leading-[1.04] font-medium text-balance sm:text-6xl">{t.title}</h1>
          <Flourish className="mt-3 text-wine/45" />
          <p className="mt-5 text-lg leading-relaxed text-ink-soft">{t.enter}</p>
          {code && check && !check.ok ? (
            <p role="alert" className="mt-6 flex items-start gap-2 border-l-[3px] border-danger bg-danger-bg px-4 py-3 text-sm text-danger">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {m.checkout.promo[check.error]}
            </p>
          ) : null}
          {error === "limit" ? <p role="alert" className="mt-6 border-l-[3px] border-danger bg-danger-bg px-4 py-3 text-sm text-danger">{t.limit}</p> : null}
          {check?.ok && !gift ? (
            <form action={activateGiftAction} className="mt-8 border-y border-line py-6">
              <input type="hidden" name="code" value={check.promo.code} />
              <p className="leading-relaxed">{t.promoOk}</p>
              <button className="btn btn-primary btn-lg mt-5 w-full sm:w-auto">{t.start}</button>
            </form>
          ) : (
            <form className="mt-8 space-y-3" action={localizePath("/redeem", locale)}>
              <input name="code" defaultValue={code} className="input h-14 text-center text-lg font-medium tracking-widest uppercase" placeholder="GIFT-XXXX-XXXX" required maxLength={40} aria-label={t.codeAria} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
              <button className="btn btn-primary btn-lg w-full">{t.check}</button>
            </form>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
