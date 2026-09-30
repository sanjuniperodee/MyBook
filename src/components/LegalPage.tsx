import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { productionDays, site } from "@/config/site";
import { getMessages } from "@/i18n/server";
import type { LegalBlock, LegalFacts } from "@/i18n/messages/ru/legal";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";

/** Реквизиты и параметры, которые подставляются в тексты оферты и политики. */
export function legalFacts(address: string): LegalFacts {
  return {
    legalName: site.company.legalName,
    bin: site.company.bin,
    url: env.appUrl,
    brand: site.name,
    email: site.contacts.email,
    phone: site.contacts.phone,
    address,
    standardDays: productionDays.standard,
    premiumDays: productionDays.premium,
  };
}

export async function LegalPage({ title, updated, blocks }: { title: string; updated: string; blocks: LegalBlock[] }) {
  const [user, m] = await Promise.all([getCurrentUser(), getMessages()]);
  return (
    <>
      <LandingHeader loggedIn={!!user} />
      <main className="container-x max-w-3xl pt-28 pb-20 sm:pt-36">
        <h1 className="font-serif text-4xl font-medium sm:text-5xl">{title}</h1>
        <p className="mt-3 text-sm text-muted">{m.common.legal.updated(updated)}</p>
        <div className="mt-10 space-y-5 leading-relaxed text-ink-soft [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc">
          {blocks.map((b, i) => (
            <section key={i} className="space-y-3">
              {b.h ? <h2>{b.h}</h2> : null}
              {b.p ? <p>{b.p}</p> : null}
              {b.ul ? (
                <ul className="space-y-1.5">
                  {b.ul.map((li) => (
                    <li key={li}>{li}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
