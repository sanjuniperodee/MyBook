import type { Metadata } from "next";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { getCurrentUser } from "@/server/auth";
import { Faq } from "@/components/Faq";
import { GiftForm } from "./GiftForm";
import { PageIntro } from "@/components/landing/PageIntro";
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
      <main className="pb-20">
        <PageIntro
          crumbs={[{ name: m.landing.seoPage.home, href: "/" }, { name: t.eyebrow }]}
          title={
            <>
              {t.titleStart} <span className="italic">{t.titleAccent}</span>
            </>
          }
          lead={t.lead}
          className="pb-10 sm:pb-12"
        />

        <div className="container-x">
          <GiftForm defaults={{ name: user?.name ?? "", email: user?.email ?? "", locale }} />

          {/* Как это происходит: купить → вручить → получатель пишет. Настоящая последовательность — с номерами. */}
          <ol className="mt-24 grid gap-10 border-t border-line pt-10 md:grid-cols-3 md:gap-8">
            {t.steps.map((s, i) => (
              <li key={s.title}>
                <span className="font-serif text-5xl leading-none text-wine tabular-nums">{i + 1}</span>
                <h2 className="mt-4 text-lg font-semibold">{s.title}</h2>
                <p className="mt-1.5 leading-relaxed text-ink-soft">{s.text}</p>
              </li>
            ))}
          </ol>

          <section className="mt-24 grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
            <h2 className="font-serif text-4xl leading-[1.05] font-medium tracking-tight sm:text-5xl">{t.faqTitle}</h2>
            <Faq items={t.faq} size="md" />
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
