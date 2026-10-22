"use client";

/**
 * Каталог готовых макетов обложек: крупные живые превью с текстом и фото книги, фильтр по жанрам и поиск по названию.
 * Выбор отдаёт обложку из слоёв (и шаблон-фон, если макет на рисунке шаблона) — дальше её правят в конструкторе.
 */
import { memo, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { coverLayouts, type CoverDesign, type CoverLayout, type CoverTexts, type LayoutGenre } from "@/lib/book/cover-design";
import { getFormat } from "@/lib/book/formats";
import { cn } from "@/lib/class-names";
import { DesignedCover } from "./DesignedCover";

const genres = [...new Set(coverLayouts.map((l) => l.genre))];

const LayoutCard = memo(function LayoutCard({
  layout,
  design,
  format,
  texts,
  name,
  description,
  onPick,
  fallbackTemplate,
}: {
  layout: CoverLayout;
  design: CoverDesign;
  format: string;
  texts: CoverTexts;
  name: string;
  description: string;
  onPick: (design: CoverDesign, template?: string) => void;
  fallbackTemplate: string;
}) {
  return (
    <li>
      <button type="button" onClick={() => onPick(design, layout.template)} className="group w-full text-left" aria-label={`${name}. ${description}`}>
        <div className="overflow-hidden rounded-[4px] ring-1 ring-line ring-offset-2 ring-offset-paper transition group-hover:-translate-y-0.5 group-hover:ring-ink/30 group-focus-visible:ring-2 group-focus-visible:ring-wine">
          <DesignedCover template={layout.template ?? fallbackTemplate} format={format} design={design} texts={texts} uid={`lp${layout.id.replace(/[^a-z0-9]/g, "")}`} lite className="shadow-soft" />
        </div>
        <div className="mt-2 text-sm font-medium text-ink">{name}</div>
        <div className="line-clamp-2 text-xs text-muted">{description}</div>
      </button>
    </li>
  );
});

export function CoverLayoutPicker({
  format,
  texts,
  photos,
  onPick,
  currentTemplate = "linen",
}: {
  format: string;
  texts: CoverTexts;
  photos: { id: string; width: number; height: number }[];
  onPick: (design: CoverDesign, template?: string) => void;
  /** Шаблон книги — фон для макетов без своего фона. */
  currentTemplate?: string;
}) {
  const t = useMessages().design.layouts;
  const [genre, setGenre] = useState<LayoutGenre | "all">("all");
  const [query, setQuery] = useState("");
  // Макеты строятся заново только при смене текста, формата или фото книги (по значениям, а не по объектам).
  const { title, subtitle, names } = texts;
  const photoKey = photos.map((p) => p.id).join(",");
  const built = useMemo(() => {
    const fmt = getFormat(format);
    return new Map(coverLayouts.map((l) => [l.id, l.build({ texts: { title, subtitle, names }, format: fmt, photos })]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- фото сравниваются по id (photoKey)
  }, [format, title, subtitle, names, photoKey]);
  const label = (l: CoverLayout) => t.items[l.id] ?? { name: l.id, description: "" };
  const q = query.trim().toLowerCase();
  const shown = coverLayouts.filter((l) => (genre === "all" || l.genre === genre) && (!q || `${label(l).name} ${label(l).description} ${t.genres[l.genre]}`.toLowerCase().includes(q)));
  return (
    <section aria-label={t.aria}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{t.title}</h3>
          <p className="mt-1 max-w-xl text-sm text-muted">{t.text}</p>
        </div>
        <div className="relative w-full sm:w-60">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input type="search" className="h-10 w-full rounded-xl border border-line bg-white pr-3 pl-9 text-sm outline-none focus:border-wine/50" placeholder={t.search} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t.search} />
        </div>
      </div>
      <div className="no-scrollbar -mx-1 mt-4 flex gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label={t.aria}>
        {(["all", ...genres] as const).map((g) => (
          <button
            key={g}
            type="button"
            role="radio"
            aria-checked={genre === g}
            onClick={() => setGenre(g)}
            className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm transition", genre === g ? "bg-ink text-white" : "bg-white text-ink-soft ring-1 ring-line hover:ring-ink/30")}
          >
            {g === "all" ? t.all : t.genres[g]}
          </button>
        ))}
      </div>
      {photos.length < 5 ? <p className="mt-3 text-xs text-muted">{t.photosNote}</p> : null}
      {shown.length ? (
        <ul className="mt-5 grid gap-x-4 gap-y-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(150px, 45%), 1fr))" }}>
          {shown.map((l) => (
            <LayoutCard key={l.id} layout={l} design={built.get(l.id)!} format={format} texts={texts} name={label(l).name} description={label(l).description} onPick={onPick} fallbackTemplate={currentTemplate} />
          ))}
        </ul>
      ) : (
        <p className="mt-8 text-center text-sm text-muted">{t.empty}</p>
      )}
    </section>
  );
}
