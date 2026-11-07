"use client";

import { Crop, GripVertical, SlidersHorizontal, Trash2, TriangleAlert } from "lucide-react";
import { useMessages } from "@/i18n/client";
import type { PhotoPlace } from "@/lib/book/photo-place";
import { cn } from "@/lib/class-names";
import { photoUrl } from "@/lib/urls";
import { PlaceBadge, placeText } from "@/components/editor/photos/PlaceBadge";
import type { PlaceNames, SheetPhoto } from "@/components/editor/photos/model";
import { isLossy } from "./photos-tab";

/**
 * Плитка фото в галерее вкладки «Фото»: снимок, под ним — где он стоит в книге. Состояние видно по самой плитке:
 * выбранное автором место — сплошная подпись; «встало само» (правило книги) — пунктир вокруг снимка; «не печатается» —
 * снимок притушен. Нажатие открывает настройки фото (справа на компьютере, шторкой на телефоне). На компьютере при
 * наведении у снимка — «Редактировать» и «Удалить»; ручка перетаскивания — когда порядок можно менять.
 */
export function PhotoTile({
  photo,
  index,
  place,
  names,
  blank,
  openerDesign,
  loss,
  lowRes,
  selected,
  editable,
  handle,
  onSelect,
  onEdit,
  onDelete,
  version,
  edited,
}: {
  photo: SheetPhoto;
  /** Номер фото по порядку вкладки. */
  index: number;
  place: PhotoPlace | undefined;
  names: PlaceNames;
  blank: boolean;
  openerDesign: boolean;
  loss: number;
  /** Подпись про dpi, если фото напечатается нечётким. */
  lowRes: string | null;
  selected: boolean;
  editable: boolean;
  /** Ручка перетаскивания (dnd-kit); нет — порядок сейчас не меняется (фильтр или вид «По главам»). */
  handle: Record<string, unknown> | null;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  /** Версия файла — в адресе картинки (после правки и поворота браузер берёт новую). */
  version?: string;
  /** Правлено в редакторе фото. */
  edited?: boolean;
}) {
  const m = useMessages();
  const t = m.books.photos;
  const tt = m.books.photosTab;
  const label = place ? placeText(place, names, m.editor, blank, { marked: photo.opener, openerDesign }) : "";
  const auto = !!place?.auto && place.kind !== "off";
  const off = place?.kind === "off";

  return (
    <div data-help={`photo:${photo.id}`} data-place={place?.kind} className="group relative min-w-0">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={tt.tileAria(index + 1, label)}
        className={cn(
          "relative block aspect-square w-full overflow-hidden rounded-[10px] bg-cream ring-1 ring-line transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine",
          selected ? "ring-2 ring-wine ring-offset-2 ring-offset-paper" : auto ? "outline-1 outline-offset-2 outline-line-strong outline-dashed" : "hover:ring-line-strong",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- фото клиента */}
        <img src={photoUrl(photo.id) + (version ? `&v=${encodeURIComponent(version)}` : "")} alt={photo.caption ?? ""} className={cn("absolute inset-0 size-full object-cover transition-opacity", off && "opacity-50")} loading="lazy" />
        <span className="pointer-events-none absolute top-1.5 left-1.5 rounded-md bg-spine/75 px-1.5 py-0.5 text-[11px] leading-none font-medium text-white tabular-nums">{index + 1}</span>
        {edited ? <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-md bg-wine px-1.5 py-0.5 text-[10px] leading-none font-medium text-white">{m.editor.photoEditor.edited}</span> : null}
      </button>

      {/* Действия поверх снимка: ручка — всегда на телефоне, на компьютере при наведении; быстрые — только на компьютере. */}
      <div className="pointer-events-none absolute top-0 right-0 flex flex-col items-end gap-1 p-1 lg:flex-row lg:opacity-0 lg:transition-opacity lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
        {editable && onEdit ? (
          <button type="button" onClick={onEdit} title={m.editor.photoEditor.openHint} aria-label={m.editor.photoEditor.open} className="pointer-events-auto flex size-8 items-center justify-center rounded-md bg-white/95 text-ink ring-1 ring-line hover:bg-white focus-visible:outline-2 focus-visible:outline-wine max-lg:hidden">
            <SlidersHorizontal className="size-4" />
          </button>
        ) : null}
        {editable ? (
          <button type="button" onClick={onDelete} aria-label={t.delete} title={t.delete} className="pointer-events-auto flex size-8 items-center justify-center rounded-md bg-white/95 text-danger ring-1 ring-line hover:bg-white focus-visible:outline-2 focus-visible:outline-wine max-lg:hidden">
            <Trash2 className="size-4" />
          </button>
        ) : null}
        {handle ? (
          <button {...handle} aria-label={t.drag} title={t.drag} className="pointer-events-auto flex size-11 cursor-grab touch-none items-center justify-center active:cursor-grabbing lg:size-8">
            <span className="flex size-8 items-center justify-center rounded-md bg-white/95 text-ink ring-1 ring-line">
              <GripVertical className="size-4" />
            </span>
          </button>
        ) : null}
      </div>

      <div className="mt-1.5 space-y-1">
        <PlaceBadge place={place} names={names} blank={blank} marked={photo.opener} openerDesign={openerDesign} className={cn("px-0.5", off || auto ? "" : "font-medium")} />
        {isLossy(loss) || lowRes ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-0.5">
            {isLossy(loss) ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                <Crop className="size-3 shrink-0" aria-hidden /> {tt.lossChip(Math.round(loss * 100))}
              </span>
            ) : null}
            {lowRes ? (
              <span className="inline-flex items-center gap-1 text-xs text-warning" title={lowRes}>
                <TriangleAlert className="size-3 shrink-0" aria-hidden /> {lowRes}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
