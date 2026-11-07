import { ChevronDown } from "lucide-react";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
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

/**
 * Юридический документ: читаемая колонка (≈ 70 знаков) и содержание-якоря — слева липкое на ноутбуке, раскрывающееся
 * на телефоне. Разделы с заголовком получают якоря #s1, #s2…; блоки без заголовка остаются в потоке предыдущего.
 */
export async function LegalPage({ title, updated, blocks }: { title: string; updated: string; blocks: LegalBlock[] }) {
  const [user, m] = await Promise.all([getCurrentUser(), getMessages()]);
  // Номер якоря — порядковый номер раздела с заголовком (стабилен, пока не меняется порядок разделов).
  let n = 0;
  const items = blocks.map((b) => ({ b, id: b.h ? `s${++n}` : null }));
  const toc = items.filter((x): x is { b: LegalBlock & { h: string }; id: string } => !!x.id && !!x.b.h);
  const tocList = (
    <ol className="text-[15px] text-ink-soft">
      {toc.map(({ b, id }) => (
        <li key={id}>
          <a href={`#${id}`} className="block py-2 leading-snug hover:text-wine lg:py-1.5">
            {b.h}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <LandingHeader loggedIn={!!user} />
      <main className="overflow-x-clip pt-24 pb-20 sm:pt-32 sm:pb-28">
        <div className="container-x">
          <Breadcrumbs items={[{ name: m.landing.seoPage.home, href: "/" }, { name: title }]} className="max-sm:hidden" />
          <header className="border-b border-ink/80 pb-8 sm:pb-10">
            <h1 className="max-w-3xl font-serif text-[38px] leading-[1.05] font-medium tracking-[-0.01em] text-balance sm:text-[56px]">{title}</h1>
            <p className="mt-4 text-sm text-muted">{m.common.legal.updated(updated)}</p>
          </header>

          <div className="mt-8 lg:mt-12 lg:grid lg:grid-cols-[14rem_minmax(0,40rem)] lg:gap-16">
            <nav aria-label={m.landing.blog.toc} className="hidden lg:sticky lg:top-24 lg:block lg:self-start lg:border-l lg:border-line lg:pl-5">
              <div className="text-sm font-semibold">{m.landing.blog.toc}</div>
              <div className="mt-2">{tocList}</div>
            </nav>
            <details className="group mb-8 rounded-[10px] border border-line bg-white lg:hidden">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                {m.landing.blog.toc}
                <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="border-t border-line px-4 pb-2">{tocList}</div>
            </details>

            <div className="text-[17px] leading-[1.75] text-ink-soft [&_li]:ml-5 [&_li]:list-disc [&_li]:marker:text-wine">
              {items.map(({ b, id }, i) => (
                <section key={i} id={id ?? undefined} className={i === 0 ? "scroll-mt-24 space-y-3" : "mt-8 scroll-mt-24 space-y-3"}>
                  {b.h ? <h2 className="pt-6 font-serif text-[26px] leading-tight font-medium text-ink sm:text-[28px]">{b.h}</h2> : null}
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
        </div>
      </main>
      <Footer />
    </>
  );
}
