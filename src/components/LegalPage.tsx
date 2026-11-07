import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { PageIntro } from "@/components/landing/PageIntro";
import { productionDays, site } from "@/config/site";
import { getMessages } from "@/i18n/server";
import type { LegalBlock, LegalFacts } from "@/i18n/messages/ru/legal";
import { getCurrentUser } from "@/server/auth";
import { env } from "@/config/env";

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
      <main className="pb-20 sm:pb-28">
        <PageIntro narrow title={title} lead={<span className="text-sm text-muted">{m.common.legal.updated(updated)}</span>} className="pb-8 sm:pb-10" />
        <div className="container-x max-w-3xl">
          <div className="border-t border-ink/80 text-[16px] leading-[1.75] text-ink-soft [&_h2]:mt-12 [&_h2]:font-serif [&_h2]:text-[26px] [&_h2]:leading-tight [&_h2]:font-medium [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_li]:marker:text-wine">
            {blocks.map((b, i) => (
              <section key={i} className="mt-5 space-y-3">
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
        </div>
      </main>
      <Footer />
    </>
  );
}
