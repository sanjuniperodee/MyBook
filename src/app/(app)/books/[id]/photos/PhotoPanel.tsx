"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Crop, LoaderCircle, Maximize2, RotateCw, SlidersHorizontal, Trash2, TriangleAlert, X } from "lucide-react";
import { useMessages } from "@/i18n/client";
import type { PhotoPlace } from "@/lib/book/photo-place";
import { cn } from "@/lib/class-names";
import { photoUrl } from "@/lib/urls";
import { PlaceBadge } from "@/components/editor/photos/PlaceBadge";
import type { PlaceNames, SheetPhoto } from "@/components/editor/photos/model";
import { canShowWhole, isLossy, onPhotoPages, type PhotoLayout } from "./photos-tab";

const LAYOUTS: PhotoLayout[] = ["full", "bleed", "half", "grid"];

export interface PhotoPanelProps {
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
  /** Название правила книги для фото без места — в заметке «встало само». */
  ruleName: string;
  version?: string;
  edited?: boolean;
  /** aside — справа на компьютере (лист с шапкой), sheet — внутри шторки Sheet (заголовок у неё свой). */
  variant: "aside" | "sheet";
  onClose: () => void;
  onPlace: () => void;
  onRules: () => void;
  onDelete: () => void;
  onLayout: (layout: PhotoLayout) => void;
  onCaption: (caption: string) => void;
  onCrop: () => void;
  onShowWhole: () => void;
  onRotate: () => Promise<void>;
  /** Редактор фото: надписи, рисунок, кадр, свет и цвет. */
  onEditPhoto?: () => void;
}

/**
 * Настройки одного фото вкладки «Фото»: снимок целиком, где он в книге («Где в книге» открывает лист места), обрезка с
 * «Показать целиком», низкое разрешение; вид на странице, подпись и «Кадр» — только там, где они влияют на печать:
 * у фото на страницах после главы и в альбоме (подпись — кроме «До краёв»), «Кадр» — и у фото главы. У фото в ответе —
 * подсказка, что его вид меняется во вкладке «Текст». Внизу — редактор фото, повернуть и удалить.
 */
export function PhotoPanel(p: PhotoPanelProps) {
  const m = useMessages();
  const t = m.books.photos;
  const tt = m.books.photosTab;
  const { photo, place, editable, variant } = p;
  const layout = photo.layout ?? "full";
  const pages = onPhotoPages(place);
  const [rotating, setRotating] = useState(false);

  const body = (
    <div className={cn("space-y-4", variant === "aside" && "p-4")}>
      <div className="relative flex max-h-64 min-h-36 items-center justify-center overflow-hidden rounded-[10px] bg-sunken ring-1 ring-line">
        {/* eslint-disable-next-line @next/next/no-img-element -- фото клиента */}
        <img src={photoUrl(photo.id) + (p.version ? `&v=${encodeURIComponent(p.version)}` : "")} alt={photo.caption ?? ""} className="max-h-64 w-auto max-w-full object-contain" />
        {p.edited ? <span className="absolute bottom-2 left-2 rounded-md bg-wine px-1.5 py-0.5 text-[10px] leading-none font-medium text-white">{m.editor.photoEditor.edited}</span> : null}
      </div>
      <p className="-mt-2 text-xs text-muted tabular-nums">{tt.panel.size(photo.width, photo.height)}</p>

      <div>
        <div className="text-xs font-medium text-muted">{tt.placeBtn}</div>
        <PlaceBadge place={place} names={p.names} blank={p.blank} marked={photo.opener} openerDesign={p.openerDesign} onOpen={p.onPlace} className="mt-1.5 border border-line-strong bg-white px-3 font-medium" />
        {place?.onCover ? <p className="mt-1.5 text-xs text-muted">{place.onCover === "cover" ? m.editor.placeSheet.coverNote : m.editor.placeSheet.backNote}</p> : null}
        {place?.auto && place.kind !== "off" ? (
          <p className="mt-2 rounded-[10px] bg-sunken px-3 py-2 text-xs leading-snug text-ink-soft">
            {tt.panel.autoNote(p.ruleName)}{" "}
            {editable ? (
              <button type="button" onClick={p.onRules} className="font-medium text-wine underline underline-offset-2 hover:text-wine-dark">
                {tt.panel.changeRule}
              </button>
            ) : null}
          </p>
        ) : null}
        {place?.kind === "off" && !place.onCover ? <p className="mt-2 rounded-[10px] bg-sunken px-3 py-2 text-xs leading-snug text-ink-soft">{tt.panel.offNote}</p> : null}
        {place?.kind === "answer" ? <p className="mt-2 text-xs leading-snug text-muted">{p.blank ? tt.inAnswerNoteBlank : t.inAnswerNote}</p> : null}
      </div>

      {isLossy(p.loss) || p.lowRes ? (
        <div className="space-y-1.5 rounded-[10px] bg-warning-bg px-3 py-2.5 text-xs text-warning">
          {isLossy(p.loss) ? (
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Crop className="size-3.5 shrink-0" aria-hidden /> {tt.lossChip(Math.round(p.loss * 100))}
              </span>
              {canShowWhole(photo, place, p.loss) && editable ? (
                <button type="button" onClick={p.onShowWhole} className="inline-flex min-h-9 items-center gap-1 rounded-md px-1 font-medium underline underline-offset-2 hover:text-ink">
                  <Maximize2 className="size-3.5" aria-hidden /> {tt.showWhole}
                </button>
              ) : null}
            </div>
          ) : null}
          {p.lowRes ? (
            <div className="flex items-center gap-1.5" title={p.lowRes}>
              <TriangleAlert className="size-3.5 shrink-0" aria-hidden /> {t.lowRes}
            </div>
          ) : null}
        </div>
      ) : null}

      {pages ? (
        <div className="space-y-3">
          {layout === "bleed" ? <p className="text-xs text-muted">{t.noCaptionBleed}</p> : <CaptionField key={photo.id} value={photo.caption ?? ""} placeholder={t.caption} disabled={!editable} onSave={p.onCaption} />}
          <div>
            <div role="radiogroup" aria-label={m.editor.placeSheet.layoutTitle} className="grid grid-cols-2 gap-1.5">
              {LAYOUTS.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={layout === l}
                  disabled={!editable}
                  onClick={() => layout !== l && p.onLayout(l)}
                  className={cn(
                    "min-h-11 rounded-[10px] border px-2 py-1.5 text-[13px] leading-snug transition focus-visible:outline-2 focus-visible:outline-wine disabled:opacity-60",
                    layout === l ? "border-wine bg-rose/60 font-medium text-ink" : "border-line bg-white text-ink-soft hover:border-line-strong",
                  )}
                >
                  {t.layouts[l].label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">{t.layouts[layout].hint}</p>
          </div>
        </div>
      ) : null}

      <div className="space-y-2 border-t border-line pt-4">
        {editable && p.onEditPhoto ? (
          <button type="button" onClick={p.onEditPhoto} title={m.editor.photoEditor.openHint} className="btn btn-dark w-full">
            <SlidersHorizontal className="size-4" aria-hidden /> {m.editor.photoEditor.open}
          </button>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          {p.canCrop ? (
            <button type="button" disabled={!editable} onClick={p.onCrop} className="btn btn-outline">
              <Crop className="size-4" aria-hidden /> {m.editor.crop.edit}
              {photo.crop ? <Check className="size-3.5 text-success" aria-label="" /> : null}
            </button>
          ) : null}
          {editable ? (
            <button
              type="button"
              disabled={rotating}
              onClick={async () => {
                setRotating(true);
                try {
                  await p.onRotate();
                } finally {
                  setRotating(false);
                }
              }}
              className={cn("btn btn-outline", !p.canCrop && "col-span-2")}
            >
              {rotating ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <RotateCw className="size-4" aria-hidden />} {tt.panel.rotate}
            </button>
          ) : null}
        </div>
        {editable ? (
          <button type="button" onClick={p.onDelete} className="btn btn-ghost w-full text-danger hover:bg-danger-bg hover:text-danger">
            <Trash2 className="size-4" aria-hidden /> {t.delete}
          </button>
        ) : null}
      </div>
    </div>
  );

  if (variant === "sheet") return <div data-testid="photo-panel">{body}</div>;
  return (
    <section data-testid="photo-panel" aria-label={tt.panel.title(p.index + 1)} className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-line py-1.5 pr-1.5 pl-4">
        <h2 className="panel-title">{tt.panel.title(p.index + 1)}</h2>
        <button type="button" onClick={p.onClose} aria-label={tt.panel.close} className="flex size-10 items-center justify-center rounded-[10px] text-muted hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-wine">
          <X className="size-4" />
        </button>
      </div>
      {body}
    </section>
  );
}

/**
 * Подпись к фото: пишется сразу в поле, на сервер — через паузу в наборе или при уходе из поля (и если панель
 * закрылась посреди набора — например, выбрали другое фото).
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
      className="input"
      placeholder={placeholder}
      aria-label={placeholder}
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
