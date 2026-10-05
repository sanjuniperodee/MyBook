import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarHeart, Check, Gift, MessageCircleQuestion } from "lucide-react";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Book3D } from "@/components/cover/Book3D";
import { coverTemplates } from "@/lib/book/covers";
import { getCurrentUser } from "@/server/auth";
import { siteReviews } from "@/server/reviews";
import { Reviews } from "@/components/landing/Reviews";
import { Faq } from "@/components/Faq";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { articles } from "@/lib/content/articles";
import { getLanding, landings } from "@/lib/content/landings";
import { chapterTitle, countQuestions, getTheme } from "@/lib/content/themes";
import { applyGender } from "@/lib/content/gender";
import { deadlineFor, getOccasion, nextFixedDate } from "@/lib/occasions";
import { formatPrice, plans, site } from "@/config/site";
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
  const g = (s: string) => applyGender(s, l.authorGender, l.recipientGender);
  // По одному вопросу из разных глав — показываем, о чём будет книга.
  const samples = theme.chapters
    .filter((_, i) => i % Math.max(1, Math.floor(theme.chapters.length / 6)) === 0)
    .slice(0, 6)
    .map((ch) => ({ chapter: g(chapterTitle(theme, ch.key, locale)), prompt: g(ch.questions[0][0]) }));
  const occasion = getOccasion(l.occasion);
  const fixed = occasion ? nextFixedDate(occasion, new Date()) : null;
  const dl = fixed ? deadlineFor(fixed, new Date()) : null;
  const cta = user ? `/books/new?theme=${l.theme}` : `/register?theme=${l.theme}`;
  const minPrice = Math.min(...plans.map((p) => p.price));

  const path = `/kniga/${l.slug}`;
  const faqItems: [string, string][] = [...c.faq, [sp.priceQ, sp.priceA(formatPrice(minPrice), formatPrice(plans[1].price))]];
  // Ссылки на другие идеи: сначала той же темы, остальные — после; статьи блога по теме.
  const ideas = [...landings.filter((x) => x.slug !== l.slug && x.theme === l.theme), ...landings.filter((x) => x.theme !== l.theme)].slice(0, 9);
  const guides = articles.filter((x) => x.theme === l.theme || x.landings.includes(l.slug)).slice(0, 3);
  const planNames = Object.fromEntries(plans.map((p) => [p.id, m.common.plans[p.id].name]));
  const jsonLd = [
    productLd({ name: sp.productName(site.name, c.label), description: c.metaDescription, url: absoluteUrl(path, locale), image: ogImage(locale, l.slug), locale, planNames, reviews }),
    faqLd(faqItems),
    breadcrumbLd(
      [
        { name: site.name, path: "/" },
        { name: c.label, path },
      ],
      locale,
    ),
  ];

  return (
    <>
      <LandingHeader loggedIn={!!user} />
      <JsonLd data={jsonLd} />
      <main className="overflow-x-clip">
        <section className="relative pt-28 pb-16 sm:pt-36 sm:pb-24">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_75%_30%,#f4e4df_0%,transparent_70%)]" />
          <div className="container-x grid items-center gap-14 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <Breadcrumbs items={[{ name: sp.home, href: "/" }, { name: sp.allIdeas, href: "/kniga" }, { name: c.label }]} />
              <div className="eyebrow">{c.label}</div>
              <h1 className="mt-4 font-serif text-[42px] leading-[1.03] font-medium tracking-tight sm:text-6xl">
                {c.h1} <em className="text-wine">{c.accent}</em>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">{c.lead}</p>
              {dl && occasion && dl.state !== "past" ? (
                <div className="mt-6 inline-flex items-center gap-2.5 rounded-2xl border border-line bg-white/80 px-4 py-3 text-sm">
                  <CalendarHeart className="size-5 shrink-0 text-wine" />
                  <span>
                    {dl.state === "digital"
                      ? m.common.occasion.digitalOnly
                      : dl.state === "premium"
                        ? m.common.occasion.premiumOnly(dl.orderByPremium)
                        : m.common.occasion.orderBy(m.common.occasions[occasion.id], dl.daysToTarget, dl.orderBy)}
                  </span>
                </div>
              ) : null}
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href={cta} className="btn btn-primary btn-lg">
                  {t.hero.cta} <ArrowRight className="size-5" />
                </Link>
                <Link href="/gift" className="btn btn-outline btn-lg">
                  <Gift className="size-5" /> {t.gift.cta}
                </Link>
              </div>
              <p className="mt-4 text-sm text-muted">{sp.priceNote(formatPrice(minPrice))}</p>
            </div>
            <div className="mx-auto w-full max-w-[320px]">
              <Book3D priority template={l.coverTemplate} title={c.cover.title} subtitle={c.cover.subtitle} names={c.cover.names} rotate={-18} className="animate-float" />
            </div>
          </div>
        </section>

        <section className="border-y border-line/70 bg-white/60 py-16 sm:py-20">
          <div className="container-x grid gap-5 md:grid-cols-3">
            {c.why.map((w) => (
              <div key={w.title}>
                <div className="flex items-center gap-2 font-semibold">
                  <Check className="size-5 text-wine" /> {w.title}
                </div>
                <p className="mt-2 leading-relaxed text-ink-soft">{w.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-20 sm:py-24">
          <div className="container-x">
            <div className="max-w-2xl">
              <div className="eyebrow">{sp.aboutEyebrow}</div>
              <h2 className="mt-3 font-serif text-4xl font-medium tracking-tight sm:text-5xl">{sp.aboutTitle(countQuestions(theme))}</h2>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {samples.map((q) => (
                <div key={q.prompt} className="card p-6">
                  <div className="flex items-center gap-2 text-xs font-medium text-wine">
                    <MessageCircleQuestion className="size-4" /> {q.chapter}
                  </div>
                  <p className="mt-3 font-serif text-xl leading-snug">{q.prompt}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm text-muted">{sp.aboutNote}</p>
          </div>
        </section>

        <section className="bg-cream/60 py-20 sm:py-24">
          <div className="container-x grid gap-12 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <div className="eyebrow">{t.how.eyebrow}</div>
              <h2 className="mt-3 font-serif text-4xl font-medium tracking-tight">{sp.howTitle}</h2>
              <ol className="mt-8 space-y-5">
                {sp.howSteps(coverTemplates.filter((x) => !x.requiresPhoto).length).map((step, i) => (
                  <li key={step} className="flex gap-4">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-wine font-serif text-white">{i + 1}</span>
                    <span className="pt-1 leading-relaxed text-ink-soft">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="grid gap-3 self-start">
              {plans.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-white px-5 py-4">
                  <div>
                    <div className="font-medium">{m.common.plans[p.id].name}</div>
                    <div className="text-sm text-muted">{m.common.plans[p.id].features[0]}</div>
                  </div>
                  <div className="shrink-0 font-serif text-2xl">{formatPrice(p.price)}</div>
                </div>
              ))}
              <Link href={cta} className="btn btn-primary btn-lg mt-2">
                {sp.create} <ArrowRight className="size-5" />
              </Link>
            </div>
          </div>
        </section>

        <Reviews reviews={reviews.reviews} summary={reviews.summary} t={m.review.showcase} />

        <section className="py-20 sm:py-24">
          <div className="container-x grid gap-10 lg:grid-cols-[1fr_1.4fr]">
            <h2 className="font-serif text-4xl font-medium">{sp.faqTitle}</h2>
            <Faq items={faqItems} size="md" />
          </div>
        </section>

        <section className="border-t border-line py-14">
          <div className="container-x grid gap-10 md:grid-cols-2">
            <div>
              <div className="text-sm font-semibold">{sp.more}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                {ideas.map((x) => (
                  <Link key={x.slug} href={`/kniga/${x.slug}`} className="rounded-full border border-line bg-white px-4 py-1.5 text-sm text-ink-soft hover:border-ink/30">
                    {x.content[locale].label}
                  </Link>
                ))}
                <Link href="/kniga" className="rounded-full border border-line bg-white px-4 py-1.5 text-sm text-wine hover:border-ink/30">
                  {sp.allIdeas} →
                </Link>
              </div>
            </div>
            {guides.length ? (
              <div>
                <div className="text-sm font-semibold">{m.landing.blog.moreArticles}</div>
                <ul className="mt-4 space-y-2 text-sm">
                  {guides.map((x) => (
                    <li key={x.slug}>
                      <Link href={`/blog/${x.slug}`} className="text-ink-soft hover:text-wine">
                        {x.content[locale].title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
