import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/client";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Faq } from "@/components/Faq";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import { getCurrentUser } from "@/server/auth";
import { site } from "@/config/site";
import { getLocale, getMessages } from "@/i18n/server";
import { alternates } from "@/i18n/seo";
import { articles, getArticle } from "@/lib/content/articles";
import { applyGender } from "@/lib/content/gender";
import { getLanding } from "@/lib/content/landings";
import { countQuestions, getTheme } from "@/lib/content/themes";
import { absoluteUrl, articleLd, breadcrumbLd, faqLd, ogImage, socialMeta } from "@/lib/seo";

export function generateStaticParams() {
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = getArticle((await params).slug);
  if (!a) return {};
  const locale = await getLocale();
  const c = a.content[locale];
  const path = `/blog/${a.slug}`;
  return {
    title: { absolute: `${c.title} · ${site.name}` },
    description: c.description,
    alternates: alternates(path, locale),
    ...socialMeta({ path, locale, title: c.title, description: c.description, key: a.slug, type: "article", publishedTime: a.published, modifiedTime: a.updated }),
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const a = getArticle((await params).slug);
  if (!a) notFound();
  const [user, locale, m] = await Promise.all([getCurrentUser(), getLocale(), getMessages()]);
  const c = a.content[locale];
  const t = m.landing.blog;
  const path = `/blog/${a.slug}`;
  const cta = user ? `/books/new?theme=${a.theme}` : `/register?theme=${a.theme}`;

  // Вопросы из банка темы: по несколько из каждой главы, формулировки подстроены под род автора и адресата.
  const theme = getTheme(a.theme, locale);
  const bank = a.bank
    ? theme.chapters
        .filter((ch) => !a.bank!.skip.includes(ch.key))
        .map((ch) => ({
          key: ch.key,
          title: applyGender(ch.title, a.bank!.author, a.bank!.recipient),
          questions: ch.questions.slice(0, a.bank!.perChapter).map(([q]) => applyGender(q, a.bank!.author, a.bank!.recipient)),
        }))
    : [];

  const after = a.bank?.afterSection ?? c.sections.length;
  const before = c.sections.slice(0, after);
  const rest = c.sections.slice(after);
  const outline = [...before.map((s, i) => ({ id: `s${i + 1}`, title: s.heading })), ...(bank.length && c.questions ? [{ id: "questions", title: c.questions.heading }] : []), ...rest.map((s, i) => ({ id: `s${after + i + 1}`, title: s.heading }))];

  const related = a.landings.map((slug) => getLanding(slug)).filter((l) => !!l);
  const others = articles.filter((x) => x.slug !== a.slug).slice(0, 3);

  const jsonLd = [
    articleLd({ title: c.title, description: c.description, url: absoluteUrl(path, locale), image: ogImage(locale, a.slug), locale, published: a.published, modified: a.updated }),
    faqLd(c.faq),
    breadcrumbLd(
      [
        { name: site.name, path: "/" },
        { name: t.eyebrow, path: "/blog" },
        { name: c.title, path },
      ],
      locale,
    ),
  ];

  const renderSection = (s: (typeof c.sections)[number], id: string) => (
    <section key={id} id={id} className="mt-12 scroll-mt-24">
      <h2 className="font-serif text-3xl font-medium tracking-tight">{s.heading}</h2>
      {s.paragraphs?.map((p) => (
        <p key={p} className="mt-4 text-lg leading-relaxed text-ink-soft">
          {p}
        </p>
      ))}
      {s.list ? (
        <ul className="mt-4 list-disc space-y-2 pl-6 text-lg leading-relaxed text-ink-soft marker:text-wine">
          {s.list.map((li) => (
            <li key={li}>{li}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );

  return (
    <>
      <JsonLd data={jsonLd} />
      <LandingHeader loggedIn={!!user} />
      <main className="overflow-x-clip">
        <article className="relative pt-28 pb-16 sm:pt-36 sm:pb-20">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_40%_at_75%_10%,#f4e4df_0%,transparent_70%)]" />
          <div className="container-x">
            <div className="mx-auto max-w-3xl">
              <Breadcrumbs items={[{ name: m.landing.seoPage.home, href: "/" }, { name: t.eyebrow, href: "/blog" }, { name: c.title }]} />
              <div className="text-sm text-muted">
                <time dateTime={a.published}>{a.published.split("-").reverse().join(".")}</time> · {t.minutes(a.readMinutes)}
              </div>
              <h1 className="mt-4 font-serif text-4xl leading-[1.1] font-medium tracking-tight sm:text-5xl">{c.title}</h1>
              <p className="mt-6 text-xl leading-relaxed text-ink-soft">{c.lead}</p>

              <nav aria-label={t.toc} className="mt-8 rounded-2xl border border-line bg-white/70 p-5">
                <div className="text-sm font-semibold">{t.toc}</div>
                <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink-soft marker:text-muted">
                  {outline.map((o) => (
                    <li key={o.id}>
                      <a href={`#${o.id}`} className="hover:text-wine">
                        {o.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>

              {before.map((s, i) => renderSection(s, `s${i + 1}`))}

              {bank.length && c.questions ? (
                <section id="questions" className="mt-12 scroll-mt-24">
                  <h2 className="font-serif text-3xl font-medium tracking-tight">{c.questions.heading}</h2>
                  <p className="mt-4 text-lg leading-relaxed text-ink-soft">{c.questions.intro}</p>
                  <div className="mt-6 space-y-8">
                    {bank.map((ch) => (
                      <div key={ch.key}>
                        <h3 className="font-serif text-xl font-medium text-wine">{ch.title}</h3>
                        <ul className="mt-3 space-y-2.5 border-l-2 border-line pl-5 text-lg leading-snug text-ink-soft">
                          {ch.questions.map((q) => (
                            <li key={q}>{q}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <p className="mt-6 text-sm text-muted">{t.questionsCount(countQuestions(theme))}</p>
                </section>
              ) : null}

              {rest.map((s, i) => renderSection(s, `s${after + i + 1}`))}

              <div className="mt-14 rounded-3xl bg-ink px-7 py-9 text-center text-white sm:px-10">
                <h2 className="font-serif text-3xl font-medium">{c.cta.title}</h2>
                <p className="mx-auto mt-3 max-w-lg text-white/80">{c.cta.text}</p>
                <Link href={cta} className="btn btn-primary btn-lg mt-6">
                  {m.landing.hero.cta} <ArrowRight className="size-5" />
                </Link>
              </div>

              <section className="mt-14">
                <h2 className="font-serif text-3xl font-medium tracking-tight">{m.landing.seoPage.faqTitle}</h2>
                <Faq className="mt-6" items={c.faq} size="md" />
              </section>
            </div>
          </div>
        </article>

        <section className="border-t border-line bg-cream/50 py-14">
          <div className="container-x grid gap-10 md:grid-cols-2">
            <div>
              <div className="text-sm font-semibold">{t.related}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                {related.map((l) => (
                  <Link key={l.slug} href={`/kniga/${l.slug}`} className="rounded-full border border-line bg-white px-4 py-1.5 text-sm text-ink-soft hover:border-ink/30">
                    {l.content[locale].label}
                  </Link>
                ))}
                <Link href="/kniga" className="rounded-full border border-line bg-white px-4 py-1.5 text-sm text-wine hover:border-ink/30">
                  {m.common.footer.allIdeas} →
                </Link>
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold">{t.moreArticles}</div>
              <ul className="mt-4 space-y-2 text-sm">
                {others.map((x) => (
                  <li key={x.slug}>
                    <Link href={`/blog/${x.slug}`} className="text-ink-soft hover:text-wine">
                      {x.content[locale].title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
