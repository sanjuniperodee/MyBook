import type { Metadata } from "next";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/client";
import { Logo } from "@/components/Logo";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { SampleBook } from "@/components/landing/SampleBook";
import { Reviews, Stars } from "@/components/landing/Reviews";
import { Faq } from "@/components/Faq";
import { TrackedLink } from "@/components/ad/TrackedLink";
import { TryPage } from "@/components/ad/TryPage";
import { StickyBar } from "@/components/ad/StickyBar";
import { WhatsAppIcon } from "@/components/ad/WhatsAppIcon";
import { adLoveCopy } from "@/lib/content/ad-love";
import { applyGender } from "@/lib/content/gender";
import { chapterTitle, countQuestions, getTheme } from "@/lib/content/themes";
import { getCurrentUser } from "@/server/auth";
import { siteReviews } from "@/server/reviews";
import { container } from "@/server/container";
import { isValidSlug, whatsappLink } from "@/modules/marketing/domain/links";
import { formatPrice, getVisiblePlans, productionDays, registrationOpen, site } from "@/config/site";
import { getLocale, getMessages } from "@/i18n/server";
import { socialMeta } from "@/lib/seo";

/*
 * Посадочная под таргет в Instagram: одна история (книга о паре), одно действие (WhatsApp, где отвечает
 * продажник), всё важное — на первом экране телефона. Без меню и ссылок «уйти»: человек пришёл из рекламы,
 * отвлекать его нечем. В поиск не отдаём — для поиска есть /kniga/podarok-lyubimomu.
 */

const THEME = "love";
/** Код ссылки по умолчанию — если реклама ведёт прямо на /love, без короткой ссылки /go/…. */
const DEFAULT_CODE = "ig-love";
/** Вопросы для бегущей строки: глава и номер вопроса в ней — по одному из разных частей книги. */
const MARQUEE: [string, number][] = [
  ["meet", 1], ["date", 7], ["love", 0], ["you", 0], ["tender", 0], ["everyday", 0],
  ["travel", 0], ["hard", 0], ["fun", 0], ["whatif", 0], ["dreams", 0], ["thanks", 0],
];

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const c = adLoveCopy(locale);
  return {
    title: { absolute: `${c.metaTitle} · ${site.name}` },
    description: c.metaDescription,
    robots: { index: false, follow: false },
    ...socialMeta({ path: "/love", locale, title: c.metaTitle, description: c.metaDescription }),
  };
}

export default async function LoveAdPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, user, locale, m, reviews, waNumber] = await Promise.all([
    searchParams,
    getCurrentUser(),
    getLocale(),
    getMessages(),
    siteReviews(6, THEME),
    container().marketing.service.shopWhatsapp().catch(() => site.contacts.whatsapp.replace(/\D/g, "")),
  ]);
  const c = adLoveCopy(locale);

  // Код короткой ссылки (/go/<код> дописывает lnk) уходит в первое сообщение — CRM по нему видит источник заявки.
  const lnk = typeof sp.lnk === "string" && isValidSlug(sp.lnk) ? sp.lnk.toLowerCase() : DEFAULT_CODE;
  const wa = whatsappLink(waNumber, c.waText, lnk);
  const start = user ? `/books/new?theme=${THEME}` : registrationOpen() ? `/register?theme=${THEME}` : "/login";

  const theme = getTheme(THEME, locale);
  const g = (s: string) => applyGender(s, "f", "m");
  const questions = MARQUEE.map(([key, i]) => theme.chapters.find((ch) => ch.key === key)?.questions[i]?.[0])
    .filter((q): q is string => !!q)
    .map(g);
  const half = Math.ceil(questions.length / 2);
  const rows = [questions.slice(0, half), questions.slice(half)];

  // Вопрос для «попробуйте»: первый поцелуй из главы о первом свидании.
  const dateIndex = theme.chapters.findIndex((ch) => ch.key === "date");
  const kiss = theme.chapters[dateIndex]?.questions[7];

  const plans = [...getVisiblePlans()].sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
  const minPrice = formatPrice(Math.min(...plans.map((p) => p.price)));
  const faq: [string, string][] = [...pickFaq(m.landing.faq.items(productionDays)), c.faqExtra];

  return (
    <>
      <main className="overflow-x-clip bg-paper">
        {/* ─── ПЕРВЫЙ ЭКРАН ─── */}
        <section className="relative lg:pt-6 lg:pb-20">
          <div className="container-x absolute inset-x-0 top-0 z-20 flex h-16 items-center justify-between lg:static lg:mb-6">
            <Logo />
            <LanguageSwitch />
          </div>

          <div className="lg:mx-auto lg:grid lg:max-w-6xl lg:px-6 lg:grid-cols-[1fr_0.92fr] lg:items-center lg:gap-16">
            {/* Фото: на телефоне — во всю ширину, текст наплывает снизу */}
            <div className="relative lg:order-2">
              <div className="relative aspect-[1080/1250] w-full overflow-hidden lg:rotate-[1.2deg] lg:rounded-[28px] lg:shadow-[0_40px_80px_-40px_rgb(60_20_25/0.55)]">
                <Image
                  src="/lp/book-velvet.webp"
                  alt={c.hero.titleStart + " " + c.hero.titleAccent}
                  fill
                  priority
                  sizes="(min-width: 1024px) 520px, 100vw"
                  className="object-cover object-top"
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-paper via-paper/70 to-transparent lg:hidden" />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-paper/80 to-transparent lg:hidden" />
              </div>
              {/* Рукописная пометка к именам на обложке */}
              <div className="pointer-events-none absolute top-[9.5%] right-[5%] flex lg:top-[3%] lg:right-[2%] flex-col items-end text-paper" aria-hidden>
                <span className="enter rotate-[-5deg] font-hand text-[26px] leading-none drop-shadow-[0_1px_6px_rgb(0_0_0/0.45)] sm:text-3xl" style={{ "--i": 4 } as React.CSSProperties}>
                  {c.hero.note}
                </span>
                <svg className="draw mr-[16%] -mt-0.5 h-14 w-20 drop-shadow-[0_1px_4px_rgb(0_0_0/0.4)]" viewBox="0 0 80 56" fill="none">
                  <path d="M66 4 C 70 24, 52 42, 20 46" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ "--len": 90, "--d": 900 } as React.CSSProperties} />
                  <path d="M29 38 L 19 46 L 30 52" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ "--len": 30, "--d": 1350 } as React.CSSProperties} />
                </svg>
              </div>
            </div>

            <div className="container-x relative z-10 -mt-24 lg:order-1 lg:mt-0 lg:px-0">
              <div className="enter text-[11px] font-semibold tracking-[0.24em] text-wine uppercase" style={{ "--i": 0 } as React.CSSProperties}>
                {c.hero.eyebrow}
              </div>
              <h1 className="enter mt-3 font-serif text-[44px] leading-[0.98] font-medium tracking-[-0.01em] text-ink sm:text-6xl lg:text-[76px]" style={{ "--i": 1 } as React.CSSProperties}>
                {c.hero.titleStart} <em className="text-wine">{c.hero.titleAccent}</em>
              </h1>
              <p className="enter mt-5 max-w-xl text-[17px] leading-relaxed text-ink-soft sm:text-lg" style={{ "--i": 2 } as React.CSSProperties}>
                {c.hero.lead}
              </p>
              <div id="hero-cta" className="enter mt-7 flex flex-col gap-3 sm:flex-row" style={{ "--i": 3 } as React.CSSProperties}>
                <TrackedLink href={wa} goal="contact" place="hero" className="btn btn-primary btn-lg h-14 text-[16px]">
                  <WhatsAppIcon className="size-5" /> {c.hero.cta}
                </TrackedLink>
                <TrackedLink href={start} goal="lead" place="hero" className="btn btn-outline btn-lg h-14 text-[16px]">
                  {c.hero.cta2}
                </TrackedLink>
              </div>
              <div className="enter mt-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted" style={{ "--i": 4 } as React.CSSProperties}>
                {reviews.summary ? (
                  <a href="#reviews" className="inline-flex items-center gap-1.5 text-ink-soft">
                    <Stars value={reviews.summary.average} className="size-3.5" />
                    <b className="font-semibold tabular-nums">{reviews.summary.average.toFixed(1).replace(".", ",")}</b>
                  </a>
                ) : null}
                {c.hero.facts.map((f, i) => (
                  <span key={f} className="inline-flex items-center gap-3">
                    {i > 0 || reviews.summary ? <span className="size-1 rounded-full bg-line" aria-hidden /> : null}
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ─── ВОПРОСЫ БЕГУЩЕЙ СТРОКОЙ ─── */}
        <section className="mt-14 overflow-hidden bg-[#2a0d12] py-10 text-paper lg:mt-0 sm:py-14" aria-label={c.questionsLabel(countQuestions(theme))}>
          <div className="container-x text-[11px] font-semibold tracking-[0.24em] text-[#e3a6ae] uppercase">{c.questionsLabel(countQuestions(theme))}</div>
          <div className="mt-6 space-y-4 sm:space-y-6">
            {rows.map((row, r) => (
              <div key={r} className="flex w-max">
                <div className={r ? "marquee marquee-reverse flex shrink-0" : "marquee flex shrink-0"} style={{ "--marquee-s": `${row.length * 11}s` } as React.CSSProperties}>
                  {[...row, ...row].map((q, i) => (
                    <span key={i} className="flex shrink-0 items-center font-serif text-[22px] whitespace-nowrap text-paper/90 italic sm:text-[30px]" aria-hidden={i >= row.length}>
                      {q}
                      <span className="mx-7 size-1.5 rotate-45 bg-gold/80 sm:mx-10" aria-hidden />
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── ПОПРОБУЙТЕ ─── */}
        <section className="below-fold py-20 sm:py-28">
          <div className="container-x">
            <div className="max-w-2xl">
              <div className="eyebrow">{c.try.eyebrow}</div>
              <h2 className="mt-3 font-serif text-[40px] leading-[1.02] font-medium tracking-tight sm:text-5xl">{c.try.title}</h2>
              <p className="mt-4 text-[17px] leading-relaxed text-ink-soft">{c.try.lead}</p>
            </div>
            <div className="mt-14">
              {kiss ? (
                <TryPage
                  chapter={c.try.chapterLabel(dateIndex + 1, chapterTitle(theme, "date", locale))}
                  heading={g(kiss[1])}
                  question={g(kiss[0])}
                  sample={c.try.sample}
                  placeholder={c.try.placeholder}
                  hint={c.try.hint}
                  yours={c.try.yours}
                  folio={47}
                  lang={locale}
                />
              ) : null}
            </div>
            <div className="mt-12 flex justify-center lg:justify-start">
              <TrackedLink href={start} goal="lead" place="try" className="btn btn-dark btn-lg h-14 px-7 text-[16px]">
                {c.try.cta} <ArrowRight className="size-5" />
              </TrackedLink>
            </div>
          </div>
        </section>

        {/* ─── КНИГА-ПРИМЕР ─── */}
        <section className="below-fold bg-ink py-20 text-paper sm:py-28">
          <div className="container-x grid items-center gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <div className="eyebrow text-[#e3a6ae]">{c.inside.eyebrow}</div>
              <h2 className="mt-3 font-serif text-[40px] leading-[1.02] font-medium tracking-tight sm:text-5xl">{c.inside.title}</h2>
              <p className="mt-5 text-[17px] leading-relaxed text-paper/70">{c.inside.text}</p>
            </div>
            <div>
              <SampleBook />
              <p className="mt-3 text-center text-xs text-paper/40">
                <span className="hidden md:inline">{m.landing.inside.hintDesktop}</span>
                <span className="md:hidden">{m.landing.inside.hintMobile}</span>
              </p>
            </div>
          </div>
        </section>

        {/* ─── ФОТО ─── */}
        <section className="below-fold py-20 sm:py-28">
          <div className="container-x grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
            <div className="relative">
              <div className="relative aspect-[1080/1350] overflow-hidden rounded-[24px]">
                <Image src="/lp/polaroids.webp" alt="" fill sizes="(min-width: 1024px) 540px, 100vw" className="object-cover" />
              </div>
              <span className="absolute -bottom-5 left-6 rotate-[-4deg] rounded-sm bg-[#fdf6c9] px-4 py-2 font-hand text-2xl text-ink shadow-[0_8px_16px_-8px_rgb(0_0_0/0.35)]" aria-hidden>
                {c.photos.note}
              </span>
            </div>
            <div>
              <div className="eyebrow">{c.photos.eyebrow}</div>
              <h2 className="mt-3 font-serif text-[40px] leading-[1.02] font-medium tracking-tight sm:text-5xl">{c.photos.title}</h2>
              <p className="mt-5 text-[17px] leading-relaxed text-ink-soft">{c.photos.text}</p>
            </div>
          </div>
        </section>

        {/* ─── КАК ЭТО ПРОИСХОДИТ ─── */}
        <section className="below-fold border-y border-line bg-cream/60 py-20 sm:py-28">
          <div className="container-x">
            <div className="eyebrow">{c.how.eyebrow}</div>
            <h2 className="mt-3 max-w-2xl font-serif text-[40px] leading-[1.02] font-medium tracking-tight sm:text-5xl">{c.how.title}</h2>
            <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
              {c.how.steps.map((s, i) => (
                <li key={s.title} className="border-t border-ink/15 pt-5">
                  <div className="flex items-baseline gap-4">
                    <span className="font-serif text-[56px] leading-none text-wine/90 tabular-nums italic">{String(i + 1).padStart(2, "0")}</span>
                    <h3 className="font-serif text-[28px] font-medium">{s.title}</h3>
                  </div>
                  <p className="mt-4 leading-relaxed text-ink-soft">{s.text}</p>
                </li>
              ))}
            </ol>
            <p className="mt-12 font-serif text-2xl text-ink italic">{c.how.secret}</p>
          </div>
        </section>

        {/* ─── ЦЕНА: экслибрис ─── */}
        <section className="below-fold py-20 sm:py-28">
          <div className="container-x">
            <div className="mx-auto max-w-xl rounded-[6px] bg-[#fbf8f2] p-2 shadow-[0_30px_60px_-36px_rgb(60_30_20/0.45)]">
              <div className="rounded-[3px] border border-wine/25 p-1.5">
                <div className="rounded-[2px] border border-wine/60 px-6 py-10 text-center sm:px-12">
                  <div className="eyebrow">{c.price.eyebrow}</div>
                  <h2 className="mt-2 font-serif text-4xl font-medium">{c.price.title}</h2>
                  <div className="mt-8 divide-y divide-dashed divide-wine/25 text-left">
                    {plans.map((p) => (
                      <div key={p.id} className="py-5">
                        <div className="flex items-baseline justify-between gap-4">
                          <div className="font-semibold">{m.common.plans[p.id].name}</div>
                          <div className="shrink-0 font-serif text-[30px] leading-none text-wine tabular-nums">{formatPrice(p.price)}</div>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-muted">{m.common.plans[p.id].features.slice(0, 3).join(" · ")}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-left text-sm text-muted">{c.price.delivery}</p>
                  <div className="mt-8 rounded-xl bg-rose/60 px-5 py-4 text-left">
                    <div className="font-serif text-xl">{c.price.deadline}</div>
                    <TrackedLink href={wa} goal="contact" place="deadline" className="mt-1 inline-flex items-center gap-1.5 text-[15px] font-medium text-wine underline decoration-wine/30 underline-offset-4">
                      {c.price.deadlineCta} <ArrowRight className="size-4" />
                    </TrackedLink>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Reviews reviews={reviews.reviews} summary={reviews.summary} t={m.review.showcase} className="below-fold" />

        {/* ─── ВОПРОСЫ ─── */}
        <section className="below-fold py-20 sm:py-24">
          <div className="container-x grid gap-10 lg:grid-cols-[1fr_1.4fr]">
            <h2 className="font-serif text-[40px] leading-[1.02] font-medium sm:text-5xl">{c.faqTitle}</h2>
            <Faq items={faq} size="md" />
          </div>
        </section>

        {/* ─── ФИНАЛ ─── */}
        <section id="final" className="relative overflow-hidden bg-[#2a0d12] py-20 text-paper sm:py-28">
          <div className="pointer-events-none absolute -top-10 -right-24 w-[300px] rotate-[14deg] opacity-30 sm:w-[420px] sm:opacity-40" aria-hidden>
            <Image src="/lp/book-velvet.webp" alt="" width={420} height={607} className="rounded-md" />
          </div>
          <div className="container-x relative">
            <h2 className="max-w-2xl font-serif text-[44px] leading-[1] font-medium tracking-tight sm:text-6xl">{c.final.title}</h2>
            <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-paper/75">{c.final.text}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <TrackedLink href={wa} goal="contact" place="final" className="btn btn-lg h-14 bg-[#25d366] text-[16px] font-semibold text-[#0b2e17] hover:bg-[#2be070]">
                <WhatsAppIcon className="size-5" /> {c.final.cta}
              </TrackedLink>
              <TrackedLink href={start} goal="lead" place="final" className="btn btn-lg h-14 border border-white/25 text-[16px] text-paper hover:bg-white/10">
                {c.final.cta2} <ArrowRight className="size-5" />
              </TrackedLink>
            </div>
          </div>
        </section>
      </main>

      {/* Подвал без навигации: только то, что требует закон и правила рекламы Meta. */}
      <footer className="bg-[#1d090c] pt-8 pb-28 text-xs text-paper/45 md:pb-8">
        <div className="container-x flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {new Date().getFullYear()} {site.company.legalName} · {m.common.footer.bin} {site.company.bin}
          </span>
          <span className="flex gap-5">
            <Link href="/offer" className="hover:text-paper">{m.common.footer.offer}</Link>
            <Link href="/privacy" className="hover:text-paper">{m.common.footer.privacy}</Link>
          </span>
        </div>
      </footer>

      <StickyBar href={wa} price={c.sticky.from(minPrice)} cta={c.sticky.cta} />
    </>
  );
}

/** Возражения, которые мешают купить: «не умею писать», «долго», язык, качество, приватность — по порядку в общем FAQ. */
function pickFaq(items: [string, string][]) {
  return [items[1], items[0], items[5], items[7], items[9]].filter(Boolean);
}
