import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { PageIntro } from "@/components/landing/PageIntro";
import { JsonLd } from "@/components/seo/JsonLd";
import { getCurrentUser } from "@/server/auth";
import { site } from "@/config/site";
import { getLocale } from "@/i18n/server";
import { alternates } from "@/i18n/seo";
import { articles } from "@/lib/content/articles";
import { tools } from "@/lib/content/tools";
import { toolsPageUi } from "@/lib/content/tools/ui";
import { absoluteUrl, breadcrumbLd, socialMeta } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const { title, description } = toolsPageUi[locale].hubMeta;
  return {
    title: { absolute: `${title} · ${site.name}` },
    description,
    alternates: alternates("/instrumenty", locale),
    ...socialMeta({ path: "/instrumenty", locale, title, description }),
  };
}

/** Хаб бесплатных инструментов: калькуляторы, тесты и генераторы — точки входа из поиска, каждая ведёт к книге. */
export default async function ToolsHubPage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const pg = toolsPageUi[locale];
  const jsonLd = [
    breadcrumbLd(
      [
        { name: pg.home, path: "/" },
        { name: pg.hub, path: "/instrumenty" },
      ],
      locale,
    ),
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: tools.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.content[locale].label, url: absoluteUrl(`/instrumenty/${t.slug}`, locale) })),
    },
  ];

  return (
    <>
      <JsonLd data={jsonLd} />
      <LandingHeader loggedIn={!!user} />
      <main className="overflow-x-clip">
        <PageIntro
          crumbs={[{ name: pg.home, href: "/" }, { name: pg.hub }]}
          title={
            <>
              {pg.hubH1} <span className="italic">{pg.hubAccent}</span>
            </>
          }
          lead={pg.hubLead}
        >
          <p className="mt-4 flex flex-wrap gap-x-4 text-sm text-muted">
            <span>{pg.free}</span>
            <span>{pg.noSignup}</span>
          </p>
        </PageIntro>

        <section className="container-x pb-20">
          <ul className="grid border-t border-ink/80 sm:grid-cols-2 sm:gap-x-10 lg:grid-cols-3">
            {tools.map((t) => {
              const c = t.content[locale];
              return (
                <li key={t.slug} className="border-b border-line">
                  <Link href={`/instrumenty/${t.slug}`} className="group flex h-full flex-col py-7">
                    <h2 className="font-serif text-2xl leading-snug font-medium group-hover:text-wine">{c.label}</h2>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{c.teaser}</p>
                    <span className="mt-4 text-sm font-medium text-wine underline decoration-wine/30 underline-offset-4 group-hover:decoration-wine">{pg.open}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="border-t border-line bg-cream/50 py-14 sm:py-16">
          <div className="container-x">
            <h2 className="font-serif text-3xl font-medium tracking-tight">{pg.hubGuides}</h2>
            <ul className="mt-6 grid gap-x-10 sm:grid-cols-2">
              {articles.map((a) => (
                <li key={a.slug} className="border-b border-line">
                  <Link href={`/blog/${a.slug}`} className="flex min-h-14 items-center py-3 font-medium text-ink-soft hover:text-wine">
                    {a.content[locale].title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
