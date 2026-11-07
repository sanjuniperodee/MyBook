import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { Gift } from "lucide-react";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Book3D } from "@/components/cover/Book3D";
import { GiftCardVisual } from "@/components/GiftCardVisual";
import { SampleBook } from "@/components/landing/SampleBook";
import { InteriorShowcase } from "@/components/landing/InteriorShowcase";
import { Reviews, Stars } from "@/components/landing/Reviews";
import { AnchorScroll } from "@/components/landing/AnchorScroll";
import { FilmFrame, Flourish, frameGhostBtn } from "@/components/landing/FilmFrame";
import { PriceSheet } from "@/components/landing/PriceSheet";
import { ThemeCollage } from "@/components/landing/ThemeCollage";
import { HowPath } from "@/components/landing/HowPath";
import { CoverStrip } from "@/components/landing/CoverStrip";
import { StickyStart } from "@/components/landing/StickyStart";
import { Head } from "@/components/landing/Head";
import type { SpreadSample } from "@/components/interior/InteriorSpread";
import { TrustList } from "@/components/TrustList";
import { Faq } from "@/components/Faq";
import { getTool } from "@/lib/content/tools";
import { toolsPageUi } from "@/lib/content/tools/ui";
import { getCurrentUser } from "@/server/auth";
import { siteReviews } from "@/server/reviews";
import { invitedBy } from "@/server/invite";
import { productionDays, registrationOpen, site, getVisiblePlans } from "@/config/site";
import { getLocale, getMessages } from "@/i18n/server";
import { alternates } from "@/i18n/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { absoluteUrl, faqLd, ogImage, organizationLd, productLd, socialMeta, websiteLd } from "@/lib/seo";
import { coverPhotoUrl } from "@/lib/book/photo-cover";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const { title, description } = m.landing.meta;
  return {
    title: { absolute: `${title} · ${site.name}` },
    description,
    alternates: alternates("/", locale),
    ...socialMeta({ path: "/", locale, title: `${site.name} — ${title}`, description }),
  };
}

/** Снимок первого экрана — он же на обложке книги рядом: «вот кадр, а вот он уже книга». */
const HERO_PHOTO = "couple";
/** Инструменты, которые ведём с главной (перелинковка): самые частые запросы. */
const TOOLS = ["shezhire-zheti-ata", "proverka-foto-dlya-pechati", "semejnyj-kalendar", "mushel-zhas-kalkulyator"];

/*
 * Главная. Кадр (снимок, титр, одна кнопка) → о ком книга (коллаж обложек) → как это происходит (один путь из четырёх
 * шагов с живыми макетами) → пример (большой листаемый разворот и примерка оформлений) → отзывы (крупные цитаты) →
 * цены (ведомость тарифов) → сертификат → ответы → финальный кадр. У каждого блока своя композиция; на телефоне
 * главная кнопка закреплена внизу (StickyStart) и прячется там, где на экране уже есть другая.
 */
export default async function HomePage() {
  const [user, locale, m, reviews, invited] = await Promise.all([getCurrentUser(), getLocale(), getMessages(), siteReviews(6), invitedBy()]);
  const t = m.landing;
  // Регистрацию можно закрыть в админке («Сайт»): гостю вместо «начать» — вход и пояснение.
  const guestClosed = !user && !registrationOpen();
  const cta = user ? "/books/new" : guestClosed ? "/login" : "/register";
  const ctaLabel = (label: string) => (guestClosed ? m.common.nav.login : label);
  const themeHref = (id: string) => (user ? `/books/new?theme=${id}` : guestClosed ? "/login" : `/register?theme=${id}`);
  const faq = t.faq.items(productionDays);
  // Пример для витрины оформлений — та же история, что в листаемой книге-примере.
  const s = t.sample;
  const showcase: SpreadSample = {
    language: locale,
    title: s.title,
    subtitle: s.subtitle,
    author: s.names,
    year: new Date().getFullYear(),
    dedication: s.dedication,
    dedicationPlaceholder: "",
    chapter: { number: 2, title: s.chapterTitle, epigraph: s.epigraph },
    entries: [
      { heading: s.h1, paragraphs: [s.p1, s.p2] },
      { heading: s.h2, paragraphs: [s.p3, s.p4] },
    ],
    toc: s.tocItems.map(([title, page], i) => ({ number: i + 1, title, page })),
    showToc: true,
  };
  const rating = reviews.summary && reviews.reviews.length ? reviews.summary : null;

  const planNames = Object.fromEntries(getVisiblePlans().map((p) => [p.id, m.common.plans[p.id].name]));
  const jsonLd = [
    organizationLd(m.common.meta.description, { alternateName: m.common.meta.alternateNames, address: { locality: m.common.footer.address, country: "KZ" } }),
    websiteLd(locale, m.common.meta.alternateNames),
    productLd({ name: `${site.name} — ${t.meta.title}`, description: t.meta.description, url: absoluteUrl("/", locale), image: ogImage(locale), locale, planNames, reviews: reviews }),
    faqLd(faq),
  ];
  const tools = TOOLS.map((slug) => getTool(slug)).filter((x): x is NonNullable<typeof x> => !!x);

  return (
    <>
      <JsonLd data={jsonLd} />
      <LandingHeader loggedIn={!!user} overlay />
      <AnchorScroll />
      <main className="overflow-x-clip">
        {/* ─── КАДР: снимок, титр, одно действие ─── */}
        <FilmFrame
          photo={HERO_PHOTO}
          position="62% 30%"
          mobilePosition="44% 30%"
          priority
          aside={
            <figure className="enter w-[240px] xl:w-[264px]" style={{ "--i": 3 } as React.CSSProperties}>
              <Book3D priority template="passepartout" photos={[coverPhotoUrl(HERO_PHOTO, 900)]} title={t.hero.books.love.title} subtitle={t.hero.books.love.subtitle} names={t.hero.books.love.names} rotate={18} className="drop-shadow-[0_30px_40px_rgb(0_0_0/0.55)]" />
              <figcaption className="mt-5 text-center text-sm text-white/85">{t.hero.bookCaption}</figcaption>
            </figure>
          }
        >
          {invited ? (
            // Пришли по приглашению — над титром подарок от друга.
            <p className="enter mb-6 inline-flex max-w-full items-start gap-2.5 rounded-(--r-ctl) bg-[rgb(255_255_255/0.12)] px-4 py-2.5 text-sm text-white backdrop-blur-md" style={{ "--i": 0 } as React.CSSProperties}>
              <Gift className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <b className="font-semibold">{m.invite.welcome(invited.from, invited.percent)}</b>
                <span className="block text-white/75">{m.invite.welcomeNote}</span>
              </span>
            </p>
          ) : null}
          {/* Титр — самое крупное на экране (LCP): появляется сразу, без анимации входа. */}
          <h1 className="max-w-[15ch] font-serif text-[40px] text-balance leading-[1.02] font-medium tracking-[-0.01em] text-white sm:text-[64px] lg:text-[80px]">
            {t.hero.titleStart} <span className="font-normal italic">{t.hero.titleAccent}</span>
          </h1>
          <Flourish className="mt-3 text-[rgb(255_255_255/0.6)] sm:mt-4" />
          <p className="mt-5 max-w-[34rem] text-[17px] leading-relaxed text-white/85 sm:text-lg">{t.hero.lead}</p>
          <div className="enter mt-8 flex flex-col gap-3 sm:flex-row" style={{ "--i": 2 } as React.CSSProperties}>
            <Link href={cta} data-main-cta="" className="btn btn-primary btn-lg">
              {ctaLabel(t.hero.cta)}
            </Link>
            <a href="#inside" className={frameGhostBtn}>
              {t.hero.sample}
            </a>
          </div>
          {guestClosed ? (
            <p className="mt-4 max-w-xl text-sm text-white/75" data-testid="registration-closed">
              {t.hero.closed}
            </p>
          ) : null}
          <ul className="enter mt-8 flex max-w-2xl flex-wrap gap-x-6 gap-y-2 pr-16 text-sm text-white/80 sm:pr-0" style={{ "--i": 3 } as React.CSSProperties}>
            {rating ? (
              <li>
                <a href="#reviews" className="inline-flex items-center gap-2 hover:text-white">
                  <Stars value={rating.average} className="size-3.5" />
                  {m.review.showcase.summary(rating.average.toFixed(1).replace(".", ","), rating.count)}
                </a>
              </li>
            ) : null}
            {t.hero.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </FilmFrame>

        {/* ─── О КОМ: коллаж обложек — тема книги одним касанием ─── */}
        <ThemeCollage themeHref={themeHref} />

        {/* ─── КАК: один путь из четырёх шагов, у каждого — живой макет ─── */}
        <HowPath cta={cta} ctaLabel={ctaLabel(t.hero.cta)} />

        {/* ─── ПРИМЕР: большой листаемый разворот на тёмной «сцене» ─── */}
        <section id="inside" className="below-fold scroll-mt-16 bg-spine py-20 text-white sm:py-28">
          <div className="container-x">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-end lg:gap-16">
              <h2 className="font-serif text-[34px] leading-[1.05] font-medium tracking-tight text-balance sm:text-6xl">{t.inside.title}</h2>
              <p className="text-lg leading-relaxed text-white/70">{t.inside.text}</p>
            </div>
            <div className="mx-auto mt-12 max-w-[60rem] sm:mt-16">
              <SampleBook />
              <p className="mt-3 text-center text-xs text-white/60">
                <span className="hidden md:inline">{t.inside.hintDesktop}</span>
                <span className="md:hidden">{t.inside.hintMobile}</span>
              </p>
            </div>
            <ul className="mt-14 grid border-t border-white/15 text-[15px] leading-snug text-white/85 sm:mt-20 sm:grid-cols-2 lg:grid-cols-5">
              {t.inside.bullets.map((b) => (
                <li key={b} className="border-b border-white/15 py-4 sm:pr-6 lg:border-b-0 lg:border-r lg:py-6 lg:pl-6 lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0">
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ─── КАК ВЫГЛЯДИТ: полка обложек и примерка оформления страниц ─── */}
        <CoverStrip />
        <section id="pages" className="below-fold scroll-mt-16 pb-20 sm:pb-28">
          <div className="container-x border-t border-line pt-16 sm:pt-24">
            <InteriorShowcase sample={showcase} cta={cta} />
          </div>
        </section>

        {/* ─── ОТЗЫВЫ: настоящие отзывы покупателей; пока их нет — подписи из config/site.ts, если заполнены ─── */}
        {reviews.reviews.length ? (
          <Reviews reviews={reviews.reviews} summary={reviews.summary} t={m.review.showcase} className="below-fold border-t border-line bg-cream/60" />
        ) : site.testimonials.length ? (
          <section className="below-fold border-t border-line bg-cream/60 py-20 sm:py-28">
            <div className="container-x">
              <Head title={t.testimonials.title} />
              <div className="mt-12 grid gap-12 md:grid-cols-2 md:gap-x-20">
                {site.testimonials.map((x) => (
                  <figure key={x.name}>
                    <blockquote className="font-serif text-[26px] leading-snug font-medium">«{x.text}»</blockquote>
                    <figcaption className="mt-5 text-sm text-muted">
                      <span className="font-medium text-ink">{x.name}</span>
                      {x.occasion ? `, ${x.occasion}` : ""}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* ─── ЦЕНЫ: ведомость тарифов ─── */}
        <section id="pricing" className="below-fold scroll-mt-16 border-t border-line py-20 sm:py-28">
          <div className="container-x">
            <Head title={t.pricing.title} note={t.pricing.text} />
            <PriceSheet className="mt-12" cta={cta} ctaLabel={ctaLabel(t.pricing.start)} />
            <TrustList className="mt-12" />
          </div>
        </section>

        {/* ─── СЕРТИФИКАТ ─── */}
        <section className="below-fold overflow-hidden bg-rose/50 py-20 sm:py-24">
          <div className="container-x grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-20">
            <div>
              <h2 className="font-serif text-[34px] leading-[1.05] font-medium tracking-tight text-balance sm:text-5xl">{t.gift.title}</h2>
              <p className="mt-5 text-lg leading-relaxed text-ink-soft">{t.gift.text}</p>
              <Link href="/gift" data-main-cta="" className="btn btn-primary btn-lg mt-8 max-sm:w-full">
                <Gift className="size-5" aria-hidden /> {t.gift.cta}
              </Link>
            </div>
            <GiftCardVisual locale={locale} plan="hardcover" recipientName={t.gift.card.recipient} buyerName={t.gift.card.buyer} message={t.gift.card.message} className="mx-auto max-w-xl rotate-[-1.5deg] lg:mr-0 lg:max-w-none lg:translate-x-6" />
          </div>
        </section>

        {/* ─── ВОПРОСЫ ─── */}
        <section id="faq" className="below-fold scroll-mt-16 py-20 sm:py-28">
          <div className="container-x grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] lg:gap-20">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <h2 className="font-serif text-[34px] leading-[1.05] font-medium tracking-tight text-balance sm:text-5xl">{t.faq.title}</h2>
              <p className="mt-4 text-muted">
                {t.faq.notFound}{" "}
                <a href={site.contacts.whatsapp} className="text-wine underline underline-offset-4" target="_blank" rel="noopener noreferrer">
                  {t.faq.writeUs}
                </a>{" "}
                {t.faq.reply}
              </p>
              {/* Бесплатные инструменты — тихим списком: перелинковка без отдельного блока карточек. */}
              <div className="mt-10 max-lg:hidden">
                <h3 className="text-sm font-semibold">{toolsPageUi[locale].homeTitle}</h3>
                <ul className="mt-2 divide-y divide-line border-y border-line text-[15px]">
                  {tools.map((tool) => (
                    <li key={tool.slug}>
                      <Link href={`/instrumenty/${tool.slug}`} className="flex min-h-11 items-center text-ink-soft hover:text-wine">
                        {tool.content[locale].label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link href="/instrumenty" className="flex min-h-11 items-center font-medium text-wine hover:underline">
                      {toolsPageUi[locale].all}
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
            <Faq items={faq} />
            <div className="lg:hidden">
              <h3 className="text-sm font-semibold">{toolsPageUi[locale].homeTitle}</h3>
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                {tools.map((tool) => (
                  <li key={tool.slug}>
                    <Link href={`/instrumenty/${tool.slug}`} className="inline-flex min-h-9 items-center text-ink-soft underline decoration-line-strong underline-offset-4">
                      {tool.content[locale].label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/instrumenty" className="inline-flex min-h-9 items-center font-medium text-wine">
                    {toolsPageUi[locale].all}
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* ─── ФИНАЛЬНЫЙ КАДР: тот же приём, что в начале ─── */}
        <FilmFrame photo="sunsetwalk" position="50% 55%" size="band" className="below-fold">
          <div className="max-w-2xl">
            <h2 className="font-serif text-[40px] leading-[1.04] font-medium text-white sm:text-6xl">{t.cta.title}</h2>
            <Flourish className="mt-3 text-[rgb(255_255_255/0.55)]" />
            <p className="mt-5 max-w-lg text-lg text-white/85">{t.cta.text}</p>
            <Link href={cta} data-main-cta="" className="btn btn-primary btn-lg mt-8 max-sm:w-full">
              {ctaLabel(t.cta.button)}
            </Link>
          </div>
        </FilmFrame>
      </main>
      <Footer />
      <StickyStart href={cta} label={ctaLabel(t.hero.cta)} />
    </>
  );
}
