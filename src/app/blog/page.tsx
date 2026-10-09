import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import { getCurrentUser } from "@/server/auth";
import { site } from "@/config/site";
import { getLocale, getMessages } from "@/i18n/server";
import { alternates } from "@/i18n/seo";
import { articles } from "@/lib/content/articles";
import { absoluteUrl, breadcrumbLd, socialMeta } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const { title, description } = m.landing.blog.meta;
  return {
    title: { absolute: `${title} · ${site.name}` },
    description,
    alternates: alternates("/blog", locale),
    ...socialMeta({ path: "/blog", locale, title, description }),
  };
}

export default async function BlogPage() {
  const [user, locale, m] = await Promise.all([getCurrentUser(), getLocale(), getMessages()]);
  const t = m.landing.blog;
  const jsonLd = [
    breadcrumbLd(
      [
        { name: site.name, path: "/" },
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

  return (
    <>
      <JsonLd data={jsonLd} />
      <LandingHeader loggedIn={!!user} />
      <main className="overflow-x-clip">
        <section className="relative pt-28 pb-20 sm:pt-36 sm:pb-24">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_75%_30%,#f4e4df_0%,transparent_70%)]" />
          <div className="container-x">
            <Breadcrumbs items={[{ name: m.landing.seoPage.home, href: "/" }, { name: t.eyebrow }]} />
            <div className="eyebrow">{t.eyebrow}</div>
            <h1 className="mt-4 max-w-3xl font-serif text-[42px] leading-[1.05] font-medium tracking-tight sm:text-6xl">{t.title}</h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">{t.lead}</p>
            <div className="mt-12 grid gap-5 md:grid-cols-2">
              {articles.map((a) => {
                const c = a.content[locale];
                return (
                  <Link key={a.slug} href={`/blog/${a.slug}`} className="card card-hover flex flex-col p-7">
                    <div className="text-xs text-muted">{t.minutes(a.readMinutes)}</div>
                    <h2 className="mt-3 font-serif text-2xl leading-snug font-medium">{c.title}</h2>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{c.description}</p>
                    <span className="mt-5 text-sm font-medium text-wine">{t.read} →</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
