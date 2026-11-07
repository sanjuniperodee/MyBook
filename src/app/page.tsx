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
import { SectionHead } from "@/components/landing/SectionHead";
import type { SpreadSample } from "@/components/interior/InteriorSpread";
import { TrustList } from "@/components/TrustList";
import { Faq } from "@/components/Faq";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { coverTemplates } from "@/lib/book/covers";
import { coverPhotoUrl } from "@/lib/book/photo-cover";
import { countQuestions, getTheme, giftThemes } from "@/lib/content/themes";
import { getLanding, landings, type Landing } from "@/lib/content/landings";
import { getTool } from "@/lib/content/tools";
import { toolsPageUi } from "@/lib/content/tools/ui";
import { getCurrentUser } from "@/server/auth";
import { siteReviews } from "@/server/reviews";
import { invitedBy } from "@/server/invite";
import { productionDays, registrationOpen, site, getVisiblePlans } from "@/config/site";
import { getLocale, getMessages } from "@/i18n/server";
import { alternates } from "@/i18n/seo";
import { coverName } from "@/i18n/labels";
import { JsonLd } from "@/components/seo/JsonLd";
import { absoluteUrl, faqLd, ogImage, organizationLd, productLd, socialMeta, websiteLd } from "@/lib/seo";

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
/** Обложки для ряда «Обложки»: снимки и рисунки вперемешку — видно, что выбор широкий. */
const COVER_ROW = ["peony", "milkyway", "flax", "roses", "alatau", "lavender", "oyu", "mist", "sakura", "leather", "surf", "constellation"];

/*
 * Главная: что это — за 5 секунд (кадр, титр, одна кнопка), о ком книга (полка тем), доказательство (листаемая книга),
 * как это происходит (настоящая последовательность со сроками), как она выглядит (обложки и страницы), отзывы, цены,
 * сертификат, ответы и финальный кадр. Каждый блок — одна мысль; карточек-близнецов нет.
 */
export default async function HomePage() {
  const [user, locale, m, reviews, invited] = await Promise.all([getCurrentUser(), getLocale(), getMessages(), siteReviews(6), invitedBy()]);
  const t = m.landing;
  // Регистрацию можно закрыть в админке («Сайт»): гостю вместо «начать» — вход и пояснение.
  const guestClosed = !user && !registrationOpen();
  const cta = user ? "/books/new" : guestClosed ? "/login" : "/register";
  const ctaLabel = (label: string) => (guestClosed ? m.common.nav.login : label);
  const themeHref = (id: string) => (user ? `/books/new?theme=${id}` : guestClosed ? "/login" : `/register?theme=${id}`);
  const themes = giftThemes(locale);
  // Число вопросов в шагах «как это работает» — по теме «любимому», а не по первому элементу списка.
  const loveCount = countQuestions(getTheme("love", locale));
  const modeThemes = [getTheme("autobiography", locale), getTheme("blank", locale)];
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
  const covers = COVER_ROW.map((id) => coverTemplates.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c && !c.requiresPhoto);
  const steps = t.how.steps(loveCount);
  const when = t.how.when(productionDays.standard);
  const rating = reviews.summary && reviews.reviews.length ? reviews.summary : null;

  const planNames = Object.fromEntries(getVisiblePlans().map((p) => [p.id, m.common.plans[p.id].name]));
  const jsonLd = [
    organizationLd(m.common.meta.description, { alternateName: m.common.meta.alternateNames, address: { locality: m.common.footer.address, country: "KZ" } }),
    websiteLd(locale, m.common.meta.alternateNames),
    productLd({ name: `${site.name} — ${t.meta.title}`, description: t.meta.description, url: absoluteUrl("/", locale), image: ogImage(locale), locale, planNames, reviews: reviews }),
    faqLd(faq),
  ];

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
            <p className="enter mb-6 inline-flex max-w-full items-start gap-2.5 rounded-[10px] bg-[rgb(255_255_255/0.12)] px-4 py-2.5 text-sm text-white backdrop-blur-md" style={{ "--i": 0 } as React.CSSProperties}>
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
            <Link href={cta} className="btn btn-primary btn-lg">
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
          <ul className="enter mt-8 flex max-w-2xl flex-wrap gap-x-6 gap-y-2 text-sm text-white/80" style={{ "--i": 3 } as React.CSSProperties}>
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

        {/* ─── О КОМ: полка обложек — тема книги одним касанием ─── */}
        <section id="themes" className="scroll-mt-20 py-20 sm:py-28">
          <div className="container-x">
            <SectionHead title={t.themes.title} note={t.themes.note} />
            <ul className="no-scrollbar -mx-4 mt-12 flex scroll-px-4 snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-x-5 sm:gap-y-10 sm:overflow-visible sm:px-0 md:grid-cols-5 lg:grid-cols-7">
              {[...themes, ...modeThemes].map((th) => {
                const self = th.id === "autobiography" || th.id === "blank";
                const names = th.id === "blank" ? t.modes.blank.names : th.id === "autobiography" ? t.modes.autobiography.names : t.coverSamples[th.defaultCover]?.names;
                const meta = th.id === "blank" ? t.modes.blank.meta : th.id === "autobiography" ? t.modes.autobiography.meta(countQuestions(th)) : t.themes.meta(countQuestions(th), th.chapters.length);
                return (
                  <li key={th.id} className="w-[38%] shrink-0 snap-start sm:w-auto">
                    <Link href={themeHref(th.id)} className="group block rounded-[10px]">
                      <div className="transition duration-500 ease-[var(--ease-out-soft)] group-hover:-translate-y-1.5">
                        <CoverPreview template={th.defaultCover} title={th.titleSuggestions[0]} names={names} lite className="rounded-[3px] shadow-book" />
                      </div>
                      <div className="mt-3.5 text-[15px] leading-snug font-medium text-ink group-hover:text-wine">{th.name}</div>
                      <div className="mt-0.5 text-xs leading-snug text-muted">{self ? t.modes.eyebrow : meta}</div>
                    </Link>
                  </li>
                );
              })}
              <li className="w-[38%] shrink-0 snap-start sm:w-auto">
                <Link href="/kniga" className="flex aspect-[148/210] flex-col justify-end rounded-[3px] border border-line-strong p-4 font-serif text-xl leading-tight text-ink transition hover:border-wine hover:text-wine">
                  {m.common.footer.allIdeas}
                </Link>
              </li>
            </ul>
            {/* Поводы и посадочные страницы — путь и для человека, и для поисковика. */}
            <p className="mt-10 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
              <span>{t.themes.learn}</span>
              {[
                ...themes.map((th) => landings.find((l) => l.theme === th.id)),
                ...t.occasions.items.map((o) => (o.slug ? getLanding(o.slug) : undefined)),
                getLanding("kniga-o-svoej-zhizni"),
                getLanding("svoya-kniga-s-nulya"),
              ]
                .filter((l): l is Landing => !!l)
                .filter((l, i, all) => all.findIndex((x) => x.slug === l.slug) === i)
                .map((l) => (
                  <Link key={l.slug} href={`/kniga/${l.slug}`} className="text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-wine hover:decoration-wine">
                    {l.content[locale].label}
                  </Link>
                ))}
            </p>
          </div>
        </section>

        {/* ─── ДОКАЗАТЕЛЬСТВО: листаемая книга ─── */}
        <section id="inside" className="below-fold scroll-mt-16 bg-ink py-20 text-paper sm:py-28">
          <div className="container-x grid items-center gap-14 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <h2 className="font-serif text-4xl leading-[1.05] font-medium tracking-tight sm:text-5xl">{t.inside.title}</h2>
              <p className="mt-5 text-lg leading-relaxed text-paper/70">{t.inside.text}</p>
              <ul className="mt-8 divide-y divide-paper/10 border-y border-paper/10">
                {t.inside.bullets.map((b) => (
                  <li key={b} className="py-3 text-[15px] text-paper/85">
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <SampleBook />
              <p className="mt-3 text-center text-xs text-paper/50">
                <span className="hidden md:inline">{t.inside.hintDesktop}</span>
                <span className="md:hidden">{t.inside.hintMobile}</span>
              </p>
            </div>
          </div>
        </section>

        {/* ─── КАК: настоящая последовательность со сроками ─── */}
        <section id="how" className="below-fold scroll-mt-16 py-20 sm:py-28">
          <div className="container-x">
            <SectionHead title={t.how.title} />
            <ol className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {steps.map((step, i) => (
                <li key={step.title} className="border-t border-ink/80 pt-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-serif text-5xl leading-none text-wine tabular-nums">{i + 1}</span>
                    <span className="text-right text-xs text-muted">{when[i]}</span>
                  </div>
                  <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{step.text}</p>
                </li>
              ))}
            </ol>
            <div className="mt-12">
              <Link href={cta} className="btn btn-primary btn-lg">
                {ctaLabel(t.hero.cta)}
              </Link>
            </div>
          </div>
        </section>

        {/* ─── КАК ВЫГЛЯДИТ: обложки и страницы ─── */}
        <section id="covers" className="below-fold scroll-mt-16 border-t border-line bg-cream/60 py-20 sm:py-28">
          <div className="container-x">
            <SectionHead
              title={t.covers.title(coverTemplates.filter((c) => !c.requiresPhoto).length, coverTemplates.filter((c) => c.requiresPhoto).length)}
              note={t.covers.text}
            />
            <ul className="no-scrollbar -mx-4 mt-12 flex scroll-px-4 snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-6">
              {covers.map((c) => {
                const sample = t.coverSamples[c.id];
                return (
                  <li key={c.id} className="w-[34%] shrink-0 snap-start sm:w-auto">
                    <CoverPreview template={c.id} title={sample.title} names={sample.names} lite className="rounded-[3px] shadow-book" />
                    <div className="mt-2.5 text-xs text-muted">{coverName(c.id, locale)}</div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
        <section id="pages" className="below-fold scroll-mt-16 bg-cream/60 pb-20 sm:pb-28">
          <div className="container-x border-t border-line pt-16 sm:pt-20">
            <InteriorShowcase sample={showcase} cta={cta} />
          </div>
        </section>

        {/* ─── ОТЗЫВЫ: настоящие отзывы покупателей; пока их нет — подписи из config/site.ts, если заполнены ─── */}
        {reviews.reviews.length ? (
          <Reviews reviews={reviews.reviews} summary={reviews.summary} t={m.review.showcase} className="below-fold" />
        ) : site.testimonials.length ? (
          <section className="below-fold py-20 sm:py-28">
            <div className="container-x">
              <SectionHead title={t.testimonials.title} />
              <div className="mt-12 grid gap-10 md:grid-cols-3">
                {site.testimonials.map((x) => (
                  <figure key={x.name} className="border-t border-line pt-6">
                    <blockquote className="font-serif text-xl leading-snug">«{x.text}»</blockquote>
                    <figcaption className="mt-5 text-sm text-muted">
                      {x.name}
                      {x.occasion ? `, ${x.occasion}` : ""}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* ─── ЦЕНЫ ─── */}
        <section id="pricing" className="below-fold scroll-mt-16 border-t border-line py-20 sm:py-28">
          <div className="container-x">
            <SectionHead title={t.pricing.title} note={t.pricing.text} />
            <PriceSheet className="mt-12" cta={cta} ctaLabel={ctaLabel(t.pricing.start)} />
            <TrustList className="mt-14" />
          </div>
        </section>

        {/* ─── СЕРТИФИКАТ ─── */}
        <section className="below-fold bg-rose/50 py-20 sm:py-24">
          <div className="container-x grid items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
            <div>
              <h2 className="font-serif text-4xl leading-[1.05] font-medium tracking-tight sm:text-5xl">{t.gift.title}</h2>
              <p className="mt-5 text-lg leading-relaxed text-ink-soft">{t.gift.text}</p>
              <Link href="/gift" className="btn btn-primary btn-lg mt-8">
                <Gift className="size-5" aria-hidden /> {t.gift.cta}
              </Link>
            </div>
            <GiftCardVisual locale={locale} plan="hardcover" recipientName={t.gift.card.recipient} buyerName={t.gift.card.buyer} message={t.gift.card.message} className="mx-auto max-w-xl rotate-[-1.5deg]" />
          </div>
        </section>

        {/* ─── ВОПРОСЫ ─── */}
        <section id="faq" className="below-fold scroll-mt-16 py-20 sm:py-28">
          <div className="container-x grid gap-12 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
            <div>
              <h2 className="font-serif text-4xl leading-[1.05] font-medium tracking-tight sm:text-5xl">{t.faq.title}</h2>
              <p className="mt-4 text-muted">
                {t.faq.notFound}{" "}
                <a href={site.contacts.whatsapp} className="text-wine underline underline-offset-4" target="_blank" rel="noopener noreferrer">
                  {t.faq.writeUs}
                </a>{" "}
                {t.faq.reply}
              </p>
              {/* Бесплатные инструменты — тихим списком: перелинковка без отдельного блока карточек. */}
              <div className="mt-12 hidden lg:block">
                <h3 className="text-sm font-semibold">{toolsPageUi[locale].homeTitle}</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {TOOLS.map((slug) => getTool(slug)).map((tool) =>
                    tool ? (
                      <li key={tool.slug}>
                        <Link href={`/instrumenty/${tool.slug}`} className="text-ink-soft hover:text-wine">
                          {tool.content[locale].label}
                        </Link>
                      </li>
                    ) : null,
                  )}
                  <li>
                    <Link href="/instrumenty" className="font-medium text-wine hover:underline">
                      {toolsPageUi[locale].all}
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
            <Faq items={faq} />
            <div className="lg:hidden">
              <h3 className="text-sm font-semibold">{toolsPageUi[locale].homeTitle}</h3>
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {TOOLS.map((slug) => getTool(slug)).map((tool) =>
                  tool ? (
                    <li key={tool.slug}>
                      <Link href={`/instrumenty/${tool.slug}`} className="text-ink-soft underline decoration-line-strong underline-offset-4">
                        {tool.content[locale].label}
                      </Link>
                    </li>
                  ) : null,
                )}
                <li>
                  <Link href="/instrumenty" className="font-medium text-wine">
                    {toolsPageUi[locale].all}
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* ─── ФИНАЛЬНЫЙ КАДР ─── */}
        <FilmFrame photo="sunsetwalk" position="50% 55%" size="band" className="below-fold">
          <div className="max-w-2xl">
            <h2 className="font-serif text-[40px] leading-[1.04] font-medium text-white sm:text-6xl">{t.cta.title}</h2>
            <Flourish className="mt-3 text-[rgb(255_255_255/0.55)]" />
            <p className="mt-5 max-w-lg text-lg text-white/85">{t.cta.text}</p>
            <Link href={cta} className="btn btn-primary btn-lg mt-8">
              {ctaLabel(t.cta.button)}
            </Link>
          </div>
        </FilmFrame>
      </main>
      <Footer />
    </>
  );
}
