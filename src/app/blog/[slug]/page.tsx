import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/client";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Faq } from "@/components/Faq";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { Flourish } from "@/components/landing/FilmFrame";
import { JsonLd } from "@/components/seo/JsonLd";
import { getCurrentUser } from "@/server/auth";
import { registrationOpen, site } from "@/config/site";
import { getLocale, getMessages } from "@/i18n/server";
import { alternates } from "@/i18n/seo";
import { articles, getArticle } from "@/lib/content/articles";
import { applyGender } from "@/lib/content/gender";
import { getLanding } from "@/lib/content/landings";
import { getTool } from "@/lib/content/tools";
import { toolsPageUi } from "@/lib/content/tools/ui";
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
  const guestClosed = !user && !registrationOpen();
  const cta = user ? `/books/new?theme=${a.theme}` : guestClosed ? "/login" : `/register?theme=${a.theme}`;

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
  const relatedTools = (a.tools ?? []).map((slug) => getTool(slug)).filter((t) => !!t);

  const jsonLd = [
    articleLd({ title: c.title, description: c.description, url: absoluteUrl(path, locale), image: ogImage(locale, a.slug), locale, published: a.published, modified: a.updated }),
    faqLd(c.faq),
    breadcrumbLd(
      [
        { name: m.landing.seoPage.home, path: "/" },
        { name: t.eyebrow, path: "/blog" },
        { name: c.title, path },
      ],
      locale,
    ),
  ];

  const renderSection = (s: (typeof c.sections)[number], id: string) => (
    <section key={id} id={id} className="mt-14 scroll-mt-24">
      <h2 className="font-serif text-[30px] leading-tight font-medium tracking-tight text-balance sm:text-[34px]">{s.heading}</h2>
      {s.paragraphs?.map((p) => (
        <p key={p} className="mt-5 text-[18px] leading-[1.75] text-ink-soft">
          {p}
        </p>
      ))}
      {s.list ? (
        <ul className="mt-5 list-disc space-y-2.5 pl-6 text-[18px] leading-[1.7] text-ink-soft marker:text-wine">
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
        <article className="pt-28 pb-16 sm:pt-36 sm:pb-24">
          <div className="container-x">
            <div className="mx-auto max-w-[44rem] lg:mx-0 lg:ml-[17rem]">
              <Breadcrumbs items={[{ name: m.landing.seoPage.home, href: "/" }, { name: t.eyebrow, href: "/blog" }, { name: c.title }]} className="max-sm:hidden" />
              <div className="text-sm text-muted">
                <time dateTime={a.published}>{a.published.split("-").reverse().join(".")}</time>
                <span aria-hidden className="mx-2">/</span>
                {t.minutes(a.readMinutes)}
              </div>
              <h1 className="mt-4 font-serif text-[40px] leading-[1.06] font-medium tracking-[-0.01em] text-balance sm:text-[56px]">{c.title}</h1>
              <Flourish className="mt-3 text-wine/45" />
              <p className="mt-6 text-xl leading-relaxed text-ink">{c.lead}</p>
            </div>

            <div className="mt-12 lg:grid lg:grid-cols-[14rem_minmax(0,44rem)] lg:gap-12">
              {/* Содержание: на ноутбуке — липкая колонка слева, на телефоне — список перед текстом. */}
              <nav aria-label={t.toc} className="mx-auto max-w-[44rem] border-y border-line py-5 lg:sticky lg:top-24 lg:mx-0 lg:self-start lg:border-y-0 lg:border-l lg:py-0 lg:pl-5">
                <div className="text-sm font-semibold">{t.toc}</div>
                <ol className="mt-2 text-sm text-ink-soft lg:mt-3 lg:space-y-2">
                  {outline.map((o) => (
                    <li key={o.id}>
                      <a href={`#${o.id}`} className="block py-2 leading-snug hover:text-wine lg:py-0">
                        {o.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>

              <div className="mx-auto max-w-[44rem] lg:mx-0">
                {before.map((s, i) => renderSection(s, `s${i + 1}`))}

                {bank.length && c.questions ? (
                  <section id="questions" className="mt-14 scroll-mt-24">
                    <h2 className="font-serif text-[30px] leading-tight font-medium tracking-tight text-balance sm:text-[34px]">{c.questions.heading}</h2>
                    <p className="mt-5 text-[18px] leading-[1.75] text-ink-soft">{c.questions.intro}</p>
                    <div className="mt-8 space-y-10">
                      {bank.map((ch) => (
                        <div key={ch.key}>
                          <h3 className="text-sm font-semibold text-wine">{ch.title}</h3>
                          <ul className="mt-3 divide-y divide-line border-y border-line">
                            {ch.questions.map((q) => (
                              <li key={q} className="py-3 font-serif text-[21px] leading-snug text-ink">
                                {q}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                    <p className="mt-6 text-sm text-muted">{t.questionsCount(countQuestions(theme))}</p>
                  </section>
                ) : null}

                {rest.map((s, i) => renderSection(s, `s${after + i + 1}`))}

                {/* Призыв — маленький «кадр»: тёмная основа, тонкая рамка. */}
                <aside className="relative mt-16 overflow-hidden rounded-[14px] bg-spine px-7 py-10 text-white sm:px-10">
                  <div aria-hidden className="pointer-events-none absolute inset-2.5 rounded-[8px] border border-[rgb(255_255_255/0.22)]" />
                  <h2 className="relative font-serif text-[32px] leading-tight font-medium text-balance">{c.cta.title}</h2>
                  <p className="relative mt-3 max-w-lg text-white/80">{c.cta.text}</p>
                  <Link href={cta} className="btn btn-primary btn-lg relative mt-7">
                    {guestClosed ? m.common.nav.login : m.landing.hero.cta}
                  </Link>
                </aside>

                <section className="mt-16">
                  <h2 className="font-serif text-[30px] leading-tight font-medium tracking-tight">{m.landing.seoPage.faqTitle}</h2>
                  <Faq className="mt-6" items={c.faq} size="md" />
                </section>
              </div>
            </div>
          </div>
        </article>

        <section className="border-t border-line bg-cream/50 py-14 sm:py-16">
          <div className="container-x grid gap-12 md:grid-cols-2">
            <div>
              <h2 className="text-sm font-semibold">{t.related}</h2>
              <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {related.map((l) => (
                  <li key={l.slug}>
                    <Link href={`/kniga/${l.slug}`} className="text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-wine hover:decoration-wine">
                      {l.content[locale].label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/kniga" className="font-medium text-wine hover:underline">
                    {m.common.footer.allIdeas}
                  </Link>
                </li>
              </ul>
              {relatedTools.length ? (
                <>
                  <h2 className="mt-8 text-sm font-semibold">{toolsPageUi[locale].others}</h2>
                  <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                    {relatedTools.map((tool) => (
                      <li key={tool.slug}>
                        <Link href={`/instrumenty/${tool.slug}`} className="text-wine underline decoration-wine/30 underline-offset-4 hover:decoration-wine">
                          {tool.content[locale].label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
            <div>
              <h2 className="text-sm font-semibold">{t.moreArticles}</h2>
              <ul className="mt-4 space-y-2.5 text-sm">
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
