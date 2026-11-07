"use client";

import { useMessages } from "@/i18n/client";
import { cn } from "@/lib/class-names";
import type { PlaceBook } from "@/components/editor/photos/model";

export const PLACEMENT_RULES = ["chapters", "end", "none"] as const;

/**
 * Правило книги для фото без выбранного места (перенесено сюда со вкладки «Страницы»): после глав по порядку,
 * альбомом в конце (с названием альбома) или не печатать. Пока нет глав с текстом, «после глав» собирает фото в альбом.
 * Три строки друг под другом: узкая колонка справа на компьютере и шторка на телефоне.
 */
export function PlacementRule({
  value,
  gallery,
  blank,
  noChapters,
  editable,
  onChange,
  hideTitle,
}: {
  value: PlaceBook["photoPlacement"];
  /** Название альбома в конце — своё из оглавления или по виду книги. */
  gallery: string;
  blank: boolean;
  /** В книге ещё нет глав с текстом. */
  noChapters: boolean;
  editable: boolean;
  onChange: (v: PlaceBook["photoPlacement"]) => void;
  /** Заголовок уже есть снаружи (шапка листа или шторки). */
  hideTitle?: boolean;
}) {
  const m = useMessages().books.photosTab;
  const t = m.rule;
  const text = { chapters: t.chapters.text, end: t.end.text(gallery), none: blank ? t.none.textBlank : t.none.text };
  return (
    <section aria-label={t.title}>
      <h2 className={cn("text-sm font-semibold", hideTitle && "sr-only")}>{t.title}</h2>
      <div role="radiogroup" aria-label={t.title} className={cn("space-y-1.5", !hideTitle && "mt-2.5")}>
        {PLACEMENT_RULES.map((r) => {
          const on = value === r;
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!editable}
              onClick={() => !on && onChange(r)}
              className={cn(
                "flex min-h-14 w-full items-start gap-3 rounded-[10px] border px-3 py-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine disabled:opacity-60",
                on ? "border-wine bg-rose/60" : "border-line bg-white hover:border-line-strong",
              )}
            >
              <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2", on ? "border-wine" : "border-line-strong")} aria-hidden>
                {on ? <span className="size-2 rounded-full bg-wine" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t[r].title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted">{text[r]}</span>
              </span>
            </button>
          );
        })}
      </div>
      {noChapters && value === "chapters" ? <p className="mt-2.5 text-[13px] text-warning">{blank ? m.noChaptersBlank : m.noChapters}</p> : null}
    </section>
  );
}
