import { Link } from "@/i18n/client";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { countQuestions, getTheme, giftThemes } from "@/lib/content/themes";
import { getLanding, landings, type Landing } from "@/lib/content/landings";
import { getLocale, getMessages } from "@/i18n/server";
import { cn } from "@/lib/class-names";

/**
 * «О ком будет книга» — коллаж, а не сетка: «любимому человеку» крупно слева, остальные обложки разной высоты и с
 * разным сдвигом, будто разложены на столе; внизу — отдельный лист «Не только в подарок» (автобиография и своя книга)
 * и перечень страниц-поводов. Каждая обложка — ссылка: книга сразу начинается с этой темы.
 * Телефон: две колонки со сдвигом (кирпичная кладка), «любимому» — на всю ширину.
 */

/** Положение обложки в коллаже: сетка 12 колонок на широком экране, 4 на планшете, 2 на телефоне. */
const slots: Record<string, { box: string; offset: string; tilt?: string }> = {
  love: { box: "col-span-2 md:row-span-2 lg:col-span-4", offset: "", tilt: "-rotate-[1.2deg]" },
  mom: { box: "lg:col-span-2", offset: "md:mt-10 lg:mt-14", tilt: "rotate-[0.8deg]" },
  dad: { box: "lg:col-span-2", offset: "max-md:mt-10 lg:mt-0", tilt: "-rotate-[0.6deg]" },
  parents: { box: "lg:col-span-2", offset: "md:mt-4 lg:mt-8", tilt: "rotate-[1deg]" },
  family: { box: "lg:col-span-2", offset: "max-md:mt-10 md:mt-14 lg:mt-20", tilt: "-rotate-[0.8deg]" },
  grandma: { box: "lg:col-span-2", offset: "lg:mt-4", tilt: "rotate-[0.6deg]" },
  grandpa: { box: "lg:col-span-2", offset: "max-md:mt-10 lg:mt-16", tilt: "-rotate-[1deg]" },
  child: { box: "lg:col-span-2", offset: "lg:mt-0", tilt: "rotate-[1.2deg]" },
  sibling: { box: "lg:col-span-2", offset: "max-md:mt-10 lg:mt-10", tilt: "-rotate-[0.5deg]" },
  friend: { box: "lg:col-span-2", offset: "lg:mt-2", tilt: "rotate-[0.7deg]" },
  teacher: { box: "max-md:mt-10 lg:col-span-2", offset: "lg:mt-12", tilt: "-rotate-[1deg]" },
};

export async function ThemeCollage({ themeHref, className }: { themeHref: (id: string) => string; className?: string }) {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const t = m.landing;
  const gift = giftThemes(locale);
  const modes = [getTheme("autobiography", locale), getTheme("blank", locale)];
  const names = (id: string, cover: string) => (id === "blank" ? t.modes.blank.names : id === "autobiography" ? t.modes.autobiography.names : t.coverSamples[cover]?.names);

  // Поводы и посадочные страницы — путь и для человека, и для поисковика.
  const links = [
    ...gift.map((th) => landings.find((l) => l.theme === th.id)),
    ...t.occasions.items.map((o) => (o.slug ? getLanding(o.slug) : undefined)),
    getLanding("kniga-o-svoej-zhizni"),
    getLanding("svoya-kniga-s-nulya"),
  ]
    .filter((l): l is Landing => !!l)
    .filter((l, i, all) => all.findIndex((x) => x.slug === l.slug) === i);

  return (
    <section id="themes" className={cn("scroll-mt-20 py-20 sm:py-28", className)}>
      <div className="container-x">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-12">
          <h2 className="max-w-2xl font-serif text-[34px] leading-[1.05] font-medium tracking-tight text-balance sm:text-5xl">{t.themes.title}</h2>
          <div className="max-w-sm md:pb-1.5">
            <p className="leading-relaxed text-muted">{t.themes.note}</p>
            <Link href="/kniga" className="mt-3 inline-flex min-h-8 items-center font-medium text-wine hover:underline">
              {m.common.footer.allIdeas}
            </Link>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-x-4 gap-y-9 sm:mt-16 md:grid-cols-4 md:gap-x-6 md:gap-y-10 lg:grid-cols-12 lg:gap-x-6">
          {gift.map((th) => {
            const s = slots[th.id] ?? { box: "", offset: "" };
            const big = th.id === "love";
            return (
              <Link key={th.id} href={themeHref(th.id)} className={cn("group block", s.box, s.offset)}>
                <div className={cn("transition-transform duration-500 ease-(--ease-out-soft) group-hover:-translate-y-1.5", s.tilt, big ? "max-md:w-[70%]" : "")}>
                  <CoverPreview template={th.defaultCover} title={th.titleSuggestions[0]} names={names(th.id, th.defaultCover)} lite className="rounded-[3px] shadow-book" />
                </div>
                <div className={cn("mt-4", big && "lg:mt-6")}>
                  <div className={cn("leading-snug font-medium text-ink group-hover:text-wine", big ? "font-serif text-[28px] sm:text-[34px]" : "text-[15px]")}>{th.name}</div>
                  <div className="mt-0.5 text-xs leading-snug text-muted sm:text-sm">{t.themes.meta(countQuestions(th), th.chapters.length)}</div>
                </div>
              </Link>
            );
          })}

          {/* Не только в подарок: отдельный лист рядом с последними обложками */}
          <div className="col-span-2 mt-4 grid gap-8 rounded-(--r-sheet) bg-cream p-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-9 md:col-span-2 md:mt-0 md:grid-cols-1 md:items-start md:p-6 lg:col-span-8 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:p-9">
            <div>
              <h3 className="font-serif text-[28px] leading-[1.1] font-medium text-balance sm:text-[32px]">{t.modes.title}</h3>
              <p className="mt-3 max-w-md leading-relaxed text-ink-soft">{t.modes.note}</p>
            </div>
            <ul className="flex gap-5 sm:gap-6">
              {modes.map((th, i) => (
                <li key={th.id} className={cn("w-[132px] sm:w-[150px] md:w-[118px] lg:w-[150px]", i === 1 && "mt-6")}>
                  <Link href={themeHref(th.id)} className="group block">
                    <div className="transition-transform duration-500 ease-(--ease-out-soft) group-hover:-translate-y-1.5">
                      <CoverPreview template={th.defaultCover} title={th.titleSuggestions[0]} names={names(th.id, th.defaultCover)} lite className="rounded-[3px] shadow-book" />
                    </div>
                    <div className="mt-3 text-[15px] leading-snug font-medium group-hover:text-wine">{th.name}</div>
                    <div className="mt-0.5 text-xs leading-snug text-muted">{th.id === "blank" ? t.modes.blank.meta : t.modes.autobiography.meta(countQuestions(th))}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <nav aria-label={t.themes.learn} className="mt-14 grid gap-4 border-t border-line pt-6 text-sm sm:mt-20 md:grid-cols-[12rem_minmax(0,1fr)]">
          <span className="text-muted">{t.themes.learn}</span>
          <ul className="flex flex-wrap gap-x-6 gap-y-1">
            {links.map((l) => (
              <li key={l.slug}>
                <Link href={`/kniga/${l.slug}`} className="inline-flex min-h-8 items-center text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-wine hover:decoration-wine">
                  {l.content[locale].label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}
