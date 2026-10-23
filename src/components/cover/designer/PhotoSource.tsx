"use client";

/** Выбор снимка для слоя: фото книги (с пометкой о низком качестве) или снимок коллекции по группам. */
import { useState } from "react";
import { Check, ImagePlus } from "lucide-react";
import { Link, useMessages } from "@/i18n/client";
import { stockGroups, stockPhotos, type StockGroup } from "@/lib/book/cover-design";
import { coverPhotoUrl } from "@/lib/book/photo-cover";
import { cn } from "@/lib/class-names";
import { photoUrl } from "@/lib/urls";

export function PhotoSource({
  bookId,
  bookPhotos,
  selected,
  onPick,
  compact,
}: {
  bookId: string;
  bookPhotos: { id: string; width: number; height: number }[];
  selected?: { photoId: string | null; stock: string | null };
  onPick: (src: { photoId?: string; stock?: string; aspect: number }) => void;
  compact?: boolean;
}) {
  const m = useMessages();
  const t = m.design.cover.add;
  const [group, setGroup] = useState<StockGroup | "book">(bookPhotos.length ? "book" : "people");
  const keys = Object.keys(stockPhotos).filter((k) => stockPhotos[k] === group);
  const cell = cn("relative aspect-square overflow-hidden rounded-lg ring-offset-1 transition hover:opacity-90");
  return (
    <div className="space-y-2">
      <div className="no-scrollbar flex gap-1 overflow-x-auto">
        {(["book", ...stockGroups] as const).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGroup(g)}
            className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs transition", group === g ? "bg-ink text-white" : "bg-cream/70 text-ink-soft hover:bg-cream")}
          >
            {g === "book" ? t.bookPhotos : t.stockGroups[g]}
          </button>
        ))}
      </div>
      {group === "book" ? (
        bookPhotos.length ? (
          <div className={cn("grid gap-1.5", compact ? "grid-cols-4" : "grid-cols-3")}>
            {bookPhotos.map((p) => {
              const on = selected?.photoId === p.id;
              return (
                <button key={p.id} type="button" aria-pressed={on} onClick={() => onPick({ photoId: p.id, aspect: p.width / p.height })} className={cn(cell, on ? "ring-2 ring-wine" : "ring-1 ring-line")}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- фото книги */}
                  <img src={photoUrl(p.id)} alt="" className="h-full w-full object-cover" draggable={false} />
                  {on ? (
                    <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-wine text-white">
                      <Check className="size-3" />
                    </span>
                  ) : null}
                  {p.width < 1800 ? <span className="absolute inset-x-0 bottom-0 bg-amber-500/90 py-px text-[9px] text-white">{m.books.cover.lowQuality}</span> : null}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted">{t.noBookPhotos}</p>
        )
      ) : (
        <div className={cn("grid gap-1.5", compact ? "grid-cols-4" : "grid-cols-3")}>
          {keys.map((k) => {
            const on = selected?.stock === k && !selected.photoId;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={(e) => {
                  const img = (e.currentTarget.querySelector("img") as HTMLImageElement | null) ?? null;
                  onPick({ stock: k, aspect: img?.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 4 / 3 });
                }}
                className={cn(cell, on ? "ring-2 ring-wine" : "ring-1 ring-line")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- снимок коллекции */}
                <img src={coverPhotoUrl(k, 300)} alt="" loading="lazy" className="h-full w-full object-cover" draggable={false} />
              </button>
            );
          })}
        </div>
      )}
      <Link href={`/books/${bookId}/photos`} className="inline-flex items-center gap-1.5 text-sm text-wine hover:underline">
        <ImagePlus className="size-4" /> {t.upload}
      </Link>
    </div>
  );
}
