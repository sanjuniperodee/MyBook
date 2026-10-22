"use client";

import { EyeOff, RectangleVertical } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { useMessages } from "@/i18n/client";
import { editorPhotoUrl, type EditorPhoto, type EditorPhotoPatch, type PhotoUndo } from "@/lib/book/editor-model";
import { normalizeStyle, type InlinePhotoStyle } from "@/lib/book/inline-photo";
import type { PhotoPlace } from "@/lib/book/photo-place";
import { cn } from "@/lib/class-names";
import { placePatch, type PlaceNames } from "../photos/model";
import { PlaceBadge } from "../photos/PlaceBadge";
import { PhotoInspector, sizeWord } from "../PhotoInspector";

/** «Убрать из ответа»: фото уходит из книги совсем («не печатается»), а не встаёт само на страницы после главы. */
export const removePatch = (): EditorPhotoPatch => placePatch({ kind: "off" });

/**
 * Фото текущего ответа: миниатюры с размером словом (или значком отдельной страницы) и настройки выделенного фото
 * с подписью, где оно стоит в книге. С onPatch «Убрать из ответа» снимает фото с печати и предлагает в тосте
 * «Отменить» и «После главы»; без него — прежний onRemove.
 */
export function PhotoStrip({
  photos,
  selected,
  answer,
  editable,
  onSelect,
  onChange,
  onCaption,
  onRotate,
  onRemove,
  format,
  blank = false,
  places,
  names,
  onPatch,
  onUndo,
  onMove,
}: {
  photos: EditorPhoto[];
  selected: EditorPhoto | null;
  /** Текст ответа — для выбора места фото по абзацам. */
  answer: string;
  editable: boolean;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<InlinePhotoStyle>) => void;
  onCaption: (id: string, caption: string) => void;
  onRotate: (id: string) => Promise<void>;
  /** Прежнее «убрать» — пока вызывающий не передал onPatch. */
  onRemove?: (id: string) => void;
  /** Формат книги (id): рамка листа и обрезка у фото на отдельной странице. */
  format?: string;
  /** Своя книга: «раздел» вместо «ответ». */
  blank?: boolean;
  /** Места фото в собранной книге (useBookContent().places). */
  places?: ReadonlyMap<string, PhotoPlace>;
  /** Названия глав и ответов для подписи места. */
  names?: PlaceNames;
  /** Правка фото с «Отменить» (useInlinePhotos.patchPhoto): кадр отдельной страницы, «Убрать из ответа». */
  onPatch?: (id: string, patch: EditorPhotoPatch) => Promise<PhotoUndo | null>;
  /** «Отменить» в тосте (useInlinePhotos.applyUndo). */
  onUndo?: (undo: PhotoUndo) => unknown;
  /** «Перенести…» и нажатие на подпись места — лист «Где стоит фото». */
  onMove?: (id: string) => void;
}) {
  const m = useMessages();
  const t = m.editor;
  const a = t.answerPhoto;

  const remove = async (id: string) => {
    if (!onPatch) return onRemove?.(id);
    const chapterKey = places?.get(id)?.chapterKey;
    onSelect(null);
    const undo = await onPatch(id, removePatch());
    if (!undo) return;
    toast(a.toastRemoved, "success", {
      ...(onUndo ? { action: { label: a.undo, run: () => onUndo(undo) } } : {}),
      ...(chapterKey ? { alt: { label: a.toAfter, run: () => onPatch(id, placePatch({ kind: "after", chapterKey })) } } : {}),
    });
  };

  const selectedPlace = selected ? places?.get(selected.id) : undefined;
  return (
    <div className="space-y-3 px-4 pb-5 sm:px-10 sm:pb-6">
      <div className="flex flex-wrap items-center gap-2">
        {photos.map((p) => {
          const st = normalizeStyle(p.inline);
          const off = places?.get(p.id)?.kind === "off";
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(selected?.id === p.id ? null : p.id)}
              className={cn("group relative size-16 overflow-hidden rounded-xl border-2 transition", selected?.id === p.id ? "border-wine shadow-md" : "border-transparent ring-1 ring-line hover:ring-ink/30")}
              aria-pressed={selected?.id === p.id}
              aria-label={t.photoAria(p.caption)}
              data-testid="inline-photo-thumb"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={editorPhotoUrl(p)} alt="" className={cn("size-full object-cover", off && "opacity-50")} />
              {off ? <EyeOff className="absolute top-1 right-1 size-3.5 text-white drop-shadow" aria-hidden /> : null}
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center truncate bg-ink/60 px-0.5 py-0.5 text-center text-[10px] text-white">
                {st.page ? <RectangleVertical className="size-3" aria-label={a.onPage} /> : a.sizes[sizeWord(st.width)]}
              </span>
            </button>
          );
        })}
        <span className="text-xs text-muted">{selected ? "" : t.photoHint}</span>
      </div>
      {selected ? (
        <PhotoInspector
          photo={{ ...selected, url: editorPhotoUrl(selected) }}
          answer={answer}
          editable={editable}
          format={format}
          blank={blank}
          onChange={(patch) => onChange(selected.id, patch)}
          onCaption={(c) => onCaption(selected.id, c)}
          onRotate={() => onRotate(selected.id)}
          onRemove={() => void remove(selected.id)}
          onClose={() => onSelect(null)}
          onCrop={onPatch ? (crop) => void onPatch(selected.id, { crop }) : undefined}
          onMove={onMove ? () => onMove(selected.id) : undefined}
          badge={
            selectedPlace && names ? (
              <PlaceBadge place={selectedPlace} names={names} blank={blank} marked={selected.opener} onOpen={onMove && editable ? () => onMove(selected.id) : undefined} className="-ml-1 px-1" />
            ) : null
          }
        />
      ) : null}
    </div>
  );
}
