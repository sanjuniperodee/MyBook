import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import {
  ArrowRight,
  BookHeart,
  Camera,
  Check,
  Eye,
  Gift,
  PenLine,
  Printer,
  Save,
  Sparkles,
  Truck,
  Type,
  WandSparkles,
} from "lucide-react";
import { LandingHeader } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Book3D } from "@/components/cover/Book3D";
import { GiftCardVisual } from "@/components/GiftCardVisual";
import { SampleBook } from "@/components/landing/SampleBook";
import { TrustList } from "@/components/TrustList";
import { Faq } from "@/components/Faq";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { coverTemplates } from "@/lib/book/covers";
import { countQuestions, getThemes } from "@/lib/content/themes";
import { getCurrentUser } from "@/lib/auth";
import { formatPrice, plans, productionDays, site } from "@/config/site";
import { getLocale, getMessages } from "@/i18n/server";
import { alternates } from "@/i18n/seo";
import { coverName } from "@/i18n/labels";

export async function generateMetadata(): Promise<Metadata> {
  return { alternates: alternates("/", await getLocale()) };
}

export default async function HomePage() {
  const [user, locale, m] = await Promise.all([getCurrentUser(), getLocale(), getMessages()]);
  const t = m.landing;
  const cta = user ? "/books/new" : "/register";
  const themes = getThemes(locale);
  const loveCount = countQuestions(themes[0]);
  const faq = t.faq.items(productionDays);

  return (
    <>
      <LandingHeader loggedIn={!!user} />
      <main className="overflow-x-clip">
        {/* ─── HERO ─── */}
        <section className="relative pt-28 pb-16 sm:pt-36 sm:pb-24">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_75%_30%,#f4e4df_0%,transparent_70%),radial-gradient(40%_40%_at_10%_80%,#efe7da_0%,transparent_70%)]" />
          <div className="container-x grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
            <div>
              <div style={{ "--i": 0 } as React.CSSProperties} className="enter inline-flex items-center gap-2 rounded-full border border-line bg-white/70 px-3.5 py-1.5 text-sm text-ink-soft shadow-soft">
                <Sparkles className="size-4 text-wine" /> {t.hero.badge}
              </div>
              <h1 style={{ "--i": 1 } as React.CSSProperties} className="enter mt-6 font-serif text-[44px] leading-[1.02] font-medium tracking-tight sm:text-6xl lg:text-7xl">
                {t.hero.titleStart}{" "}
                <em className="relative inline-block text-wine">
                  {t.hero.titleAccent}
                  {/* Рукописный росчерк под акцентом — «рисуется» при загрузке */}
                  <svg className="draw pointer-events-none absolute -bottom-2 left-0 h-3 w-full sm:-bottom-3 sm:h-4" viewBox="0 0 300 16" preserveAspectRatio="none" aria-hidden>
                    <path d="M3 11 C 60 3, 120 3, 170 8 S 260 14, 297 5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ "--len": 320, "--d": 700 } as React.CSSProperties} />
                  </svg>
                </em>
              </h1>
              <p style={{ "--i": 2 } as React.CSSProperties} className="enter mt-6 max-w-xl text-lg leading-relaxed text-ink-soft sm:text-xl">
                {t.hero.lead}
              </p>
              <div style={{ "--i": 3 } as React.CSSProperties} className="enter mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href={cta} className="btn btn-primary btn-lg">
                  {t.hero.cta} <ArrowRight className="size-5" />
                </Link>
                <a href="#inside" className="btn btn-outline btn-lg">
                  {t.hero.sample}
                </a>
              </div>
              <ul style={{ "--i": 4 } as React.CSSProperties} className="enter mt-9 grid max-w-lg grid-cols-1 gap-2.5 text-[15px] text-ink-soft sm:grid-cols-2">
                {t.hero.bullets.map((b) => (
                  <li key={b} className="flex items-center gap-2">
                    <Check className="size-4 shrink-0 text-wine" /> {b}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative mx-auto h-[420px] w-full max-w-[520px] sm:h-[520px]">
              <div style={{ "--i": 3 } as React.CSSProperties} className="enter absolute top-6 left-[2%] w-[44%]">
                <div className="animate-float [--r:-8deg] [animation-delay:-2s]">
                  <Book3D template="midnight" title={t.hero.books.dad.title} names={t.hero.books.dad.names} rotate={18} className="drop-shadow-xl" />
                </div>
              </div>
              <div style={{ "--i": 4 } as React.CSSProperties} className="enter absolute top-0 right-[4%] w-[40%]">
                <div className="animate-float [--r:7deg] [animation-delay:-4s]">
                  <Book3D template="sage" title={t.hero.books.mom.title} names={t.hero.books.mom.names} rotate={-18} />
                </div>
              </div>
              <div style={{ "--i": 5 } as React.CSSProperties} className="enter absolute bottom-0 left-1/2 w-[54%] -translate-x-1/2">
                <div className="animate-float">
                  <Book3D template="blossom" title={t.hero.books.love.title} subtitle={t.hero.books.love.subtitle} names={t.hero.books.love.names} rotate={-14} />
                </div>
              </div>
              {/* Рукописная пометка со стрелкой */}
              <div style={{ "--i": 7 } as React.CSSProperties} className="enter pointer-events-none absolute bottom-[18%] -left-4 hidden items-end gap-1 text-wine lg:flex">
                <span className="-rotate-6 font-hand text-2xl leading-none">{t.hero.note}</span>
                <svg className="draw mb-1 h-10 w-16" viewBox="0 0 64 40" fill="none" aria-hidden>
                  <path d="M2 30 C 18 38, 40 34, 58 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ "--len": 80, "--d": 900 } as React.CSSProperties} />
                  <path d="M49 12 L 59 11 L 57 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ "--len": 30, "--d": 1300 } as React.CSSProperties} />
                </svg>
              </div>
            </div>
          </div>
        </section>

        {/* ─── OCCASIONS ─── */}
        <section className="border-y border-line/70 bg-white/60 py-5">
          <div className="no-scrollbar container-x flex gap-3 overflow-x-auto">
            <span className="shrink-0 py-1.5 text-sm text-muted">{t.occasions.label}</span>
            {t.occasions.items.map((o) => (
              <span key={o} className="shrink-0 rounded-full border border-line bg-paper px-4 py-1.5 text-sm text-ink-soft">
                {o}
              </span>
            ))}
          </div>
        </section>

        {/* ─── HOW ─── */}
        <section id="how" className="scroll-mt-20 py-20 sm:py-28">
          <div className="container-x">
            <div className="reveal max-w-2xl">
              <div className="eyebrow">{t.how.eyebrow}</div>
              <h2 className="mt-3 font-serif text-4xl font-medium tracking-tight sm:text-5xl">{t.how.title}</h2>
            </div>
            <div className="reveal-stagger mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {t.how.steps(loveCount).map((step, i) => ({ ...step, icon: [BookHeart, PenLine, Camera, Truck][i] })).map((s, i) => (
                <div key={s.title} className="card relative p-7">
                  <div className="flex items-center justify-between">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-rose text-wine">
                      <s.icon className="size-6" />
                    </div>
                    <span className="font-serif text-5xl text-line">{i + 1}</span>
                  </div>
                  <h3 className="mt-6 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── INSIDE ─── */}
        <section id="inside" className="scroll-mt-20 bg-ink py-20 text-paper sm:py-28">
          <div className="container-x grid items-center gap-14 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="reveal">
              <div className="eyebrow text-[#e3a6ae]">{t.inside.eyebrow}</div>
              <h2 className="mt-3 font-serif text-4xl font-medium tracking-tight sm:text-5xl">{t.inside.title}</h2>
              <p className="mt-5 text-lg leading-relaxed text-paper/70">
                {t.inside.text}
              </p>
              <ul className="mt-8 space-y-4">
                {t.inside.bullets.map((b) => (
                  <li key={b} className="flex gap-3 text-paper/85">
                    <Check className="mt-0.5 size-5 shrink-0 text-[#e3a6ae]" /> {b}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <SampleBook />
              <p className="mt-3 text-center text-xs text-paper/40"><span className="hidden md:inline">{t.inside.hintDesktop}</span><span className="md:hidden">{t.inside.hintMobile}</span></p>
            </div>
          </div>
        </section>

        {/* ─── THEMES ─── */}
        <section className="py-20 sm:py-28">
          <div className="container-x">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div className="max-w-2xl">
                <div className="eyebrow">{t.themes.eyebrow}</div>
                <h2 className="mt-3 font-serif text-4xl font-medium tracking-tight sm:text-5xl">{t.themes.title}</h2>
              </div>
              <p className="max-w-sm text-muted">{t.themes.note}</p>
            </div>
            <div className="reveal-stagger mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {themes.map((th) => {
                const qn = countQuestions(th);
                return (
                  <Link key={th.id} href={user ? `/books/new?theme=${th.id}` : `/register?theme=${th.id}`} className="group card flex flex-col overflow-hidden transition hover:-translate-y-1 hover:shadow-lift">
                    <div className="flex justify-center bg-cream/60 px-10 pt-8 pb-0">
                      <div className="w-[62%] translate-y-4 transition duration-500 group-hover:translate-y-1">
                        <CoverPreview template={th.defaultCover} title={th.titleSuggestions[0]} names={t.coverSamples[th.defaultCover]?.names} lite className="rounded-sm shadow-book" />
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col p-6">
                      <h3 className="text-lg font-semibold">{th.name}</h3>
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{th.description}</p>
                      <div className="mt-5 flex items-center justify-between text-sm">
                        <span className="text-muted">
                          {t.themes.meta(qn, th.chapters.length)}
                        </span>
                        <ArrowRight className="size-4 text-wine transition group-hover:translate-x-1" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── COVERS ─── */}
        <section id="covers" className="scroll-mt-20 bg-cream/60 py-20 sm:py-28">
          <div className="container-x">
            <div className="reveal mx-auto max-w-2xl text-center">
              <div className="eyebrow">{t.covers.eyebrow}</div>
              <h2 className="mt-3 font-serif text-4xl font-medium tracking-tight sm:text-5xl">{t.covers.title(coverTemplates.filter((c) => !c.requiresPhoto).length)}</h2>
              <p className="mt-4 text-muted">{t.covers.text}</p>
            </div>
            <div className="reveal-stagger mt-14 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
              {coverTemplates
                .filter((c) => !c.requiresPhoto)
                .map((c) => {
                  const s = t.coverSamples[c.id];
                  return (
                    <div key={c.id} className="group">
                      <div className="transition duration-500 group-hover:-translate-y-2">
                        <CoverPreview template={c.id} title={s.title} names={s.names} className="rounded-[3px] shadow-book" />
                      </div>
                      <div className="mt-3 text-center text-sm text-muted">{coverName(c.id, locale)}</div>
                    </div>
                  );
                })}
            </div>
          </div>
        </section>

        {/* ─── FEATURES ─── */}
        <section className="py-20 sm:py-28">
          <div className="container-x">
            <div className="max-w-2xl">
              <div className="eyebrow">{t.features.eyebrow(site.name)}</div>
              <h2 className="mt-3 font-serif text-4xl font-medium tracking-tight sm:text-5xl">{t.features.title}</h2>
            </div>
            <div className="reveal-stagger mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {t.features.items.map((item, i) => ({ ...item, icon: [Save, Eye, WandSparkles, Type, Printer, Gift][i] })).map((f) => (
                <div key={f.title}>
                  <f.icon className="size-7 text-wine" strokeWidth={1.6} />
                  <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── TESTIMONIALS (показываются, только если заполнены в config/site.ts) ─── */}
        {site.testimonials.length ? (
          <section className="bg-rose/40 py-20 sm:py-28">
            <div className="container-x">
              <h2 className="text-center font-serif text-4xl font-medium tracking-tight sm:text-5xl">{t.testimonials.title}</h2>
              <div className="mt-12 grid gap-5 md:grid-cols-3">
                {site.testimonials.map((x) => (
                  <figure key={x.name} className="card p-7">
                    <blockquote className="font-serif text-xl leading-snug">«{x.text}»</blockquote>
                    <figcaption className="mt-5 text-sm text-muted">
                      {x.name}
                      {x.occasion ? ` · ${x.occasion}` : ""}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* ─── PRICING ─── */}
        <section id="pricing" className="scroll-mt-20 bg-cream/60 py-20 sm:py-28">
          <div className="container-x">
            <div className="mx-auto max-w-2xl text-center">
              <div className="eyebrow">{t.pricing.eyebrow}</div>
              <h2 className="mt-3 font-serif text-4xl font-medium tracking-tight sm:text-5xl">{t.pricing.title}</h2>
              <p className="mt-4 text-muted">{t.pricing.text}</p>
            </div>
            <div className="reveal-stagger mt-14 grid gap-5 lg:grid-cols-3">
              {plans.map((p) => ({ ...p, ...m.common.plans[p.id] })).map((p) => (
                <div key={p.id} className={`card relative flex flex-col p-8 ${p.featured ? "border-wine/40 ring-4 ring-wine/10" : ""}`}>
                  {"badge" in p && p.badge ? <span className="absolute -top-3 left-8 rounded-full bg-wine px-3 py-1 text-xs font-medium text-white">{p.badge}</span> : null}
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  <div className="mt-4 font-serif text-5xl font-medium [font-variant-numeric:lining-nums]">{formatPrice(p.price)}</div>
                  {p.extraCopyPrice ? <div className="mt-1 text-sm text-muted">{t.pricing.extraCopy(formatPrice(p.extraCopyPrice))}</div> : <div className="mt-1 text-sm text-muted">{t.pricing.instant}</div>}
                  <ul className="mt-7 flex-1 space-y-3">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2.5 text-[15px] text-ink-soft">
                        <Check className="mt-0.5 size-4 shrink-0 text-wine" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Link href={cta} className={`btn mt-8 ${p.featured ? "btn-primary" : "btn-outline"}`}>
                    {t.pricing.start}
                  </Link>
                </div>
              ))}
            </div>
            <TrustList className="reveal-stagger mx-auto mt-16 max-w-5xl" />
          </div>
        </section>

        {/* ─── GIFT CARD ─── */}
        <section className="py-20 sm:py-28">
          <div className="reveal container-x grid items-center gap-12 lg:grid-cols-2">
            <div className="order-2 lg:order-1">
              <GiftCardVisual locale={locale} plan="hardcover" recipientName={t.gift.card.recipient} buyerName={t.gift.card.buyer} message={t.gift.card.message} className="rotate-[-2deg]" />
            </div>
            <div className="order-1 lg:order-2">
              <div className="eyebrow">{t.gift.eyebrow}</div>
              <h2 className="mt-3 font-serif text-4xl font-medium tracking-tight sm:text-5xl">{t.gift.title}</h2>
              <p className="mt-5 text-lg leading-relaxed text-ink-soft">
                {t.gift.text}
              </p>
              <Link href="/gift" className="btn btn-primary btn-lg mt-8">
                <Gift className="size-5" /> {t.gift.cta}
              </Link>
            </div>
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section id="faq" className="scroll-mt-20 py-20 sm:py-28">
          <div className="container-x grid gap-12 lg:grid-cols-[1fr_1.6fr]">
            <div>
              <div className="eyebrow">{t.faq.eyebrow}</div>
              <h2 className="mt-3 font-serif text-4xl font-medium tracking-tight sm:text-5xl">{t.faq.title}</h2>
              <p className="mt-4 text-muted">
                {t.faq.notFound}{" "}
                <a href={site.contacts.whatsapp} className="text-wine underline underline-offset-4" target="_blank" rel="noopener noreferrer">
                  {t.faq.writeUs}
                </a>{" "}
                {t.faq.reply}
              </p>
            </div>
            <Faq className="reveal" items={faq} />
          </div>
        </section>

        {/* ─── CTA ─── */}
        <section className="pb-20 sm:pb-28">
          <div className="container-x">
            <div className="relative overflow-hidden rounded-[32px] bg-wine px-6 py-16 text-center text-white sm:px-16 sm:py-20">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_20%_0%,rgba(255,255,255,.18),transparent),radial-gradient(40%_60%_at_100%_100%,rgba(0,0,0,.25),transparent)]" />
              <h2 className="reveal relative mx-auto max-w-3xl font-serif text-4xl leading-tight font-medium sm:text-6xl">{t.cta.title}</h2>
              <p className="relative mx-auto mt-5 max-w-xl text-lg text-white/80">{t.cta.text}</p>
              <Link href={cta} className="btn btn-lg relative mt-9 bg-white text-wine hover:bg-paper">
                {t.cta.button} <ArrowRight className="size-5" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
