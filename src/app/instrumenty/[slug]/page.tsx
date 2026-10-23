import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, BookOpen, Wrench } from "lucide-react";
import { Link } from "@/i18n/client";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Faq } from "@/components/Faq";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
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

  let widget: React.ReactNode = null;
  let extra: React.ReactNode = null;
  switch (tool.kind) {
    case "together":
      widget = <TogetherCounter />;
      extra = (
        <section className="py-16 sm:py-20">
          <div className="container-x">
            <h2 className="max-w-2xl font-serif text-3xl font-medium tracking-tight sm:text-4xl">{ui.together.tableTitle}</h2>
            <p className="mt-3 max-w-2xl text-muted">{ui.together.tableLead}</p>
            <ul className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {weddingAnniversaries.map((a) => (
                <li key={a.year} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white px-5 py-3">
                  <span className="font-medium text-ink">{ui.together.tableYear(a.year)}</span>
                  <span className="text-right text-ink-soft">{ui.together.tableName(a[locale])}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      );
      break;
    case "deadline": {
      widget = <DeadlineCalculator expressPrice={expressAddon ? formatPrice(expressAddon.price) : null} />;
      const rows = upcomingHolidays(now).map((h) => ({ ...h, view: deadlineView(h.iso, now, "courier", !!expressAddon) }));
      extra = (
        <section className="py-16 sm:py-20">
          <div className="container-x">
            <h2 className="max-w-2xl font-serif text-3xl font-medium tracking-tight sm:text-4xl">{ui.deadline.calendarTitle}</h2>
            <p className="mt-3 max-w-2xl text-muted">{ui.deadline.calendarLead}</p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {rows.map((r) => (
                <li key={r.id} className="rounded-2xl border border-line bg-white px-5 py-4">
                  <div className="font-medium text-ink">{ui.deadline.holiday[r.id]}</div>
                  <div className="text-sm text-muted">{fmt(r.date, true)}</div>
                  <div className="mt-2 text-sm text-ink-soft">
                    {r.view && (r.view.verdict === "digital" || r.view.verdict === "express" || r.view.verdict === "past") ? (
                      <span className="text-wine">{ui.deadline.tooLate}</span>
                    ) : r.view ? (
                      <>
                        {ui.deadline.orderBy}: <span className="font-medium text-ink">{fmt(r.view.orderBy, true)}</span> · {ui.deadline.daysLeft(r.view.daysToOrder)}
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
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

  return (
    <>
      <LandingHeader loggedIn={!!user} />
      <JsonLd data={jsonLd} />
      <main className="overflow-x-clip">
        <section className="relative pt-28 pb-10 sm:pt-36 sm:pb-14">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_75%_30%,#f4e4df_0%,transparent_70%)]" />
          <div className="container-x">
            <Breadcrumbs items={[{ name: pg.home, href: "/" }, { name: pg.hub, href: "/instrumenty" }, { name: c.label }]} />
            <div className="eyebrow">
              {pg.free} · {pg.noSignup}
            </div>
            <h1 className="mt-4 max-w-4xl font-serif text-[40px] leading-[1.05] font-medium tracking-tight sm:text-6xl">
              {c.h1} <em className="text-wine">{c.accent}</em>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">{c.lead}</p>
          </div>
        </section>

        <section className="pb-16 sm:pb-20">
          <div className="container-x max-w-4xl">{widget}</div>
        </section>

        {extra}

        <section className="border-y border-line/70 bg-white/60 py-16 sm:py-20">
          <div className="container-x grid gap-10 lg:grid-cols-2">
            {c.sections.map((s) => (
              <div key={s.heading} className={c.sections.length % 2 === 1 && s === c.sections[c.sections.length - 1] ? "lg:col-span-2" : undefined}>
                <h2 className="font-serif text-3xl font-medium tracking-tight">{s.heading}</h2>
                <div className="mt-4 space-y-3 leading-relaxed text-ink-soft">
                  {s.paragraphs.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                  {s.list ? (
                    <ul className="list-disc space-y-1 pl-5">
                      {s.list.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-cream/60 py-16 sm:py-20">
          <div className="container-x flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-wine">
                <BookOpen className="size-5" />
              </div>
              <h2 className="mt-3 font-serif text-3xl font-medium tracking-tight sm:text-4xl">{c.cta.title}</h2>
              <p className="mt-3 text-lg leading-relaxed text-ink-soft">{c.cta.text}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href={create} className="btn btn-primary btn-lg">
                {guestClosed ? m.common.nav.login : pg.create} <ArrowRight className="size-5" />
              </Link>
              <Link href={landing ? `/kniga/${landing.slug}` : "/kniga"} className="btn btn-outline btn-lg">
                {landing ? landing.content[locale].label : pg.seeIdeas}
              </Link>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20">
          <div className="container-x grid gap-10 lg:grid-cols-[1fr_1.4fr]">
            <h2 className="font-serif text-4xl font-medium">{pg.faqTitle}</h2>
            <Faq items={c.faq} size="md" />
          </div>
        </section>

        <section className="border-t border-line py-14">
          <div className="container-x grid gap-10 md:grid-cols-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Wrench className="size-4 text-wine" /> {pg.others}
              </div>
              <ul className="mt-4 flex flex-wrap gap-2">
                {others.map((t) => (
                  <li key={t.slug}>
                    <Link href={`/instrumenty/${t.slug}`} className="block rounded-full border border-line bg-white px-4 py-1.5 text-sm text-ink-soft hover:border-ink/30">
                      {t.content[locale].label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/instrumenty" className="block rounded-full border border-line bg-white px-4 py-1.5 text-sm text-wine hover:border-ink/30">
                    {pg.hub} →
                  </Link>
                </li>
              </ul>
            </div>
            {guides.length ? (
              <div>
                <div className="text-sm font-semibold">{pg.guides}</div>
                <ul className="mt-4 space-y-2 text-sm">
                  {guides.map((a) => (
                    <li key={a.slug}>
                      <Link href={`/blog/${a.slug}`} className="text-ink-soft hover:text-wine">
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
