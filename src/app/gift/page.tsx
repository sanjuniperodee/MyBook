import type { Metadata } from "next";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { getCurrentUser } from "@/server/auth";
import { Faq } from "@/components/Faq";
import { GiftForm } from "./GiftForm";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { Flourish } from "@/components/landing/FilmFrame";
import { JsonLd } from "@/components/seo/JsonLd";
import { getLocale, getMessages } from "@/i18n/server";
import { alternates } from "@/i18n/seo";
import { breadcrumbLd, faqLd, socialMeta } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const { metaTitle, metaDescription } = m.gift.page;
  return { title: metaTitle, description: metaDescription, alternates: alternates("/gift", locale), ...socialMeta({ path: "/gift", locale, title: metaTitle, description: metaDescription }) };
}

export default async function GiftPage() {
  const [user, locale, m] = await Promise.all([getCurrentUser(), getLocale(), getMessages()]);
  const t = m.gift.page;
  // Вопросы о сертификате — в разметке FAQPage (расширенный сниппет), путь — в BreadcrumbList.
  const jsonLd = [
    faqLd(t.faq),
    breadcrumbLd(
      [
        { name: m.landing.seoPage.home, path: "/" },
        { name: t.eyebrow, path: "/gift" },
      ],
      locale,
    ),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <LandingHeader loggedIn={!!user} />
      <main className="overflow-x-clip pt-24 pb-20 sm:pt-32 sm:pb-28">
        <div className="container-x">
          <GiftForm
            defaults={{ name: user?.name ?? "", email: user?.email ?? "", locale }}
            intro={
              <>
                <Breadcrumbs items={[{ name: m.landing.seoPage.home, href: "/" }, { name: t.eyebrow }]} className="max-sm:hidden" />
                <h1 className="font-serif text-[38px] leading-[1.05] font-medium tracking-[-0.01em] text-balance sm:text-[52px]">
                  {t.titleStart} <span className="italic">{t.titleAccent}</span>
                </h1>
                <Flourish className="mt-3 text-wine/45" />
                <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-ink-soft sm:text-lg">{t.lead}</p>
              </>
            }
          />

          {/* Как это происходит: купить, вручить, получатель пишет. Настоящая последовательность — с номерами и общей линией. */}
          <section aria-labelledby="gift-steps" className="mt-20 sm:mt-28">
            <h2 id="gift-steps" className="font-serif text-4xl leading-[1.05] font-medium tracking-tight sm:text-5xl">
              {t.stepsTitle}
            </h2>
            <ol className="mt-8 grid border-t border-ink/80 md:grid-cols-3">
              {t.steps.map((s, i) => (
                <li key={s.title} className="relative border-b border-line py-7 md:border-b-0 md:border-l md:px-8 md:first:border-l-0 md:first:pl-0">
                  <span className="font-serif text-5xl leading-none text-wine tabular-nums">{i + 1}</span>
                  <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-1.5 max-w-sm leading-relaxed text-ink-soft">{s.text}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-20 grid gap-8 sm:mt-28 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14">
            <h2 className="font-serif text-4xl leading-[1.05] font-medium tracking-tight sm:text-5xl">{t.faqTitle}</h2>
            <Faq items={t.faq} size="md" />
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
