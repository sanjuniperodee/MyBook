import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/client";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { PhotoPlate } from "@/components/landing/PageIntro";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { Flourish } from "@/components/landing/FilmFrame";
import { JsonLd } from "@/components/seo/JsonLd";
import { getCurrentUser } from "@/server/auth";
import { registrationOpen, site } from "@/config/site";
import { getLocale, getMessages } from "@/i18n/server";
import { alternates } from "@/i18n/seo";
import { articles } from "@/lib/content/articles";
import { tools, type ToolDef, type ToolKind } from "@/lib/content/tools";
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

/** Раздел каталога по виду инструмента: новый инструмент попадёт в нужный раздел без правок страницы. */
const groupOf: Record<ToolKind, "book" | "family" | "talk"> = {
  shezhire: "book",
  photo: "book",
  planner: "book",
  pages: "book",
  anketa: "book",
  price: "book",
  deadline: "book",
  family: "family",
  mushel: "family",
  together: "family",
  greeting: "talk",
  cards: "talk",
  quiz: "talk",
};

/**
 * Каталог бесплатных инструментов: калькуляторы, тесты и генераторы — точки входа из поиска, каждая ведёт к книге.
 * Не сетка плиток, а ведомость по разделам: слева подпись «что это», в середине название и описание.
 */
export default async function ToolsHubPage() {
  const [user, locale, m] = await Promise.all([getCurrentUser(), getLocale(), getMessages()]);
  const pg = toolsPageUi[locale];
  const t = m.secondary.tools.hub;
  const guestClosed = !user && !registrationOpen();
  const create = user ? "/books/new" : guestClosed ? "/login" : "/register";
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
      itemListElement: tools.map((x, i) => ({ "@type": "ListItem", position: i + 1, name: x.content[locale].label, url: absoluteUrl(`/instrumenty/${x.slug}`, locale) })),
    },
  ];
  const groups = t.groups.map((g) => ({ ...g, items: tools.filter((x) => groupOf[x.kind] === g.id) })).filter((g) => g.items.length);
  const featured = groups[0]?.items[0];

  const row = (x: ToolDef, big = false) => {
    const c = x.content[locale];
    return (
      <li key={x.slug} className="border-b border-line">
        <Link href={`/instrumenty/${x.slug}`} className="group grid min-h-20 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 py-5 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] sm:gap-x-6 sm:py-6">
          <span className="col-span-2 text-sm text-muted sm:col-span-1 sm:pt-1.5">
            {big ? <span className="block font-medium text-wine">{t.startHere}</span> : null}
            {t.kind[x.kind]}
          </span>
          <span className="min-w-0">
            <span className={`block font-serif leading-snug font-medium text-balance group-hover:text-wine ${big ? "text-[30px] sm:text-[38px] sm:leading-[1.1]" : "text-2xl"}`}>{c.label}</span>
            <span className={`mt-1.5 block max-w-xl leading-relaxed text-muted ${big ? "text-base" : "text-[15px]"}`}>{c.teaser}</span>
          </span>
          <span className="mt-1.5 grid size-9 place-items-center text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-wine" aria-hidden>
            <ChevronRight className="size-5" />
          </span>
          <span className="sr-only">{pg.open}</span>
        </Link>
      </li>
    );
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <LandingHeader loggedIn={!!user} />
      <main className="overflow-x-clip pt-20 sm:pt-24">
        <div className="container-x">
          <PhotoPlate photo="familydusk" position="50% 55%" shade="side" priority className="min-h-[380px] justify-between sm:min-h-[460px]">
            <div className="relative px-5 pt-6 sm:px-10 sm:pt-9">
              <Breadcrumbs items={[{ name: pg.home, href: "/" }, { name: pg.hub }]} tone="dark" className="mb-0" />
            </div>
            <div className="relative px-5 pb-8 sm:px-10 sm:pb-12">
              <h1 className="max-w-3xl font-serif text-[40px] leading-[1.04] font-medium tracking-[-0.01em] text-balance sm:text-6xl">
                {pg.hubH1} <span className="italic">{pg.hubAccent}</span>
              </h1>
              <Flourish className="mt-3 text-white/55" />
              <p className="mt-5 line-clamp-4 max-w-2xl text-[17px] leading-relaxed text-white/85 sm:line-clamp-none sm:text-lg">{pg.hubLead}</p>
              <p className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/75">
                <span>{pg.free}</span>
                <span>{pg.noSignup}</span>
                <span>{t.count(tools.length)}</span>
              </p>
            </div>
          </PhotoPlate>
        </div>

        <div className="container-x mt-10 pb-20 lg:mt-14 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14">
          {/* Разделы: на телефоне лента над списком, на ноутбуке — липкая колонка слева. */}
          <nav aria-label={t.groupsLabel} className="-mx-4 mb-8 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:sticky lg:top-24 lg:mx-0 lg:mb-0 lg:flex-col lg:gap-0 lg:self-start lg:overflow-visible lg:border-l lg:border-line lg:p-0">
            <div className="hidden px-4 pb-3 text-sm font-semibold lg:block">{t.groupsLabel}</div>
            {groups.map((g) => (
              <a key={g.id} href={`#${g.id}`} className="chip shrink-0 max-lg:h-11 lg:h-auto lg:min-h-10 lg:justify-between lg:rounded-none lg:border-0 lg:bg-transparent lg:px-4 lg:py-2 lg:text-[15px] lg:hover:text-wine">
                <span>{g.title}</span>
                <span className="count">{g.items.length}</span>
              </a>
            ))}
          </nav>

          <div className="min-w-0 space-y-14 lg:space-y-16">
            {groups.map((g) => (
              <section key={g.id} id={g.id} aria-labelledby={`${g.id}-title`} className="scroll-mt-24">
                <div className="flex flex-col gap-2 border-b border-ink/80 pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
                  <h2 id={`${g.id}-title`} className="font-serif text-[32px] leading-tight font-medium sm:text-4xl">
                    {g.title}
                  </h2>
                  <p className="max-w-sm text-[15px] leading-relaxed text-muted">{g.note}</p>
                </div>
                <ul>{g.items.map((x) => row(x, x === featured))}</ul>
              </section>
            ))}

            <section aria-labelledby="guides-title" className="scroll-mt-24">
              <div className="flex flex-col gap-2 border-b border-ink/80 pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
                <h2 id="guides-title" className="font-serif text-[32px] leading-tight font-medium sm:text-4xl">
                  {pg.hubGuides}
                </h2>
                <p className="max-w-sm text-[15px] leading-relaxed text-muted">{t.guidesNote}</p>
              </div>
              <ul className="grid gap-x-10 sm:grid-cols-2">
                {articles.map((a) => (
                  <li key={a.slug} className="border-b border-line">
                    <Link href={`/blog/${a.slug}`} className="flex min-h-14 items-center py-3 leading-snug font-medium text-ink-soft hover:text-wine">
                      {a.content[locale].title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <div className="container-x pb-20 sm:pb-28">
          <PhotoPlate photo="postcards" position="50% 45%" shade="side" className="min-h-[340px] justify-center">
            <div className="relative px-5 py-10 sm:px-12 sm:py-14">
              <div className="text-sm font-medium text-white/75">{t.bookKicker}</div>
              <h2 className="mt-2 max-w-2xl font-serif text-[32px] leading-[1.08] font-medium text-balance sm:text-5xl">{t.bookTitle}</h2>
              <p className="mt-4 max-w-xl text-white/80">{t.bookText}</p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link href={create} className="btn btn-primary btn-lg">
                  {guestClosed ? m.common.nav.login : pg.create}
                </Link>
                <Link href="/kniga" className="btn btn-lg border border-[rgb(255_255_255/0.45)] text-white hover:border-[rgb(255_255_255/0.7)] hover:bg-[rgb(255_255_255/0.1)]">
                  {pg.seeIdeas}
                </Link>
              </div>
            </div>
          </PhotoPlate>
        </div>
      </main>
      <Footer />
    </>
  );
}
