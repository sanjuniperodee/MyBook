"use client";

import { useEffect, useRef, useState } from "react";
import { Crop, GripVertical, Maximize2, Trash2, TriangleAlert } from "lucide-react";
import { useMessages } from "@/i18n/client";
import type { PhotoPlace } from "@/lib/book/photo-place";
import { cn } from "@/lib/class-names";
import { photoUrl } from "@/lib/urls";
import { PlaceBadge } from "@/components/editor/photos/PlaceBadge";
import type { PlaceNames, SheetPhoto } from "@/components/editor/photos/model";
import { canShowWhole, isLossy, onPhotoPages, type PhotoLayout } from "./photos-tab";

const LAYOUTS: PhotoLayout[] = ["full", "bleed", "half", "grid"];

/**
 * Карточка фото на вкладке «Фото»: где оно в книге («Где в книге» открывает лист места), обрезка с «Показать
 * целиком», низкое разрешение. Вид на странице, подпись и «Кадр» — только там, где они влияют на печать: у фото на
 * страницах после главы и в альбоме (подпись — кроме «До краёв»), «Кадр» — и у фото главы. У фото в ответе —
 * подсказка, что его вид меняется во вкладке «Текст».
 */
export function PhotoCard({
  photo,
  index,
  place,
  names,
  blank,
  openerDesign,
  loss,
  lowRes,
  canCrop,
  editable,
  handle,
  onPlace,
  onDelete,
  onLayout,
  onCaption,
  onCrop,
  onShowWhole,
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
  /** У места фото есть кадр, который влияет на печать (cropFrameOf). */
  canCrop: boolean;
  editable: boolean;
  /** Ручка перетаскивания (dnd-kit); нет — порядок сейчас не меняется (фильтр). */
  handle: Record<string, unknown> | null;
  onPlace: () => void;
  onDelete: () => void;
  onLayout: (layout: PhotoLayout) => void;
  onCaption: (caption: string) => void;
  onCrop: () => void;
  onShowWhole: () => void;
}) {
  const m = useMessages();
  const t = m.books.photos;
  const tt = m.books.photosTab;
  const layout = photo.layout ?? "full";
  const pages = onPhotoPages(place);

  /** Ручка перетаскивания и удаление. touch-none — чтобы жест на ручке тянул карточку, а не прокручивал страницу. */
  const actions = editable ? (
    <>
      {handle ? (
        <button {...handle} className="flex size-11 cursor-grab touch-none items-center justify-center rounded-full bg-white/90 shadow active:cursor-grabbing max-sm:border max-sm:border-line max-sm:shadow-none sm:size-9" aria-label={t.drag}>
          <GripVertical className="size-4" />
        </button>
      ) : null}
      <button type="button" onClick={onDelete} className="flex size-11 items-center justify-center rounded-full bg-white/90 text-red-700 shadow max-sm:border max-sm:border-line max-sm:shadow-none sm:size-9" aria-label={t.delete}>
        <Trash2 className="size-4" />
      </button>
    </>
  ) : null;

  return (
    <div className="card min-w-0 overflow-hidden max-sm:flex">
      <div className="relative bg-cream max-sm:w-28 max-sm:shrink-0 sm:aspect-[4/3]">
        {/* eslint-disable-next-line @next/next/no-img-element -- фото клиента */}
        <img src={photoUrl(photo.id)} alt={photo.caption ?? ""} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        <span className="absolute top-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-xs text-white sm:top-3 sm:left-3 sm:px-2.5 sm:py-1">{index + 1}</span>
        {actions ? <div className="absolute top-3 right-3 flex gap-1.5 max-sm:hidden">{actions}</div> : null}
      </div>
      <div className="min-w-0 flex-1 space-y-2.5 p-3 sm:space-y-3 sm:p-4">
        {/* Подпись места — на всю ширину: рядом с кнопками на телефоне от «Фото главы «…»» оставалось два слова. */}
        <div>
          <div className="flex items-center gap-1.5">
            <div className="min-w-0 flex-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{tt.placeBtn}</div>
            {actions ? <div className="flex shrink-0 gap-1.5 sm:hidden">{actions}</div> : null}
          </div>
          <PlaceBadge place={place} names={names} blank={blank} marked={photo.opener} openerDesign={openerDesign} onOpen={onPlace} className="mt-1 px-2.5 ring-1 ring-line" />
        </div>

        {isLossy(loss) || lowRes ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {isLossy(loss) ? (
              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                <Crop className="size-3 shrink-0" aria-hidden /> {tt.lossChip(Math.round(loss * 100))}
              </span>
            ) : null}
            {canShowWhole(photo, place, loss) && editable ? (
              <button type="button" onClick={onShowWhole} className="flex min-h-11 items-center gap-1 rounded-full px-2 text-xs font-medium text-wine hover:bg-wine/5">
                <Maximize2 className="size-3.5" aria-hidden /> {tt.showWhole}
              </button>
            ) : null}
            {lowRes ? (
              <span className="flex items-center gap-1 text-xs text-amber-700" title={lowRes}>
                <TriangleAlert className="size-3 shrink-0" aria-hidden /> {t.lowRes}
              </span>
            ) : null}
          </div>
        ) : null}

        {place?.kind === "answer" ? <p className="text-xs text-muted">{blank ? tt.inAnswerNoteBlank : t.inAnswerNote}</p> : null}

        {pages ? (
          <>
            {layout === "bleed" ? <p className="text-xs text-muted">{t.noCaptionBleed}</p> : <CaptionField key={photo.id} value={photo.caption ?? ""} placeholder={t.caption} disabled={!editable} onSave={onCaption} />}
            <div role="radiogroup" aria-label={m.editor.placeSheet.layoutTitle} className="grid grid-cols-2 gap-1 rounded-xl bg-cream/70 p-1">
              {LAYOUTS.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={layout === l}
                  disabled={!editable}
                  onClick={() => layout !== l && onLayout(l)}
                  className={cn("min-h-11 rounded-lg px-2 py-1.5 text-xs leading-snug font-medium transition", layout === l ? "bg-white shadow-soft" : "text-muted hover:text-ink")}
                >
                  {t.layouts[l].label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">{t.layouts[layout].hint}</p>
          </>
        ) : null}

        {canCrop ? (
          <button type="button" disabled={!editable} onClick={onCrop} className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-line text-xs font-medium text-ink-soft hover:bg-cream disabled:opacity-50">
            <Crop className="size-3.5" aria-hidden /> {m.editor.crop.edit}
            {photo.crop ? " ✓" : ""}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Подпись к фото: пишется сразу в поле, на сервер — через паузу в наборе или при уходе из поля (и если карточка
 * исчезла посреди набора — например, сменили фильтр).
 */
function CaptionField({ value, placeholder, disabled, onSave }: { value: string; placeholder: string; disabled: boolean; onSave: (caption: string) => void }) {
  const [draft, setDraft] = useState(value);
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; text: string } | null>(null);
  const save = useRef(onSave);
  useEffect(() => {
    save.current = onSave;
  });
  const flush = () => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    save.current(p.text);
  };
  useEffect(
    () => () => {
      const p = pending.current;
      if (!p) return;
      clearTimeout(p.timer);
      save.current(p.text);
    },
    [],
  );
  return (
    <input
      className="input h-11 text-sm"
      placeholder={placeholder}
      value={draft}
      maxLength={200}
      disabled={disabled}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        if (pending.current) clearTimeout(pending.current.timer);
        pending.current = { text, timer: setTimeout(flush, 700) };
      }}
      onBlur={flush}
    />
  );
}
