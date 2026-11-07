import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { notFound } from "next/navigation";
import { CalendarHeart, Gift } from "lucide-react";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Book3D } from "@/components/cover/Book3D";
import { coverTemplates } from "@/lib/book/covers";
import { getCurrentUser } from "@/server/auth";
import { siteReviews } from "@/server/reviews";
import { Reviews } from "@/components/landing/Reviews";
import { FilmFrame, Flourish, frameGhostBtn, themePhoto } from "@/components/landing/FilmFrame";
import { PriceSheet } from "@/components/landing/PriceSheet";
import { StickyStart } from "@/components/landing/StickyStart";
import { TrustList } from "@/components/TrustList";
import { Faq } from "@/components/Faq";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { articles } from "@/lib/content/articles";
import { getLanding, landings } from "@/lib/content/landings";
import { chapterTitle, countQuestions, getTheme } from "@/lib/content/themes";
import { applyGender } from "@/lib/content/gender";
import { bookKind, hasQuestionBank } from "@/lib/content/kinds";
import { deadlineFor, getOccasion, nextFixedDate } from "@/lib/occasions";
import { formatPrice, getPlan, registrationOpen, site, getVisiblePlans } from "@/config/site";
import { JsonLd } from "@/components/seo/JsonLd";
import { absoluteUrl, breadcrumbLd, faqLd, ogImage, productLd, socialMeta } from "@/lib/seo";
import { getLocale, getMessages } from "@/i18n/server";
import { alternates } from "@/i18n/seo";

// Тексты статичные, но подсказка «закажите до …» зависит от даты — обновляем раз в час.
export const revalidate = 3600;

export function generateStaticParams() {
  return landings.map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const l = getLanding((await params).slug);
  if (!l) return {};
  const locale = await getLocale();
  const c = l.content[locale];
  const path = `/kniga/${l.slug}`;
  return {
    title: { absolute: `${c.metaTitle} · ${site.name}` },
    description: c.metaDescription,
    alternates: alternates(path, locale),
    ...socialMeta({ path, locale, title: c.metaTitle, description: c.metaDescription, key: l.slug }),
  };
}

export default async function LandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const l = getLanding((await params).slug);
  if (!l) notFound();
  const [user, locale, m, reviews] = await Promise.all([getCurrentUser(), getLocale(), getMessages(), siteReviews(3, l.theme)]);
  const c = l.content[locale];
  const t = m.landing;
  const sp = t.seoPage;
  const theme = getTheme(l.theme, locale);
  // У автобиографии и своей книги получателя нет: род адресата не нужен, берём род автора.
  const g = (s: string) => applyGender(s, l.authorGender, l.recipientGender ?? l.authorGender);
  const blank = bookKind(l.theme) === "blank";
  // По одному вопросу из разных глав — показываем, о чём будет книга. Своя книга без банка: вместо них — блок о редакторе.
  const samples = (hasQuestionBank(l.theme) ? theme.chapters : [])
    .filter((_, i) => i % Math.max(1, Math.floor(theme.chapters.length / 6)) === 0)
    .slice(0, 6)
    .filter((ch) => ch.questions.length)
    .map((ch) => ({ chapter: g(chapterTitle(theme, ch.key, locale)), prompt: g(ch.questions[0][0]) }));
  const occasion = getOccasion(l.occasion);
  const fixed = occasion ? nextFixedDate(occasion, new Date()) : null;
  const dl = fixed ? deadlineFor(fixed, new Date()) : null;
  const guestClosed = !user && !registrationOpen();
  const cta = user ? `/books/new?theme=${l.theme}` : guestClosed ? "/login" : `/register?theme=${l.theme}`;
  const ctaLabel = (label: string) => (guestClosed ? m.common.nav.login : label);
  const minPrice = Math.min(...getVisiblePlans().map((p) => p.price));

  const path = `/kniga/${l.slug}`;
  const faqItems: [string, string][] = [...c.faq, [sp.priceQ, sp.priceA(formatPrice(minPrice), formatPrice(getPlan("hardcover")!.price))]];
  // Ссылки на другие идеи: сначала той же темы, остальные — после; статьи блога по теме.
  const ideas = [...landings.filter((x) => x.slug !== l.slug && x.theme === l.theme), ...landings.filter((x) => x.theme !== l.theme)].slice(0, 9);
  const guides = articles.filter((x) => x.theme === l.theme || x.landings.includes(l.slug)).slice(0, 3);
  const planNames = Object.fromEntries(getVisiblePlans().map((p) => [p.id, m.common.plans[p.id].name]));
  const jsonLd = [
    productLd({ name: sp.productName(site.name, c.label), description: c.metaDescription, url: absoluteUrl(path, locale), image: ogImage(locale, l.slug), locale, planNames, reviews }),
    faqLd(faqItems),
    // Те же уровни, что в видимых крошках: главная → все идеи → страница.
    breadcrumbLd(
      [
        { name: sp.home, path: "/" },
        { name: sp.allIdeas, path: "/kniga" },
        { name: c.label, path },
      ],
      locale,
    ),
  ];

  const photo = themePhoto[l.theme];

  return (
    <>
      <LandingHeader loggedIn={!!user} overlay />
      <JsonLd data={jsonLd} />
      <main className="overflow-x-clip">
        {/* ─── КАДР: снимок о тех, кому книга, титр и одно действие ─── */}
        <FilmFrame
          photo={photo.key}
          position={photo.position}
          priority
          aside={
            <div className="enter w-[230px] xl:w-[250px]" style={{ "--i": 2 } as React.CSSProperties}>
              <Book3D priority template={l.coverTemplate} title={c.cover.title} subtitle={c.cover.subtitle} names={c.cover.names} rotate={18} className="drop-shadow-[0_30px_40px_rgb(0_0_0/0.55)]" />
            </div>
          }
        >
          <Breadcrumbs tone="dark" className="max-sm:hidden" items={[{ name: sp.home, href: "/" }, { name: sp.allIdeas, href: "/kniga" }, { name: c.label }]} />
          <h1 className="max-w-3xl font-serif text-[42px] text-balance leading-[1.03] font-medium tracking-[-0.01em] text-white sm:text-6xl lg:text-[72px]">
            {c.h1} <span className="font-normal italic">{c.accent}</span>
          </h1>
          <Flourish className="mt-3 text-[rgb(255_255_255/0.6)]" />
          <p className="mt-5 max-w-[34rem] text-[17px] leading-relaxed text-white/85 sm:text-lg">{c.lead}</p>
          {dl && occasion && dl.state !== "past" ? (
            <p className="mt-6 inline-flex max-w-full items-start gap-2.5 rounded-(--r-ctl) bg-[rgb(255_255_255/0.12)] px-4 py-2.5 text-sm text-white backdrop-blur-md">
              <CalendarHeart className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {dl.state === "digital"
                  ? m.common.occasion.digitalOnly
                  : dl.state === "premium"
                    ? m.common.occasion.premiumOnly(dl.orderByPremium)
                    : m.common.occasion.orderBy(m.common.occasions[occasion.id], dl.daysToTarget, dl.orderBy)}
              </span>
            </p>
          ) : null}
          <div className="enter mt-8 flex flex-col gap-3 sm:flex-row" style={{ "--i": 1 } as React.CSSProperties}>
            <Link href={cta} data-main-cta="" className="btn btn-primary btn-lg">
              {ctaLabel(t.hero.cta)}
            </Link>
            <Link href="/gift" className={frameGhostBtn}>
              <Gift className="size-5" aria-hidden /> {t.gift.cta}
            </Link>
          </div>
          <p className="mt-5 text-sm text-white/75">{sp.priceNote(formatPrice(minPrice))}</p>
        </FilmFrame>

        {/* ─── ПОЧЕМУ: главный довод крупно, два других — рядом, разделены линией ─── */}
        <section className="border-b border-line py-16 sm:py-24">
          <div className="container-x grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-20">
            <div>
              <h2 className="font-serif text-[32px] leading-[1.08] font-medium tracking-tight text-balance sm:text-[48px]">{c.why[0].title}</h2>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft sm:text-xl">{c.why[0].text}</p>
            </div>
            <div className="divide-y divide-line border-y border-line lg:border-y-0 lg:border-l lg:pl-14">
              {c.why.slice(1).map((w) => (
                <div key={w.title} className="py-7 first:pt-0 last:pb-0 max-lg:first:pt-7 max-lg:last:pb-7 lg:py-9">
                  <h2 className="font-serif text-2xl leading-snug font-medium">{w.title}</h2>
                  <p className="mt-3 leading-relaxed text-ink-soft">{w.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── О ЧЁМ: вопросы из книги, как оглавление анкеты (своя книга — как устроен редактор) ─── */}
        <section className="py-20 sm:py-28">
          <div className="container-x grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] lg:gap-20">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <h2 className="font-serif text-[34px] leading-[1.05] font-medium tracking-tight text-balance sm:text-5xl">{blank ? sp.editor.title : sp.aboutTitle(countQuestions(theme))}</h2>
              <p className="mt-4 max-w-sm leading-relaxed text-muted">{blank ? sp.editor.note : sp.aboutNote}</p>
            </div>
            {blank ? (
              <dl className="divide-y divide-line border-y border-line">
                {sp.editor.items.map((it) => (
                  <div key={it.title} className="grid gap-2 py-6 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-8">
                    <dt className="font-serif text-2xl leading-snug font-medium text-wine">{it.title}</dt>
                    <dd className="text-[17px] leading-relaxed text-ink-soft">{it.text}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <ol className="divide-y divide-line border-y border-line">
                {samples.map((q, i) => (
                  <li key={q.prompt} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 py-6 sm:grid-cols-[3.5rem_minmax(0,1fr)]">
                    <span className="font-serif text-3xl leading-none text-wine italic tabular-nums">{i + 1}</span>
                    <div>
                      <div className="text-sm text-muted">{q.chapter}</div>
                      <p className="mt-1.5 font-serif text-[22px] leading-snug font-medium sm:text-[26px]">{q.prompt}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        {/* ─── КАК И СКОЛЬКО: путь из четырёх шагов и ведомость тарифов ─── */}
        <section className="border-t border-line bg-cream/60 py-20 sm:py-28">
          <div className="container-x">
            <h2 className="max-w-2xl font-serif text-[34px] leading-[1.05] font-medium tracking-tight text-balance sm:text-5xl">{sp.howTitle}</h2>
            <ol className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {sp.howSteps(coverTemplates.length, blank).map((step, i) => (
                <li key={step} className="relative border-t border-line-strong pt-6">
                  <span aria-hidden className="absolute -top-[5px] left-0 size-[9px] rounded-full bg-wine" />
                  <span className="font-serif text-[40px] leading-none text-wine italic tabular-nums">{i + 1}</span>
                  <p className="mt-3 leading-relaxed text-ink-soft">{step}</p>
                </li>
              ))}
            </ol>
            <div className="mt-20">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-12">
                <h2 className="max-w-xl font-serif text-[30px] leading-[1.1] font-medium tracking-tight text-balance sm:text-4xl">{t.pricing.title}</h2>
                <p className="max-w-sm leading-relaxed text-muted">{t.pricing.text}</p>
              </div>
              <PriceSheet className="mt-8" cta={cta} ctaLabel={ctaLabel(sp.create)} />
              <TrustList className="mt-10" />
            </div>
          </div>
        </section>

        <Reviews reviews={reviews.reviews} summary={reviews.summary} t={m.review.showcase} />

        <section className="border-t border-line py-20 sm:py-28">
          <div className="container-x grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] lg:gap-20">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <h2 className="font-serif text-[34px] leading-[1.05] font-medium tracking-tight sm:text-5xl">{sp.faqTitle}</h2>
              <Link href={cta} className="btn btn-primary btn-lg mt-8 max-lg:hidden">
                {ctaLabel(t.hero.cta)}
              </Link>
            </div>
            <Faq items={faqItems} size="md" />
          </div>
        </section>

        <section className="border-t border-line bg-cream/50 py-14 sm:py-16">
          <div className="container-x grid gap-12 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:gap-16">
            <nav aria-label={sp.more}>
              <h2 className="text-sm font-semibold">{sp.more}</h2>
              <ul className="mt-4 columns-1 gap-x-10 text-[15px] sm:columns-2">
                {ideas.map((x) => (
                  <li key={x.slug} className="break-inside-avoid border-b border-line">
                    <Link href={`/kniga/${x.slug}`} className="flex min-h-11 items-center text-ink-soft hover:text-wine">
                      {x.content[locale].label}
                    </Link>
                  </li>
                ))}
                <li className="break-inside-avoid border-b border-line">
                  <Link href="/kniga" className="flex min-h-11 items-center font-medium text-wine hover:underline">
                    {sp.allIdeas}
                  </Link>
                </li>
              </ul>
            </nav>
            {guides.length ? (
              <nav aria-label={m.landing.blog.moreArticles}>
                <h2 className="text-sm font-semibold">{m.landing.blog.moreArticles}</h2>
                <ul className="mt-4 divide-y divide-line border-y border-line">
                  {guides.map((x) => (
                    <li key={x.slug}>
                      <Link href={`/blog/${x.slug}`} className="flex min-h-14 items-center py-2 font-serif text-xl leading-snug font-medium text-ink-soft hover:text-wine">
                        {x.content[locale].title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
          </div>
        </section>
      </main>
      <Footer />
      <StickyStart href={cta} label={ctaLabel(t.hero.cta)} />
    </>
  );
}
