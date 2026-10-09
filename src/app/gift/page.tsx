import type { Metadata } from "next";
import { Gift, PenLine, Sparkles } from "lucide-react";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { getCurrentUser } from "@/server/auth";
import { Faq } from "@/components/Faq";
import { GiftForm } from "./GiftForm";
import { getLocale, getMessages } from "@/i18n/server";
import { alternates } from "@/i18n/seo";
import { socialMeta } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const { metaTitle, metaDescription } = m.gift.page;
  return { title: metaTitle, description: metaDescription, alternates: alternates("/gift", locale), ...socialMeta({ path: "/gift", locale, title: metaTitle, description: metaDescription }) };
}

const icons = [Gift, PenLine, Sparkles];

export default async function GiftPage() {
  const [user, locale, m] = await Promise.all([getCurrentUser(), getLocale(), getMessages()]);
  const t = m.gift.page;
  return (
    <>
      <LandingHeader loggedIn={!!user} />
      <main className="pt-28 pb-20 sm:pt-36">
        <div className="container-x">
          <div className="max-w-2xl">
            <div className="eyebrow">{t.eyebrow}</div>
            <h1 className="mt-3 font-serif text-[40px] leading-[1.05] font-medium tracking-tight sm:text-6xl">
              {t.titleStart} <em className="text-wine">{t.titleAccent}</em>
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-ink-soft">{t.lead}</p>
          </div>

          <div className="mt-12">
            <GiftForm defaults={{ name: user?.name ?? "", email: user?.email ?? "", locale }} />
          </div>

          <section className="mt-24 grid gap-5 md:grid-cols-3">
            {t.steps.map((s, i) => {
              const Icon = icons[i];
              return (
                <div key={s.title} className="card p-6">
                  <div className="flex items-center justify-between">
                    <span className="flex size-11 items-center justify-center rounded-2xl bg-rose text-wine">
                      <Icon className="size-5" />
                    </span>
                    <span className="font-serif text-4xl text-line">{i + 1}</span>
                  </div>
                  <div className="mt-5 text-lg font-semibold">{s.title}</div>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.text}</p>
                </div>
              );
            })}
          </section>

          <section className="mt-20 grid gap-10 lg:grid-cols-[1fr_1.4fr]">
            <h2 className="font-serif text-4xl font-medium">{t.faqTitle}</h2>
            <Faq items={t.faq} size="md" />
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
