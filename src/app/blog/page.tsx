import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { PageIntro } from "@/components/landing/PageIntro";
import { JsonLd } from "@/components/seo/JsonLd";
import { getCurrentUser } from "@/server/auth";
import { site } from "@/config/site";
import { getLocale, getMessages } from "@/i18n/server";
import { alternates } from "@/i18n/seo";
import { articles } from "@/lib/content/articles";
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

export default async function BlogPage() {
  const [user, locale, m] = await Promise.all([getCurrentUser(), getLocale(), getMessages()]);
  const t = m.landing.blog;
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

  const date = (a: (typeof articles)[number]) => (a.updated ?? a.published).split("-").reverse().join(".");

  return (
    <>
      <JsonLd data={jsonLd} />
      <LandingHeader loggedIn={!!user} />
      <main className="overflow-x-clip pb-20 sm:pb-28">
        <PageIntro crumbs={[{ name: m.landing.seoPage.home, href: "/" }, { name: t.eyebrow }]} title={t.title} lead={t.lead} />
        <div className="container-x">
          {/* Оглавление журнала: дата и время чтения слева, заголовок засечками и анонс справа. */}
          <ol className="border-t border-ink/80">
            {articles.map((a) => {
              const c = a.content[locale];
              return (
                <li key={a.slug} className="border-b border-line">
                  <Link href={`/blog/${a.slug}`} className="group grid gap-2 py-8 sm:grid-cols-[11rem_1fr] sm:gap-10 sm:py-10">
                    <div className="text-sm text-muted">
                      <time dateTime={a.updated ?? a.published}>{date(a)}</time>
                      <span className="block">{t.minutes(a.readMinutes)}</span>
                    </div>
                    <div className="max-w-3xl">
                      <h2 className="font-serif text-[28px] leading-[1.15] font-medium text-balance group-hover:text-wine sm:text-[34px]">{c.title}</h2>
                      <p className="mt-3 leading-relaxed text-muted">{c.description}</p>
                      <span className="mt-4 inline-block text-sm font-medium text-wine underline decoration-wine/30 underline-offset-4 group-hover:decoration-wine">{t.read}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      </main>
      <Footer />
    </>
  );
}
