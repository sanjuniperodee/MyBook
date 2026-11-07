"use client";

import { Images } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { PhotoIntroCard } from "@/components/editor/photos/PhotoIntro";
import type { PlaceBook } from "@/components/editor/photos/model";
import { PlacementRule } from "./PlacementRule";

/**
 * Правила книги для фото — справа от галереи, пока ни одно фото не выбрано (и в шторке «Настроить» на телефоне): правило
 * для фото без места, альбом в конце (название, порядок и состав правят в его листе) и подсказка «Где стоит фото».
 */
export function BookRules({
  value,
  gallery,
  blank,
  noChapters,
  editable,
  album,
  onChange,
  onAlbum,
  variant,
}: {
  value: PlaceBook["photoPlacement"];
  gallery: string;
  blank: boolean;
  noChapters: boolean;
  editable: boolean;
  /** Сколько фото в альбоме в конце; 0 — строки альбома нет. */
  album: number;
  onChange: (v: PlaceBook["photoPlacement"]) => void;
  onAlbum: () => void;
  /** aside — лист на холсте; sheet — внутри шторки. */
  variant: "aside" | "sheet";
}) {
  const m = useMessages().books;
  const rule = <PlacementRule value={value} gallery={gallery} blank={blank} noChapters={noChapters} editable={editable} onChange={onChange} hideTitle={variant === "sheet"} />;
  const albumRow = album ? (
    <div className="flex items-center gap-2.5 border-t border-line pt-4">
      <Images className="size-4 shrink-0 text-wine" aria-hidden />
      <span className="min-w-0 flex-1 text-sm font-medium">{m.pagesPhotos.albumRow(gallery, album)}</span>
      <button type="button" className="btn btn-outline btn-sm shrink-0" onClick={onAlbum}>
        {m.pagesPhotos.albumEdit}
      </button>
    </div>
  ) : null;
  const intro = <PhotoIntroCard blank={blank} force={variant === "sheet"} className="rounded-[var(--r-panel)] bg-sunken p-4" />;
  if (variant === "sheet")
    return (
      <div className="space-y-4">
        {rule}
        {albumRow}
        {intro}
      </div>
    );
  return (
    <div className="space-y-3">
      <div className="panel space-y-4 p-4">
        {rule}
        {albumRow}
      </div>
      {intro}
    </div>
  );
}
