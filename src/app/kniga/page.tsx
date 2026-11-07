import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { FilmFrame, Flourish } from "@/components/landing/FilmFrame";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import { getCurrentUser } from "@/server/auth";
import { registrationOpen, site } from "@/config/site";
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

/**
 * Каталог «Идеи подарков»: все посадочные страницы по адресатам — внутренняя перелинковка и точка входа из поиска.
 * Каждый раздел — главная страница крупно (обложка, заголовок, абзац), остальные — строками оглавления. На широком
 * экране слева липкий перечень разделов, на телефоне — чипы в шапке.
 */
export default async function IdeasPage() {
  const [user, locale, m] = await Promise.all([getCurrentUser(), getLocale(), getMessages()]);
  const t = m.landing.ideas;
  // Разделы каталога: по теме-подарку, затем одна подпись для книги о себе и своей книги.
  const sections = [
    ...giftThemes(locale).map((theme) => ({ id: theme.id as string, title: theme.name, lead: "", items: landings.filter((l) => l.theme === theme.id) })),
    { id: "self", title: t.selfTitle, lead: t.selfLead, items: landings.filter((l) => bookKind(l.theme) !== "gift") },
  ].filter((sec) => sec.items.length);
  const guestClosed = !user && !registrationOpen();
  const cta = user ? "/books/new" : guestClosed ? "/login" : "/register";
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
      <LandingHeader loggedIn={!!user} overlay />
      <main className="overflow-x-clip">
        <FilmFrame photo="familydusk" position="50% 62%" size="slim" priority>
          <Breadcrumbs tone="dark" items={[{ name: m.landing.seoPage.home, href: "/" }, { name: m.common.footer.allIdeas }]} />
          <h1 className="max-w-3xl font-serif text-[40px] leading-[1.04] font-medium tracking-[-0.01em] text-balance text-white sm:text-6xl">{t.title}</h1>
          <Flourish className="mt-3 text-[rgb(255_255_255/0.6)]" />
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-white/85 sm:text-lg">{t.lead}</p>
          {/* Прыжок к нужному адресату — на телефоне список длинный; на широком экране то же стоит слева липким столбцом. */}
          <nav aria-label={t.eyebrow} className="no-scrollbar -mx-4 mt-7 flex gap-2 overflow-x-auto px-4 lg:hidden">
            {sections.map((sec) => (
              <a key={sec.id} href={`#${sec.id}`} className="inline-flex h-10 shrink-0 items-center rounded-(--r-ctl) border border-[rgb(255_255_255/0.4)] px-3.5 text-sm text-white hover:bg-[rgb(255_255_255/0.1)]">
                {sec.title}
              </a>
            ))}
          </nav>
        </FilmFrame>

        <div className="container-x grid gap-x-16 pt-14 pb-6 sm:pt-20 lg:grid-cols-[13rem_minmax(0,1fr)] xl:gap-x-24">
          <nav aria-label={t.eyebrow} className="hidden lg:block">
            <ul className="sticky top-28 border-l border-line text-[15px]">
              {sections.map((sec) => (
                <li key={sec.id}>
                  <a href={`#${sec.id}`} className="-ml-px flex min-h-9 items-center border-l border-transparent pl-4 text-ink-soft hover:border-wine hover:text-wine">
                    {sec.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            {sections.map((sec) => {
              const [first, ...rest] = sec.items;
              const c = first.content[locale];
              return (
                <section key={sec.id} id={sec.id} className="scroll-mt-24 border-t border-line py-12 first:border-t-0 first:pt-0 sm:py-16">
                  <h2 className="font-serif text-[32px] leading-tight font-medium tracking-tight sm:text-[40px]">{sec.title}</h2>
                  {sec.lead ? <p className="mt-3 max-w-xl leading-relaxed text-muted">{sec.lead}</p> : null}
                  <Link href={`/kniga/${first.slug}`} className="group mt-8 grid gap-6 sm:grid-cols-[10.5rem_minmax(0,1fr)] sm:gap-10">
                    <div className="w-[8.5rem] sm:w-auto">
                      <CoverPreview template={first.coverTemplate} title={c.cover.title} subtitle={c.cover.subtitle} names={c.cover.names} lite className="rounded-[3px] shadow-book transition duration-500 ease-(--ease-out-soft) group-hover:-translate-y-1.5" />
                    </div>
                    <div className="self-center">
                      <h3 className="font-serif text-[26px] leading-tight font-medium group-hover:text-wine sm:text-[30px]">{c.label}</h3>
                      <p className="mt-3 max-w-xl leading-relaxed text-ink-soft">{c.lead}</p>
                      <span className="mt-4 inline-block font-medium text-wine underline decoration-wine/30 underline-offset-4 group-hover:decoration-wine">{t.open}</span>
                    </div>
                  </Link>
                  {rest.length ? (
                    <ul className="mt-10 divide-y divide-line border-y border-line">
                      {rest.map((l) => {
                        const rc = l.content[locale];
                        return (
                          <li key={l.slug}>
                            <Link href={`/kniga/${l.slug}`} className="group grid min-h-16 grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-4 py-3 sm:grid-cols-[2.75rem_minmax(0,16rem)_minmax(0,1fr)] sm:gap-6">
                              <CoverPreview template={l.coverTemplate} title={rc.cover.title} subtitle={rc.cover.subtitle} names={rc.cover.names} lite className="rounded-[2px] shadow-book" />
                              <span className="font-medium group-hover:text-wine">{rc.label}</span>
                              <span className="line-clamp-2 text-sm leading-snug text-muted max-sm:col-start-2 sm:line-clamp-1">{rc.lead}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </section>
              );
            })}
          </div>
        </div>

        <section className="border-t border-line bg-cream/50 py-16 sm:py-20">
          <div className="container-x grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-x-16 xl:gap-x-24">
            <h2 className="font-serif text-[28px] leading-tight font-medium tracking-tight sm:text-3xl">{t.guides}</h2>
            <ul className="grid gap-x-12 sm:grid-cols-2">
              {articles.map((a) => (
                <li key={a.slug} className="border-b border-line">
                  <Link href={`/blog/${a.slug}`} className="flex min-h-14 items-center py-3 font-serif text-xl leading-snug font-medium text-ink-soft hover:text-wine">
                    {a.content[locale].title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Финал: тот же кадр-призыв, что на главной, — каталог не должен кончаться тупиком. */}
        <FilmFrame photo="sunsetwalk" position="50% 55%" size="band">
          <div className="max-w-2xl">
            <h2 className="font-serif text-[36px] leading-[1.04] font-medium text-white sm:text-5xl">{m.landing.cta.title}</h2>
            <Flourish className="mt-3 text-[rgb(255_255_255/0.55)]" />
            <p className="mt-5 max-w-lg text-lg text-white/85">{m.landing.cta.text}</p>
            <Link href={cta} data-main-cta="" className="btn btn-primary btn-lg mt-8 max-sm:w-full">
              {guestClosed ? m.common.nav.login : m.landing.cta.button}
            </Link>
          </div>
        </FilmFrame>
      </main>
      <Footer />
    </>
  );
}
