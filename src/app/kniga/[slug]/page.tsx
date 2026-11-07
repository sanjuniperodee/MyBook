import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { notFound } from "next/navigation";
import { CalendarHeart, Gift, PenLine } from "lucide-react";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Book3D } from "@/components/cover/Book3D";
import { coverTemplates } from "@/lib/book/covers";
import { getCurrentUser } from "@/server/auth";
import { siteReviews } from "@/server/reviews";
import { Reviews } from "@/components/landing/Reviews";
import { FilmFrame, Flourish, frameGhostBtn, themePhoto } from "@/components/landing/FilmFrame";
import { SectionHead } from "@/components/landing/SectionHead";
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
  const plans = [...getVisiblePlans()].sort((a, b) => Number(!!b.featured) - Number(!!a.featured));

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
            <p className="mt-6 inline-flex max-w-full items-start gap-2.5 rounded-[10px] bg-[rgb(255_255_255/0.12)] px-4 py-2.5 text-sm text-white backdrop-blur-md">
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
            <Link href={cta} className="btn btn-primary btn-lg">
              {ctaLabel(t.hero.cta)}
            </Link>
            <Link href="/gift" className={frameGhostBtn}>
              <Gift className="size-5" aria-hidden /> {t.gift.cta}
            </Link>
          </div>
          <p className="mt-5 text-sm text-white/75">{sp.priceNote(formatPrice(minPrice))}</p>
        </FilmFrame>

        {/* ─── ПОЧЕМУ: три довода строкой ─── */}
        <section className="border-b border-line py-16 sm:py-20">
          <div className="container-x grid gap-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-line">
            {c.why.map((w, i) => (
              <div key={w.title} className={i === 0 ? "md:pr-10" : i === c.why.length - 1 ? "md:pl-10" : "md:px-10"}>
                <h2 className="font-serif text-2xl leading-snug font-medium">{w.title}</h2>
                <p className="mt-3 leading-relaxed text-ink-soft">{w.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── О ЧЁМ: вопросы из книги (своя книга — как устроен редактор) ─── */}
        <section className="py-20 sm:py-28">
          <div className="container-x">
            {blank ? (
              <>
                <SectionHead title={sp.editor.title} note={sp.editor.note} />
                <ul className="mt-12 grid border-t border-line sm:grid-cols-2">
                  {sp.editor.items.map((it) => (
                    <li key={it.title} className="border-b border-line py-6 sm:odd:pr-10 sm:even:border-l sm:even:pl-10">
                      <div className="flex items-center gap-2 text-sm font-medium text-wine">
                        <PenLine className="size-4" aria-hidden /> {it.title}
                      </div>
                      <p className="mt-2 text-[17px] leading-relaxed text-ink-soft">{it.text}</p>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <SectionHead title={sp.aboutTitle(countQuestions(theme))} note={sp.aboutNote} />
                <ul className="mt-12 grid border-t border-line sm:grid-cols-2">
                  {samples.map((q) => (
                    <li key={q.prompt} className="border-b border-line py-6 sm:odd:pr-10 sm:even:border-l sm:even:pl-10">
                      <div className="text-sm text-muted">{q.chapter}</div>
                      <p className="mt-2 font-serif text-[22px] leading-snug text-ink">{q.prompt}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>

        {/* ─── КАК И СКОЛЬКО ─── */}
        <section className="border-t border-line bg-cream/60 py-20 sm:py-28">
          <div className="container-x grid gap-14 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
            <div>
              <h2 className="font-serif text-4xl leading-[1.05] font-medium tracking-tight sm:text-5xl">{sp.howTitle}</h2>
              <ol className="mt-10 space-y-6">
                {sp.howSteps(coverTemplates.length, blank).map((step, i) => (
                  <li key={step} className="grid grid-cols-[2.5rem_1fr] gap-3 border-t border-line pt-5">
                    <span className="font-serif text-3xl leading-none text-wine tabular-nums">{i + 1}</span>
                    <span className="leading-relaxed text-ink-soft">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="self-start lg:sticky lg:top-24">
              <div className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-white">
                {plans.map((p) => (
                  <div key={p.id} className="relative flex items-center justify-between gap-4 px-6 py-5">
                    {p.featured ? <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-wine" /> : null}
                    <div className="min-w-0">
                      <div className="font-semibold">{m.common.plans[p.id].name}</div>
                      <div className="mt-0.5 text-sm text-muted">{m.common.plans[p.id].features[0]}</div>
                    </div>
                    <div className="shrink-0 font-serif text-3xl tabular-nums">{formatPrice(p.price)}</div>
                  </div>
                ))}
              </div>
              <Link href={cta} className="btn btn-primary btn-lg mt-5 w-full">
                {ctaLabel(sp.create)}
              </Link>
              <TrustList compact className="mt-6" />
            </div>
          </div>
        </section>

        <Reviews reviews={reviews.reviews} summary={reviews.summary} t={m.review.showcase} />

        <section className="border-t border-line py-20 sm:py-28">
          <div className="container-x grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
            <div>
              <h2 className="font-serif text-4xl leading-[1.05] font-medium tracking-tight sm:text-5xl">{sp.faqTitle}</h2>
              <Link href={cta} className="btn btn-primary btn-lg mt-8 max-lg:hidden">
                {ctaLabel(t.hero.cta)}
              </Link>
            </div>
            <Faq items={faqItems} size="md" />
          </div>
        </section>

        <section className="border-t border-line bg-cream/50 py-14 sm:py-16">
          <div className="container-x grid gap-12 md:grid-cols-[1.4fr_1fr]">
            <nav aria-label={sp.more}>
              <h2 className="text-sm font-semibold">{sp.more}</h2>
              <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {ideas.map((x) => (
                  <li key={x.slug}>
                    <Link href={`/kniga/${x.slug}`} className="text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-wine hover:decoration-wine">
                      {x.content[locale].label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/kniga" className="font-medium text-wine hover:underline">
                    {sp.allIdeas}
                  </Link>
                </li>
              </ul>
            </nav>
            {guides.length ? (
              <nav aria-label={m.landing.blog.moreArticles}>
                <h2 className="text-sm font-semibold">{m.landing.blog.moreArticles}</h2>
                <ul className="mt-4 space-y-2.5 text-sm">
                  {guides.map((x) => (
                    <li key={x.slug}>
                      <Link href={`/blog/${x.slug}`} className="text-ink-soft hover:text-wine">
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
    </>
  );
}
