import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/client";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
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
        <section className="relative pt-28 pb-12 sm:pt-36 sm:pb-16">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_75%_30%,#f4e4df_0%,transparent_70%)]" />
          <div className="container-x">
            <Breadcrumbs items={[{ name: pg.home, href: "/" }, { name: pg.hub }]} />
            <div className="eyebrow">
              {pg.free} · {pg.noSignup}
            </div>
            <h1 className="mt-4 max-w-3xl font-serif text-[42px] leading-[1.05] font-medium tracking-tight sm:text-6xl">
              {pg.hubH1} <em className="text-wine">{pg.hubAccent}</em>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">{pg.hubLead}</p>
          </div>
        </section>

        <section className="pb-20">
          <div className="container-x grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((t) => {
              const c = t.content[locale];
              return (
                <Link key={t.slug} href={`/instrumenty/${t.slug}`} className="card card-hover flex flex-col p-7">
                  <h2 className="font-serif text-2xl leading-snug font-medium">{c.label}</h2>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{c.teaser}</p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-wine">
                    {pg.open} <ArrowRight className="size-4" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="border-t border-line/70 bg-cream/50 py-14 sm:py-16">
          <div className="container-x">
            <h2 className="font-serif text-3xl font-medium tracking-tight">{pg.hubGuides}</h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {articles.map((a) => (
                <li key={a.slug}>
                  <Link href={`/blog/${a.slug}`} className="block rounded-2xl border border-line bg-white px-5 py-4 hover:border-ink/30">
                    <span className="font-medium">{a.content[locale].title}</span>
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
