"use client";

import { Check } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { cn } from "@/lib/class-names";
import type { PlaceBook } from "@/components/editor/photos/model";

const RULES = ["chapters", "end", "none"] as const;

/**
 * Правило книги для фото без выбранного места (перенесено сюда со вкладки «Страницы»): после глав по порядку,
 * альбомом в конце (с названием альбома) или не печатать. Пока нет глав с текстом, «после глав» собирает фото в альбом.
 */
export function PlacementRule({
  value,
  gallery,
  blank,
  noChapters,
  editable,
  onChange,
}: {
  value: PlaceBook["photoPlacement"];
  /** Название альбома в конце — своё из оглавления или по виду книги. */
  gallery: string;
  blank: boolean;
  /** В книге ещё нет глав с текстом. */
  noChapters: boolean;
  editable: boolean;
  onChange: (v: PlaceBook["photoPlacement"]) => void;
}) {
  const m = useMessages().books.photosTab;
  const t = m.rule;
  const text = { chapters: t.chapters.text, end: t.end.text(gallery), none: blank ? t.none.textBlank : t.none.text };
  return (
    <section className="rounded-3xl border border-line bg-white p-4 sm:p-5">
      <h2 className="font-semibold">{t.title}</h2>
      <div role="radiogroup" aria-label={t.title} className="mt-3 grid gap-2 sm:grid-cols-3">
        {RULES.map((r) => {
          const on = value === r;
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!editable}
              onClick={() => !on && onChange(r)}
              className={cn("flex min-h-14 items-start gap-3 rounded-2xl px-4 py-3 text-left ring-1 transition disabled:opacity-60", on ? "bg-wine/5 ring-2 ring-wine" : "ring-line hover:bg-cream/50")}
            >
              <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border", on ? "border-wine bg-wine text-white" : "border-line")}>{on ? <Check className="size-3" /> : null}</span>
              <span className="min-w-0">
                <span className="block font-medium">{t[r].title}</span>
                <span className="mt-0.5 block text-sm leading-snug text-muted">{text[r]}</span>
              </span>
            </button>
          );
        })}
      </div>
      {noChapters && value === "chapters" ? <p className="mt-3 text-sm text-amber-700">{blank ? m.noChaptersBlank : m.noChapters}</p> : null}
    </section>
  );
}
