"use client";

import { useMessages } from "@/i18n/client";
import { editorPhotoUrl, type EditorPhoto } from "@/lib/book/editor-model";
import { normalizeStyle, type InlinePhotoStyle } from "@/lib/book/inline-photo";
import { cn } from "@/lib/class-names";
import { PhotoInspector } from "../PhotoInspector";

/** Фото текущего ответа: миниатюры с шириной в процентах и настройки выделенного фото. */
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
  onRemove: (id: string) => void;
}) {
  const t = useMessages().editor;
  return (
    <div className="space-y-3 px-4 pb-5 sm:px-10 sm:pb-6">
      <div className="flex flex-wrap items-center gap-2">
        {photos.map((p) => {
          const st = normalizeStyle(p.inline);
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
              <img src={editorPhotoUrl(p)} alt="" className="size-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 bg-ink/60 py-0.5 text-center text-[10px] text-white tabular-nums">{st.width}%</span>
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
          onChange={(patch) => onChange(selected.id, patch)}
          onCaption={(c) => onCaption(selected.id, c)}
          onRotate={() => onRotate(selected.id)}
          onRemove={() => onRemove(selected.id)}
          onClose={() => onSelect(null)}
        />
      ) : null}
    </div>
  );
}
