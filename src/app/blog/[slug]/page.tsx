import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Link } from "@/i18n/client";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Faq } from "@/components/Faq";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { Flourish, themePhoto } from "@/components/landing/FilmFrame";
import { PhotoPlate } from "@/components/landing/PageIntro";
import { coverPhotoUrl } from "@/lib/book/photo-cover";
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
    <section key={id} id={id} className="mt-14 scroll-mt-24 first:mt-0">
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

  const sb = m.secondary.blog;
  const photo = themePhoto[a.theme];
  const dateText = a.published.split("-").reverse().join(".");
  const tocList = (
    <ol className="text-[15px] text-ink-soft">
      {outline.map((o) => (
        <li key={o.id}>
          <a href={`#${o.id}`} className="block py-2 leading-snug hover:text-wine lg:py-1.5">
            {o.title}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <JsonLd data={jsonLd} />
      <LandingHeader loggedIn={!!user} />
      <main className="overflow-x-clip">
        <article className="pt-24 pb-16 sm:pt-32 sm:pb-24">
          {/* Титр: колонка узкая, слева; под ним — снимок темы на всю ширину, как «кадр» над текстом. */}
          <header className="container-x">
            <div className="max-w-[48rem]">
              <Breadcrumbs items={[{ name: m.landing.seoPage.home, href: "/" }, { name: t.eyebrow, href: "/blog" }, { name: c.title }]} className="max-sm:hidden" />
              <div className="text-sm text-muted">
                <time dateTime={a.published}>{dateText}</time>
                <span aria-hidden className="mx-2">/</span>
                {t.minutes(a.readMinutes)}
                {a.updated ? (
                  <>
                    <span aria-hidden className="mx-2">/</span>
                    <time dateTime={a.updated}>{sb.updated(a.updated.split("-").reverse().join("."))}</time>
                  </>
                ) : null}
              </div>
              <h1 className="mt-4 font-serif text-[38px] leading-[1.05] font-medium tracking-[-0.01em] text-balance sm:text-[56px]">{c.title}</h1>
              <Flourish className="mt-3 text-wine/45" />
              <p className="mt-6 text-xl leading-relaxed text-ink">{c.lead}</p>
            </div>
            <PhotoPlate photo={photo.key} position={photo.position} shade="full" priority className="mt-9 aspect-[16/10] sm:mt-12 sm:aspect-[21/9]" sizes="(min-width: 1152px) 1100px, 100vw" />
          </header>

          <div className="container-x mt-10 lg:mt-14 lg:grid lg:grid-cols-[13rem_minmax(0,42rem)] lg:gap-16">
            {/* Содержание: на ноутбуке — липкая колонка слева, на телефоне — раскрывающийся список перед текстом. */}
            <nav aria-label={t.toc} className="hidden lg:sticky lg:top-24 lg:block lg:self-start lg:border-l lg:border-line lg:pl-5">
              <div className="text-sm font-semibold">{t.toc}</div>
              <div className="mt-2">{tocList}</div>
            </nav>
            <details className="group mb-10 max-w-[42rem] rounded-[10px] border border-line bg-white lg:hidden">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                {t.toc}
                <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="border-t border-line px-4 pb-2">{tocList}</div>
            </details>

            <div className="max-w-[42rem]">
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

              {/* Предложение книги: «кадр» темы статьи с одним действием. */}
              <PhotoPlate photo={photo.key} position={photo.position} shade="side" className="mt-16 min-h-[360px] justify-center">
                <aside className="relative px-6 py-10 sm:px-10 sm:py-12">
                  <div className="text-sm font-medium text-white/75">{sb.ctaKicker}</div>
                  <h2 className="mt-2 font-serif text-[30px] leading-[1.1] font-medium text-balance sm:text-[38px]">{c.cta.title}</h2>
                  <p className="mt-3 max-w-lg text-white/80">{c.cta.text}</p>
                  <Link href={cta} className="btn btn-primary btn-lg mt-7 w-full sm:w-auto">
                    {guestClosed ? m.common.nav.login : m.landing.hero.cta}
                  </Link>
                </aside>
              </PhotoPlate>

              <section className="mt-16">
                <h2 className="font-serif text-[30px] leading-tight font-medium tracking-tight">{m.landing.seoPage.faqTitle}</h2>
                <Faq className="mt-6" items={c.faq} size="md" />
              </section>
            </div>
          </div>
        </article>

        <section className="border-t border-line bg-cream/50 py-12 sm:py-16">
          <div className="container-x grid gap-12 md:grid-cols-2 md:gap-16">
            <div>
              <h2 className="text-sm font-semibold">{t.moreArticles}</h2>
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {others.map((x) => (
                  <li key={x.slug}>
                    <Link href={`/blog/${x.slug}`} className="group flex min-h-16 items-center gap-4 py-3">
                      {/* eslint-disable-next-line @next/next/no-img-element -- готовые уменьшенные копии из /api/cover-photos */}
                      <img src={coverPhotoUrl(themePhoto[x.theme].key, 200)} alt="" loading="lazy" decoding="async" className="size-14 shrink-0 rounded-[8px] object-cover" style={{ objectPosition: themePhoto[x.theme].position }} />
                      <span className="leading-snug font-medium text-ink-soft group-hover:text-wine">{x.content[locale].title}</span>
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/blog" className="flex min-h-12 items-center py-3 text-sm font-medium text-wine hover:underline">
                    {sb.all}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h2 className="text-sm font-semibold">{t.related}</h2>
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {related.map((l) => (
                  <li key={l.slug}>
                    <Link href={`/kniga/${l.slug}`} className="flex min-h-12 items-center py-3 text-ink-soft hover:text-wine">
                      {l.content[locale].label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/kniga" className="flex min-h-12 items-center py-3 text-sm font-medium text-wine hover:underline">
                    {m.common.footer.allIdeas}
                  </Link>
                </li>
              </ul>
              {relatedTools.length ? (
                <>
                  <h2 className="mt-8 text-sm font-semibold">{toolsPageUi[locale].others}</h2>
                  <ul className="mt-3 divide-y divide-line border-y border-line">
                    {relatedTools.map((tool) => (
                      <li key={tool.slug}>
                        <Link href={`/instrumenty/${tool.slug}`} className="flex min-h-12 items-center py-3 text-wine hover:underline">
                          {tool.content[locale].label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
