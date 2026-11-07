import type { Metadata } from "next";
import Image from "next/image";
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
import { FilmFrame, Flourish, frameGhostBtn } from "@/components/landing/FilmFrame";
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
        {/* ─── ПЕРВЫЙ ЭКРАН: «кадр» пары и сама книга; одно действие — WhatsApp ─── */}
        <div className="relative">
          <div className="container-x absolute inset-x-0 top-0 z-20 flex h-16 items-center justify-between sm:h-18">
            <Logo className="text-white" />
            <LanguageSwitch tone="dark" />
          </div>
          <FilmFrame
            photo="couple"
            position="62% 30%"
            mobilePosition="44% 30%"
            priority
            aside={
              <div className="enter relative w-[260px] rotate-[3deg] xl:w-[290px]" style={{ "--i": 2 } as React.CSSProperties}>
                <div className="relative aspect-[1080/1250] overflow-hidden rounded-[6px] shadow-[0_40px_80px_-30px_rgb(0_0_0/0.7)]">
                  <Image src="/lp/book-velvet.webp" alt={c.hero.titleStart + " " + c.hero.titleAccent} fill priority sizes="290px" className="origin-[46%_42%] scale-[1.13] object-cover object-top" />
                </div>
                <span className="absolute -bottom-9 left-2 rotate-[-4deg] font-hand text-2xl text-white/90" aria-hidden>
                  {c.hero.note}
                </span>
              </div>
            }
          >
            <p className="enter text-sm text-white/75" style={{ "--i": 0 } as React.CSSProperties}>
              {c.hero.eyebrow}
            </p>
            <h1 className="mt-3 max-w-[15ch] font-serif text-[44px] leading-[1.02] font-medium tracking-[-0.01em] text-balance text-white sm:text-6xl lg:text-[76px]">
              {c.hero.titleStart} <span className="font-normal italic">{c.hero.titleAccent}</span>
            </h1>
            <Flourish className="mt-3 text-[rgb(255_255_255/0.6)]" />
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-white/85 sm:text-lg">{c.hero.lead}</p>
            <div id="hero-cta" className="enter mt-7 flex flex-col gap-3 sm:flex-row" style={{ "--i": 2 } as React.CSSProperties}>
              <TrackedLink href={wa} goal="contact" place="hero" className="btn btn-primary btn-lg h-14 text-[16px]">
                <WhatsAppIcon className="size-5" /> {c.hero.cta}
              </TrackedLink>
              <TrackedLink href={start} goal="lead" place="hero" className={`${frameGhostBtn} h-14 text-[16px]`}>
                {c.hero.cta2}
              </TrackedLink>
            </div>
            <ul className="enter mt-6 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-white/80" style={{ "--i": 3 } as React.CSSProperties}>
              {reviews.summary ? (
                <li>
                  <a href="#reviews" className="inline-flex items-center gap-1.5 hover:text-white">
                    <Stars value={reviews.summary.average} className="size-3.5" />
                    <b className="font-semibold tabular-nums">{reviews.summary.average.toFixed(1).replace(".", ",")}</b>
                  </a>
                </li>
              ) : null}
              {c.hero.facts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </FilmFrame>
        </div>

        {/* ─── ВОПРОСЫ БЕГУЩЕЙ СТРОКОЙ ─── */}
        <section className="overflow-hidden bg-spine py-10 text-paper sm:py-14" aria-label={c.questionsLabel(countQuestions(theme))}>
          <div className="container-x text-sm text-paper/70">{c.questionsLabel(countQuestions(theme))}</div>
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
                            <h2 className="font-serif text-[40px] leading-[1.02] font-medium tracking-tight sm:text-5xl">{c.try.title}</h2>
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
                {c.try.cta}
              </TrackedLink>
            </div>
          </div>
        </section>

        {/* ─── КНИГА-ПРИМЕР ─── */}
        <section className="below-fold bg-ink py-20 text-paper sm:py-28">
          <div className="container-x grid items-center gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <h2 className=" font-serif text-[40px] leading-[1.02] font-medium tracking-tight sm:text-5xl">{c.inside.title}</h2>
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
              <div className="relative aspect-[1080/1350] overflow-hidden rounded-[6px] shadow-book">
                <Image src="/lp/polaroids.webp" alt="" fill sizes="(min-width: 1024px) 540px, 100vw" className="object-cover" />
              </div>
              <span className="absolute -bottom-5 left-6 rotate-[-4deg] rounded-sm bg-[#fdf6c9] px-4 py-2 font-hand text-2xl text-ink shadow-[0_8px_16px_-8px_rgb(0_0_0/0.35)]" aria-hidden>
                {c.photos.note}
              </span>
            </div>
            <div>
                            <h2 className="font-serif text-[40px] leading-[1.02] font-medium tracking-tight sm:text-5xl">{c.photos.title}</h2>
              <p className="mt-5 text-[17px] leading-relaxed text-ink-soft">{c.photos.text}</p>
            </div>
          </div>
        </section>

        {/* ─── КАК ЭТО ПРОИСХОДИТ ─── */}
        <section className="below-fold border-y border-line bg-cream/60 py-20 sm:py-28">
          <div className="container-x">
                        <h2 className="max-w-2xl font-serif text-[40px] leading-[1.02] font-medium tracking-tight sm:text-5xl">{c.how.title}</h2>
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
                      {c.price.deadlineCta}
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

        {/* ─── ФИНАЛ: второй кадр ─── */}
        <FilmFrame id="final" photo="sunsetwalk" position="50% 55%" size="band">
          <h2 className="max-w-2xl font-serif text-[44px] leading-[1] font-medium tracking-tight text-balance text-white sm:text-6xl">{c.final.title}</h2>
          <Flourish className="mt-3 text-[rgb(255_255_255/0.55)]" />
          <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-white/85">{c.final.text}</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <TrackedLink href={wa} goal="contact" place="final" className="btn btn-lg h-14 bg-[#25d366] text-[16px] font-semibold text-[#0b2e17] hover:bg-[#2be070]">
              <WhatsAppIcon className="size-5" /> {c.final.cta}
            </TrackedLink>
            <TrackedLink href={start} goal="lead" place="final" className={`${frameGhostBtn} h-14 text-[16px]`}>
              {c.final.cta2}
            </TrackedLink>
          </div>
        </FilmFrame>
      </main>

      {/* Подвал без навигации: только то, что требует закон и правила рекламы Meta. */}
      <footer className="bg-spine pt-8 pb-28 text-xs text-[rgb(255_255_255/0.55)] md:pb-8">
        <div className="container-x flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {new Date().getFullYear()} {site.company.legalName}. {m.common.footer.bin} {site.company.bin}
          </span>
          <span className="flex gap-5">
            <Link href="/offer" className="hover:text-white">{m.common.footer.offer}</Link>
            <Link href="/privacy" className="hover:text-white">{m.common.footer.privacy}</Link>
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
