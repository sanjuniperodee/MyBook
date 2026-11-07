import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { themePhoto } from "@/components/landing/FilmFrame";
import { PhotoPlate } from "@/components/landing/PageIntro";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { Flourish } from "@/components/landing/FilmFrame";
import { JsonLd } from "@/components/seo/JsonLd";
import { getCurrentUser } from "@/server/auth";
import { site } from "@/config/site";
import { getLocale, getMessages } from "@/i18n/server";
import { alternates } from "@/i18n/seo";
import type { Locale } from "@/i18n/config";
import { articles, type Article } from "@/lib/content/articles";
import { coverPhotoUrl } from "@/lib/book/photo-cover";
import { absoluteUrl, breadcrumbLd, socialMeta } from "@/lib/seo";
import { rssPath } from "./rss.xml/feed";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const { title, description } = m.landing.blog.meta;
  return {
    title: { absolute: `${title} · ${site.name}` },
    description,
    alternates: { ...alternates("/blog", locale), types: { "application/rss+xml": rssPath(locale) } },
    ...socialMeta({ path: "/blog", locale, title, description }),
  };
}

const date = (a: Article) => (a.updated ?? a.published).split("-").reverse().join(".");

/**
 * Журнал: главный материал крупно (кадр и титр), два следующих — колонками с засечками, остальные — оглавлением
 * с датой слева и маленьким снимком справа. Порядок статей — как в каталоге `articles`: свежее и важное первым.
 */
export default async function BlogPage() {
  const [user, locale, m] = await Promise.all([getCurrentUser(), getLocale(), getMessages()]);
  const t = m.landing.blog;
  const s = m.secondary.blog;
  const jsonLd = [
    breadcrumbLd(
      [
        { name: m.landing.seoPage.home, path: "/" },
        { name: t.eyebrow, path: "/blog" },
      ],
      locale,
    ),
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: articles.map((a, i) => ({ "@type": "ListItem", position: i + 1, name: a.content[locale].title, url: absoluteUrl(`/blog/${a.slug}`, locale) })),
    },
  ];

  const [lead, ...rest] = articles;
  const second = rest.slice(0, 2);
  const list = rest.slice(2);
  const leadPhoto = themePhoto[lead.theme];

  return (
    <>
      <JsonLd data={jsonLd} />
      <LandingHeader loggedIn={!!user} />
      <main className="overflow-x-clip pb-20 sm:pb-28">
        {/* Шапка журнала: титр слева крупно, справа — о чём он и сколько в нём статей. */}
        <header className="pt-24 pb-8 sm:pt-32 sm:pb-12">
          <div className="container-x">
            <Breadcrumbs items={[{ name: m.landing.seoPage.home, href: "/" }, { name: t.eyebrow }]} className="max-sm:hidden" />
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end lg:gap-14">
              <div>
                <h1 className="font-serif text-[48px] leading-[1] font-medium tracking-[-0.015em] text-balance sm:text-7xl">{t.title}</h1>
                <Flourish className="mt-3 text-wine/45" />
              </div>
              <div className="mt-5 lg:mt-0 lg:pb-1">
                <p className="leading-relaxed text-ink-soft">{t.lead}</p>
                <p className="mt-3 text-sm text-muted">{s.count(articles.length)}</p>
              </div>
            </div>
          </div>
        </header>

        <div className="container-x">
          {/* Главный материал: кадр слева, титр и анонс справа; вся плашка — одна ссылка. */}
          <article className="group relative grid border-y border-ink/80 py-6 sm:py-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-center lg:gap-12">
            <PhotoPlate photo={leadPhoto.key} position={leadPhoto.position} shade="bottom" priority className="aspect-[4/3] sm:aspect-[16/10] lg:aspect-[5/4]" sizes="(min-width: 1024px) 55vw, 100vw" />
            <div className="mt-6 lg:mt-0">
              <div className="text-sm font-medium text-wine">{s.featured}</div>
              <div className="mt-2 text-sm text-muted">
                <time dateTime={lead.updated ?? lead.published}>{date(lead)}</time>
                <span aria-hidden className="mx-2">/</span>
                {t.minutes(lead.readMinutes)}
              </div>
              <h2 className="mt-3 font-serif text-[32px] leading-[1.08] font-medium text-balance sm:text-[44px]">
                <Link href={`/blog/${lead.slug}`} className="after:absolute after:inset-0 group-hover:text-wine">
                  {c(lead, locale).title}
                </Link>
              </h2>
              <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-ink-soft">{c(lead, locale).description}</p>
              <span className="mt-5 inline-flex min-h-11 items-center text-sm font-medium text-wine underline decoration-wine/30 underline-offset-4 group-hover:decoration-wine">{t.read}</span>
            </div>
          </article>

          {/* Следующие два — без снимков: заголовок засечками крупнее, между ними вертикальная линия. */}
          {second.length ? (
            <div className="grid divide-y divide-line border-b border-line md:grid-cols-2 md:divide-x md:divide-y-0">
              {second.map((a, i) => (
                <article key={a.slug} className={`group relative py-8 sm:py-10 ${i === 0 ? "md:pr-10" : "md:pl-10"}`}>
                  <div className="text-sm text-muted">
                    <time dateTime={a.updated ?? a.published}>{date(a)}</time>
                    <span aria-hidden className="mx-2">/</span>
                    {t.minutes(a.readMinutes)}
                  </div>
                  <h2 className="mt-3 font-serif text-[28px] leading-[1.12] font-medium text-balance sm:text-[34px]">
                    <Link href={`/blog/${a.slug}`} className="after:absolute after:inset-0 group-hover:text-wine">
                      {c(a, locale).title}
                    </Link>
                  </h2>
                  <p className="mt-3 max-w-lg leading-relaxed text-muted">{c(a, locale).description}</p>
                </article>
              ))}
            </div>
          ) : null}

          {list.length ? (
            <section aria-labelledby="blog-more" className="mt-14 sm:mt-20">
              <h2 id="blog-more" className="font-serif text-[32px] leading-tight font-medium sm:text-4xl">
                {s.more}
              </h2>
              <ol className="mt-5 border-t border-ink/80">
                {list.map((a) => {
                  const ph = themePhoto[a.theme];
                  return (
                    <li key={a.slug} className="border-b border-line">
                      <Link href={`/blog/${a.slug}`} className="group grid grid-cols-[minmax(0,1fr)_4.5rem] gap-x-4 gap-y-1 py-5 sm:grid-cols-[9rem_minmax(0,1fr)_6.5rem] sm:gap-x-8 sm:py-6">
                        <div className="col-span-2 text-sm text-muted sm:col-span-1 sm:pt-1">
                          <time dateTime={a.updated ?? a.published}>{date(a)}</time>
                          <span className="ml-3 sm:ml-0 sm:block">{t.minutes(a.readMinutes)}</span>
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-serif text-[24px] leading-[1.15] font-medium text-balance group-hover:text-wine sm:text-[28px]">{c(a, locale).title}</h3>
                          <p className="mt-2 line-clamp-2 max-w-2xl text-[15px] leading-relaxed text-muted">{c(a, locale).description}</p>
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element -- готовые уменьшенные копии из /api/cover-photos */}
                        <img src={coverPhotoUrl(ph.key, 300)} alt="" loading="lazy" decoding="async" className="size-[4.5rem] rounded-[8px] object-cover sm:size-[6.5rem]" style={{ objectPosition: ph.position }} />
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}
        </div>
      </main>
      <Footer />
    </>
  );
}

function c(a: Article, locale: Locale) {
  return a.content[locale];
}
