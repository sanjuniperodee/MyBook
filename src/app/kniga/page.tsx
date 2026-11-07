import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { PageIntro } from "@/components/landing/PageIntro";
import { JsonLd } from "@/components/seo/JsonLd";
import { getCurrentUser } from "@/server/auth";
import { site } from "@/config/site";
import { getLocale, getMessages } from "@/i18n/server";
import { alternates } from "@/i18n/seo";
import { articles } from "@/lib/content/articles";
import { landings } from "@/lib/content/landings";
import { bookKind } from "@/lib/content/kinds";
import { giftThemes } from "@/lib/content/themes";
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
  // Разделы хаба: по теме-подарку, затем одна подпись для книги о себе и своей книги.
  const sections = [
    ...giftThemes(locale).map((theme) => ({ id: theme.id as string, title: theme.name, lead: "", items: landings.filter((l) => l.theme === theme.id) })),
    { id: "self", title: t.selfTitle, lead: t.selfLead, items: landings.filter((l) => bookKind(l.theme) !== "gift") },
  ].filter((sec) => sec.items.length);
  const jsonLd = [
    breadcrumbLd(
      [
        { name: m.landing.seoPage.home, path: "/" },
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
        <PageIntro crumbs={[{ name: m.landing.seoPage.home, href: "/" }, { name: m.common.footer.allIdeas }]} title={t.title} lead={t.lead}>
          {/* Оглавление хаба: прыжок к нужному адресату — на телефоне список длинный. */}
          <nav aria-label={t.eyebrow} className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {sections.map((sec) => (
              <a key={sec.id} href={`#${sec.id}`} className="text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-wine hover:decoration-wine">
                {sec.title}
              </a>
            ))}
          </nav>
        </PageIntro>

        {sections.map((sec) => (
          <section key={sec.id} id={sec.id} className="scroll-mt-20 border-t border-line py-12 sm:py-16">
            <div className="container-x grid gap-8 lg:grid-cols-[16rem_1fr] lg:gap-12">
              <div>
                <h2 className="font-serif text-3xl leading-tight font-medium tracking-tight lg:sticky lg:top-24">{sec.title}</h2>
                {sec.lead ? <p className="mt-3 text-sm leading-relaxed text-muted">{sec.lead}</p> : null}
              </div>
              <ul className="grid gap-x-10 sm:grid-cols-2">
                {sec.items.map((l) => {
                  const c = l.content[locale];
                  return (
                    <li key={l.slug} className="border-b border-line last:border-b-0 sm:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
                      <Link href={`/kniga/${l.slug}`} className="group flex gap-5 py-5">
                        <div className="w-16 shrink-0 sm:w-20">
                          <CoverPreview template={l.coverTemplate} title={c.cover.title} subtitle={c.cover.subtitle} names={c.cover.names} lite className="rounded-[2px] shadow-book transition duration-300 group-hover:-translate-y-1" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold group-hover:text-wine">{c.label}</h3>
                          <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-muted">{c.lead}</p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        ))}

        <section className="border-t border-line bg-cream/50 py-14 sm:py-16">
          <div className="container-x grid gap-8 lg:grid-cols-[16rem_1fr] lg:gap-12">
            <h2 className="font-serif text-3xl leading-tight font-medium tracking-tight">{t.guides}</h2>
            <ul className="grid gap-x-10 sm:grid-cols-2">
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
