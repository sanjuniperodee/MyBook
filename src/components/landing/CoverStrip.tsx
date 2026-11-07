import { CoverPreview } from "@/components/cover/CoverPreview";
import { StripScroller } from "@/components/landing/StripScroller";
import { Head } from "@/components/landing/Head";
import { coverTemplates } from "@/lib/book/covers";
import { coverName } from "@/i18n/labels";
import { getLocale, getMessages } from "@/i18n/server";
import { cn } from "@/lib/class-names";

/** Обложки для ленты: снимки и рисунки вперемешку — видно, что выбор широкий. */
const COVER_ROW = ["peony", "milkyway", "flax", "roses", "alatau", "lavender", "oyu", "mist", "sakura", "leather", "surf", "constellation"];
/** Ширины обложек в ленте по кругу: корешки разной высоты, нижний край общий — как книги на полке. */
const WIDTHS = ["w-[148px] sm:w-[176px]", "w-[176px] sm:w-[212px]", "w-[136px] sm:w-[160px]", "w-[164px] sm:w-[196px]", "w-[184px] sm:w-[224px]", "w-[144px] sm:w-[168px]"];

/** «Как выглядит»: полка обложек на всю ширину экрана. Страницы внутри — в блоке «Примерьте оформление» следом. */
export async function CoverStrip({ className }: { className?: string }) {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const t = m.landing;
  const covers = COVER_ROW.map((id) => coverTemplates.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c && !c.requiresPhoto);
  return (
    <section id="covers" className={cn("below-fold scroll-mt-16 border-t border-line pt-20 pb-14 sm:pt-28 sm:pb-20", className)}>
      <div className="container-x">
        <Head title={t.covers.title(coverTemplates.filter((c) => !c.requiresPhoto).length, coverTemplates.filter((c) => c.requiresPhoto).length)} note={t.covers.text} />
      </div>
      <StripScroller className="mt-12">
        {covers.map((c, i) => {
          const sample = t.coverSamples[c.id];
          return (
            <li key={c.id} className={cn("shrink-0 snap-start", WIDTHS[i % WIDTHS.length])}>
              <CoverPreview template={c.id} title={sample.title} names={sample.names} lite className="rounded-[3px] shadow-book" />
              <div className="mt-3 text-sm text-muted">{coverName(c.id, locale)}</div>
            </li>
          );
        })}
      </StripScroller>
    </section>
  );
}
