import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/client";
import type { ReactNode } from "react";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Faq } from "@/components/Faq";
import { PhotoPlate } from "@/components/landing/PageIntro";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { Flourish } from "@/components/landing/FilmFrame";
import { themePhoto } from "@/components/landing/FilmFrame";
import { ToolFrame } from "@/components/tools/Workbench";
import { JsonLd } from "@/components/seo/JsonLd";
import { DeadlineCalculator } from "@/components/tools/DeadlineCalculator";
import { GreetingGenerator } from "@/components/tools/GreetingGenerator";
import { FamilyCalendar } from "@/components/tools/FamilyCalendar";
import { InterviewSheet } from "@/components/tools/InterviewSheet";
import { MushelCalculator } from "@/components/tools/MushelCalculator";
import { BookPlanner } from "@/components/tools/BookPlanner";
import { PagesCalculator } from "@/components/tools/PagesCalculator";
import { PhotoChecker } from "@/components/tools/PhotoChecker";
import { ShezhireBuilder } from "@/components/tools/ShezhireBuilder";
import { PriceCalculator } from "@/components/tools/PriceCalculator";
import { QuestionCards } from "@/components/tools/QuestionCards";
import { Quiz } from "@/components/tools/Quiz";
import { TogetherCounter } from "@/components/tools/TogetherCounter";
import { formatPrice, getAddons, getVisiblePlans, registrationOpen, site } from "@/config/site";
import { getCurrentUser } from "@/server/auth";
import { getLocale, getMessages } from "@/i18n/server";
import { alternates } from "@/i18n/seo";
import { dateFor } from "@/i18n/messages/partial";
import { articles } from "@/lib/content/articles";
import { getLanding } from "@/lib/content/landings";
import { getTool, tools } from "@/lib/content/tools";
import { toolsPageUi, toolUi } from "@/lib/content/tools/ui";
import { cardThemes } from "@/lib/tools/cards";
import { deadlineView, upcomingHolidays } from "@/lib/tools/deadline";
import { quizData } from "@/lib/tools/quiz";
import { weddingAnniversaries } from "@/lib/tools/together";
import { absoluteUrl, breadcrumbLd, faqLd, socialMeta, toolLd } from "@/lib/seo";

// Календарь праздников зависит от даты — обновляем раз в час, как посадочные.
export const revalidate = 3600;

export function generateStaticParams() {
  return tools.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const tool = getTool((await params).slug);
  if (!tool) return {};
  const locale = await getLocale();
  const c = tool.content[locale];
  const path = `/instrumenty/${tool.slug}`;
  return {
    title: { absolute: `${c.metaTitle} · ${site.name}` },
    description: c.metaDescription,
    alternates: alternates(path, locale),
    ...socialMeta({ path, locale, title: c.metaTitle, description: c.metaDescription, key: tool.slug }),
  };
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const tool = getTool((await params).slug);
  if (!tool) notFound();
  const [user, locale, m] = await Promise.all([getCurrentUser(), getLocale(), getMessages()]);
  const c = tool.content[locale];
  const ui = toolUi[locale];
  const pg = toolsPageUi[locale];
  const path = `/instrumenty/${tool.slug}`;
  const url = absoluteUrl(path, locale);

  const guestClosed = !user && !registrationOpen();
  const create = user ? `/books/new?theme=${tool.theme}` : guestClosed ? "/login" : `/register?theme=${tool.theme}`;
  const landing = tool.landing ? getLanding(tool.landing) : undefined;
  const others = tools.filter((t) => t.slug !== tool.slug).slice(0, 6);
  const guides = articles.filter((a) => a.tools?.includes(tool.slug) || a.theme === tool.theme).slice(0, 3);

  const jsonLd = [
    toolLd({ name: c.label, description: c.metaDescription, url, locale }),
    faqLd(c.faq),
    breadcrumbLd(
      [
        { name: pg.home, path: "/" },
        { name: pg.hub, path: "/instrumenty" },
        { name: c.label, path },
      ],
      locale,
    ),
  ];

  const now = new Date();
  const fmt = dateFor(locale);
  const expressAddon = getAddons().find((a) => a.id === "express" && !a.hiddenFor.includes("hardcover"));
  const t = m.secondary.tools;

  let widget: ReactNode = null;
  let extra: ReactNode = null;
  switch (tool.kind) {
    case "together":
      widget = <TogetherCounter />;
      extra = (
        <ExtraSection title={ui.together.tableTitle} lead={ui.together.tableLead}>
          <ul className="grid gap-x-10 border-t border-ink/80 sm:grid-cols-2 lg:grid-cols-3">
            {weddingAnniversaries.map((a) => (
              <li key={a.year} className="flex items-baseline justify-between gap-3 border-b border-line py-3">
                <span className="font-serif text-xl font-medium text-ink tabular-nums">{ui.together.tableYear(a.year)}</span>
                <span className="text-right text-ink-soft">{ui.together.tableName(a[locale])}</span>
              </li>
            ))}
          </ul>
        </ExtraSection>
      );
      break;
    case "deadline": {
      widget = <DeadlineCalculator expressPrice={expressAddon ? formatPrice(expressAddon.price) : null} />;
      const rows = upcomingHolidays(now).map((h) => ({ ...h, view: deadlineView(h.iso, now, "courier", !!expressAddon) }));
      extra = (
        <ExtraSection title={ui.deadline.calendarTitle} lead={ui.deadline.calendarLead}>
          <ul className="border-t border-ink/80">
            {rows.map((r) => (
              <li key={r.id} className="grid gap-x-8 gap-y-1 border-b border-line py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-baseline">
                <div>
                  <div className="font-serif text-xl font-medium text-ink">{ui.deadline.holiday[r.id]}</div>
                  <div className="text-sm text-muted">{fmt(r.date, true)}</div>
                </div>
                <div className="text-[15px] text-ink-soft">
                  {r.view && (r.view.verdict === "digital" || r.view.verdict === "express" || r.view.verdict === "past") ? (
                    <span className="font-medium text-wine">{ui.deadline.tooLate}</span>
                  ) : r.view ? (
                    <>
                      {ui.deadline.orderBy}: <span className="font-medium text-ink">{fmt(r.view.orderBy, true)}</span> · {ui.deadline.daysLeft(r.view.daysToOrder)}
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </ExtraSection>
      );
      break;
    }
    case "price": {
      const plans = getVisiblePlans().map((p) => ({ id: p.id, price: p.price, extraCopyPrice: p.extraCopyPrice, printed: p.printed }));
      const addons = getAddons().map((a) => ({ id: a.id, price: a.price, hiddenFor: [...a.hiddenFor] }));
      widget = <PriceCalculator plans={plans} addons={addons} sign={site.currencySign} ctaHref={create} />;
      break;
    }
    case "greeting":
      widget = <GreetingGenerator />;
      break;
    case "cards":
      widget = <QuestionCards themes={cardThemes(locale)} />;
      break;
    case "photo":
      widget = <PhotoChecker />;
      break;
    case "pages":
      widget = <PagesCalculator ctaHref={create} />;
      break;
    case "planner":
      widget = <BookPlanner expressAvailable={!!expressAddon} />;
      break;
    case "shezhire":
      widget = <ShezhireBuilder />;
      break;
    case "mushel":
      widget = <MushelCalculator />;
      break;
    case "family":
      widget = <FamilyCalendar />;
      break;
    case "anketa":
      widget = <InterviewSheet themes={cardThemes(locale)} />;
      break;
    case "quiz":
      widget = <Quiz quiz={quizData[locale][tool.quiz!]} ctaHref={create} ctaLabel={pg.create} />;
      break;
  }

  const sectionId = (i: number) => `about-${i + 1}`;
  const photo = themePhoto[tool.theme];

  return (
    <>
      <LandingHeader loggedIn={!!user} />
      <JsonLd data={jsonLd} />
      <main className="overflow-x-clip">
        {/* Шапка рабочего листа: что это и что получите — коротко; сам инструмент виден уже на первом экране. */}
        <header className="pt-20 pb-6 sm:pt-32 sm:pb-9">
          <div className="container-x">
            <Breadcrumbs items={[{ name: pg.home, href: "/" }, { name: pg.hub, href: "/instrumenty" }, { name: c.label }]} className="max-sm:hidden" />
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-end lg:gap-14">
              <div className="min-w-0">
                <div className="mb-2 text-sm font-medium text-wine sm:mb-3">{m.secondary.tools.hub.kind[tool.kind]}</div>
                <h1 className="max-w-4xl font-serif text-[34px] leading-[1.05] font-medium tracking-[-0.01em] text-balance sm:text-[56px]">
                  {c.h1} <span className="italic">{c.accent}</span>
                </h1>
                <Flourish className="mt-3 text-wine/45" />
                <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-ink-soft sm:mt-5 sm:text-lg">{c.lead}</p>
              </div>
              <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted lg:mt-0 lg:block lg:space-y-1.5 lg:border-l lg:border-line lg:pl-5">
                <li>{pg.free}</li>
                <li>{pg.noSignup}</li>
                {t.page.facts.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          </div>
        </header>

        <section id="tool" aria-label={t.page.tool} className="scroll-mt-20 pb-16 sm:pb-20">
          <div className="container-x">
            <ToolFrame cta={{ href: create, label: guestClosed ? m.common.nav.login : t.sheet.makeBook, note: t.sheet.makeBookNote }}>{widget}</ToolFrame>
          </div>
        </section>

        {extra}

        {/* Объяснение: слева липкое оглавление, справа колонка ≤ 70 знаков. */}
        <section className="border-t border-line py-14 sm:py-20">
          <div className="container-x lg:grid lg:grid-cols-[13rem_minmax(0,40rem)] lg:gap-16">
            <nav aria-label={t.page.onPage} className="mb-10 lg:sticky lg:top-24 lg:mb-0 lg:self-start lg:border-l lg:border-line lg:pl-5">
              <div className="text-sm font-semibold">{t.page.onPage}</div>
              <ol className="mt-2 space-y-0.5 text-sm text-ink-soft lg:mt-3 lg:space-y-2">
                {c.sections.map((s, i) => (
                  <li key={s.heading}>
                    <a href={`#${sectionId(i)}`} className="block py-1.5 leading-snug hover:text-wine lg:py-0">
                      {s.heading}
                    </a>
                  </li>
                ))}
                <li>
                  <a href="#faq" className="block py-1.5 leading-snug hover:text-wine lg:py-0">
                    {pg.faqTitle}
                  </a>
                </li>
              </ol>
            </nav>
            <div className="space-y-12">
              {c.sections.map((s, i) => (
                <section key={s.heading} id={sectionId(i)} className="scroll-mt-24">
                  <h2 className="font-serif text-[30px] leading-tight font-medium tracking-tight text-balance sm:text-[34px]">{s.heading}</h2>
                  <div className="mt-4 space-y-4 text-[17px] leading-[1.75] text-ink-soft">
                    {s.paragraphs.map((p) => (
                      <p key={p}>{p}</p>
                    ))}
                    {s.list ? (
                      <ul className="list-disc space-y-1.5 pl-5 marker:text-wine">
                        {s.list.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-20 border-t border-line py-14 sm:py-20">
          <div className="container-x lg:grid lg:grid-cols-[13rem_minmax(0,40rem)] lg:gap-16">
            <h2 className="mb-6 font-serif text-4xl leading-[1.05] font-medium tracking-tight lg:mb-0 lg:text-[40px]">{pg.faqTitle}</h2>
            <Faq items={c.faq} size="md" />
          </div>
        </section>

        {/* Призыв после чтения — маленький «кадр» с темой инструмента. */}
        <div className="container-x pb-16 sm:pb-20">
          <PhotoPlate photo={photo.key} position={photo.position} shade="side" className="min-h-[340px] justify-center">
            <div className="relative flex flex-col gap-7 px-5 py-10 sm:px-12 sm:py-14 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <h2 className="font-serif text-[32px] leading-[1.08] font-medium text-balance sm:text-5xl">{c.cta.title}</h2>
                <p className="mt-4 text-lg leading-relaxed text-white/80">{c.cta.text}</p>
              </div>
              <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
                <Link href={create} className="btn btn-primary btn-lg">
                  {guestClosed ? m.common.nav.login : pg.create}
                </Link>
                <Link href={landing ? `/kniga/${landing.slug}` : "/kniga"} className="btn btn-lg border border-[rgb(255_255_255/0.45)] text-white hover:border-[rgb(255_255_255/0.7)] hover:bg-[rgb(255_255_255/0.1)]">
                  {landing ? landing.content[locale].label : pg.seeIdeas}
                </Link>
              </div>
            </div>
          </PhotoPlate>
        </div>

        <section className="border-t border-line py-12 sm:py-14">
          <div className="container-x grid gap-10 md:grid-cols-2 md:gap-14">
            <div>
              <h2 className="text-sm font-semibold">{pg.others}</h2>
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {others.map((x) => (
                  <li key={x.slug}>
                    <Link href={`/instrumenty/${x.slug}`} className="flex min-h-12 items-baseline justify-between gap-4 py-3 text-ink-soft hover:text-wine">
                      <span>{x.content[locale].label}</span>
                      <span className="shrink-0 text-xs text-muted">{t.hub.kind[x.kind]}</span>
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/instrumenty" className="flex min-h-12 items-center py-3 font-medium text-wine hover:underline">
                    {pg.hub}
                  </Link>
                </li>
              </ul>
            </div>
            {guides.length ? (
              <div>
                <h2 className="text-sm font-semibold">{pg.guides}</h2>
                <ul className="mt-3 divide-y divide-line border-y border-line">
                  {guides.map((a) => (
                    <li key={a.slug}>
                      <Link href={`/blog/${a.slug}`} className="flex min-h-12 items-center py-3 leading-snug text-ink-soft hover:text-wine">
                        {a.content[locale].title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

/** Таблица или календарь под инструментом: заголовок слева, ведомость справа на ноутбуке. */
function ExtraSection({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-14 pb-14 sm:pt-16 sm:pb-16">
      <div className="container-x">
        <h2 className="max-w-2xl font-serif text-[32px] leading-tight font-medium tracking-tight sm:text-4xl">{title}</h2>
        <p className="mt-3 mb-8 max-w-2xl text-muted">{lead}</p>
        {children}
      </div>
    </section>
  );
}
