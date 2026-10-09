import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Book3D } from "@/components/cover/Book3D";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import { getCurrentUser } from "@/server/auth";
import { site } from "@/config/site";
import { getLocale, getMessages } from "@/i18n/server";
import { alternates } from "@/i18n/seo";
import { articles } from "@/lib/content/articles";
import { landings } from "@/lib/content/landings";
import { getThemes } from "@/lib/content/themes";
import { absoluteUrl, breadcrumbLd, socialMeta } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const { title, description } = m.landing.ideas.meta;
  return {
    title: { absolute: `${title} · ${site.name}` },
    description,
    alternates: alternates("/kniga", locale),
    ...socialMeta({ path: "/kniga", locale, title, description }),
  };
}

/** Хаб «Идеи подарков»: все посадочные страницы по темам — внутренняя перелинковка и точка входа из поиска. */
export default async function IdeasPage() {
  const [user, locale, m] = await Promise.all([getCurrentUser(), getLocale(), getMessages()]);
  const t = m.landing.ideas;
  const themes = getThemes(locale);
  const jsonLd = [
    breadcrumbLd(
      [
        { name: site.name, path: "/" },
        { name: m.common.footer.allIdeas, path: "/kniga" },
      ],
      locale,
    ),
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: landings.map((l, i) => ({ "@type": "ListItem", position: i + 1, name: l.content[locale].label, url: absoluteUrl(`/kniga/${l.slug}`, locale) })),
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
            <Breadcrumbs items={[{ name: m.landing.seoPage.home, href: "/" }, { name: m.common.footer.allIdeas }]} />
            <div className="eyebrow">{t.eyebrow}</div>
            <h1 className="mt-4 max-w-3xl font-serif text-[42px] leading-[1.05] font-medium tracking-tight sm:text-6xl">{t.title}</h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">{t.lead}</p>
          </div>
        </section>

        {themes.map((theme) => {
          const items = landings.filter((l) => l.theme === theme.id);
          if (!items.length) return null;
          return (
            <section key={theme.id} className="border-t border-line/70 py-14 sm:py-16">
              <div className="container-x">
                <h2 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">{theme.name}</h2>
                <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((l) => {
                    const c = l.content[locale];
                    return (
                      <Link key={l.slug} href={`/kniga/${l.slug}`} className="card card-hover flex gap-5 p-5">
                        <div className="w-24 shrink-0">
                          <Book3D template={l.coverTemplate} title={c.cover.title} subtitle={c.cover.subtitle} names={c.cover.names} rotate={-14} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold">{c.label}</h3>
                          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{c.lead}</p>
                          <span className="mt-3 inline-block text-sm font-medium text-wine">{t.open} →</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}

        <section className="border-t border-line/70 bg-cream/50 py-14 sm:py-16">
          <div className="container-x">
            <h2 className="font-serif text-3xl font-medium tracking-tight">{t.guides}</h2>
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
