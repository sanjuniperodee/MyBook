import type { Metadata } from "next";
import { Gift, TriangleAlert } from "lucide-react";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { GiftCardVisual } from "@/components/GiftCardVisual";
import { getCurrentUser } from "@/lib/auth";
import { findValidPromo } from "@/lib/promo";
import { getGiftByPromo } from "@/lib/gifts";
import { getPlan } from "@/config/site";
import { activateGiftAction } from "./actions";

export const metadata: Metadata = { title: "Активировать сертификат", robots: { index: false } };

export default async function RedeemPage({ searchParams }: { searchParams: Promise<{ code?: string; error?: string }> }) {
  const { code, error } = await searchParams;
  const user = await getCurrentUser();
  const check = code ? await findValidPromo(code) : null;
  const gift = check?.ok ? await getGiftByPromo(check.promo.id) : null;

  return (
    <>
      <LandingHeader loggedIn={!!user} />
      <main className="pt-28 pb-20 sm:pt-36">
        <div className="container-x max-w-5xl">
          {gift && check?.ok ? (
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <GiftCardVisual plan={gift.plan} recipientName={gift.recipientName} buyerName={gift.buyerName} message={gift.message} code={check.promo.code} className="rotate-[-1.5deg]" />
              <div>
                <div className="eyebrow">Это подарок для вас</div>
                <h1 className="mt-3 font-serif text-4xl leading-tight font-medium sm:text-5xl">
                  {gift.recipientName}, {gift.buyerName} дарит вам книгу
                </h1>
                <p className="mt-5 text-lg leading-relaxed text-ink-soft">
                  Вы напишете её сами: ответите на тёплые вопросы, добавите фотографии и выберете обложку. Мы сверстаем всё как настоящее издание. Книга «{getPlan(gift.plan)?.name}» уже оплачена — код применится при оформлении заказа.
                </p>
                <form action={activateGiftAction} className="mt-8">
                  <input type="hidden" name="code" value={check.promo.code} />
                  <button className="btn btn-primary btn-lg">
                    <Gift className="size-5" /> Начать книгу
                  </button>
                </form>
                <p className="mt-3 text-sm text-muted">Писать можно в своём темпе — всё сохраняется автоматически.</p>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-xl text-center">
              <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-rose text-wine">
                <Gift className="size-6" />
              </span>
              <h1 className="mt-6 font-serif text-4xl font-medium sm:text-5xl">Активировать сертификат</h1>
              <p className="mt-3 text-ink-soft">Введите код с сертификата — он выглядит как GIFT-XXXX-XXXX.</p>
              {code && check && !check.ok ? (
                <p className="mt-6 flex items-center justify-center gap-2 text-sm text-red-700">
                  <TriangleAlert className="size-4" /> {check.error}
                </p>
              ) : null}
              {error === "limit" ? <p className="mt-6 text-sm text-red-700">Слишком много попыток. Попробуйте через несколько минут.</p> : null}
              {check?.ok && !gift ? (
                <form action={activateGiftAction} className="mt-6 rounded-2xl bg-cream p-5">
                  <input type="hidden" name="code" value={check.promo.code} />
                  <p className="text-sm">Промокод действует — он применится при оформлении заказа.</p>
                  <button className="btn btn-primary mt-4">Начать книгу</button>
                </form>
              ) : (
                <form className="mt-8 flex flex-col gap-3 sm:flex-row" action="/redeem">
                  <input name="code" defaultValue={code} className="input h-12 flex-1 text-center font-medium tracking-widest uppercase" placeholder="GIFT-XXXX-XXXX" required maxLength={40} aria-label="Код сертификата" />
                  <button className="btn btn-primary btn-lg">Проверить</button>
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
