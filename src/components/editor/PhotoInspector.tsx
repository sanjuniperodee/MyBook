"use client";

import { AlignCenter, AlignLeft, AlignRight, ArrowRightLeft, ChevronDown, ChevronUp, LoaderCircle, Move, RotateCcw, RotateCw, X } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { getFormat } from "@/lib/book/formats";
import { cropRect, normalizeStyle, splitParagraphs } from "@/lib/book/inline-photo";
import type { InlinePhotoStyle } from "@/lib/book/inline-photo";
import { fillFocus, type PhotoCrop } from "@/lib/book/photo-crop";
import { CONTAIN_LOSS, coverLoss, defaultPageFit, WARN_LOSS } from "@/lib/book/photo-loss";
import { pageFrame } from "@/lib/book/photo-pages";
import { cn } from "@/lib/class-names";
import { useMessages } from "@/i18n/client";
import { frameWidth, ZoomSlider } from "./CropDialog";
import { PanFrame } from "./PanFrame";

export interface InspectorPhoto {
  id: string;
  url: string;
  width: number;
  height: number;
  caption: string;
  inline?: InlinePhotoStyle | null;
  /** Кадр автора (photos.crop) — по нему печатается фото «До краёв» на отдельной странице. */
  crop?: PhotoCrop | null;
}

const aspectIds: InlinePhotoStyle["aspect"][] = ["original", "1:1", "4:3", "3:4", "16:9"];
const frameIds: InlinePhotoStyle["frame"][] = ["none", "line", "polaroid", "round"];

/** Размеры словами — ширина фото в тексте, %. */
export type SizeWord = "small" | "medium" | "large" | "full";
const sizes: { w: number; id: SizeWord }[] = [
  { w: 33, id: "small" },
  { w: 50, id: "medium" },
  { w: 75, id: "large" },
  { w: 100, id: "full" },
];

/** Ширина фото словом: ближайший из размеров (ползунок даёт и промежуточные). */
export function sizeWord(width: number): SizeWord {
  let best = sizes[0];
  for (const s of sizes) if (Math.abs(s.w - width) < Math.abs(best.w - width)) best = s;
  return best.id;
}

/** Сколько снимка срежется, если заполнить им лист книги (фото на отдельной странице «До краёв»). */
export const pageLoss = (photo: { width: number; height: number }, format: string) => coverLoss(photo, pageFrame(getFormat(format)).ratio);

/**
 * Что записать, когда фото в тексте ставят на отдельную страницу (R11): pageFit — явно, «целиком, с полями», если
 * при заполнении листа срежется заметная доля снимка, иначе «до краёв». Остальной вид (размер, форма, рамка) не
 * трогаем — он вернётся, если фото снова поставить в текст.
 */
export function pageModePatch(photo: { width: number; height: number }, format: string): Partial<InlinePhotoStyle> {
  return { page: true, pageFit: defaultPageFit(photo, getFormat(format)) };
}

/** Подпись печатается только у фото в тексте (R10): у фото на отдельной странице её нет. */
export const captionShown = (style: Pick<InlinePhotoStyle, "page">) => !style.page;

// Мышь или палец: подсказку «потяните за уголок в превью» видят только с мышью (на телефоне уголка нет).
const finePointer = (onChange: () => void) => {
  const mq = window.matchMedia("(pointer: fine)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
const useFinePointer = () =>
  useSyncExternalStore(
    finePointer,
    () => window.matchMedia("(pointer: fine)").matches,
    () => false,
  );

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  label,
}: {
  value: T;
  options: { id: T; label: React.ReactNode; title?: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex rounded-xl bg-cream p-0.5", disabled && "opacity-50")}>
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          title={o.title}
          disabled={disabled}
          onClick={() => onChange(o.id)}
          className={cn(
            "flex h-8 flex-1 items-center justify-center rounded-[10px] px-2 text-xs whitespace-nowrap transition max-sm:h-10",
            value === o.id ? "bg-white font-medium text-ink shadow-sm" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, aside }: { label: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted">
        <span>{label}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** Кадр: исходное фото целиком, светлая рамка — то, что попадёт в книгу; щелчок задаёт точку фокуса. */
function FocusPicker({ photo, style, onChange, disabled }: { photo: InspectorPhoto; style: InlinePhotoStyle; onChange: (p: Partial<InlinePhotoStyle>) => void; disabled?: boolean }) {
  const r = cropRect(photo, style);
  const cropped = style.aspect !== "original";
  const set = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !cropped) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onChange({
      focusX: Math.round(((e.clientX - rect.left) / rect.width) * 100) / 100,
      focusY: Math.round(((e.clientY - rect.top) / rect.height) * 100) / 100,
    });
  };
  return (
    <div className="flex justify-center rounded-2xl bg-ink/[.04] p-3">
      <div
        className={cn("relative overflow-hidden rounded-lg select-none", cropped && !disabled && "cursor-crosshair touch-none")}
        style={{ aspectRatio: `${photo.width} / ${photo.height}`, height: photo.width >= photo.height ? undefined : "14rem", width: photo.width >= photo.height ? "100%" : undefined }}
        onPointerDown={(e) => {
          if (!cropped || disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          set(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons) set(e);
        }}
        data-testid="focus-picker"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />
        {cropped ? (
          <>
            <div
              className="pointer-events-none absolute rounded-sm ring-2 ring-white"
              style={{
                left: `${(r.left / photo.width) * 100}%`,
                top: `${(r.top / photo.height) * 100}%`,
                width: `${(r.width / photo.width) * 100}%`,
                height: `${(r.height / photo.height) * 100}%`,
                boxShadow: "0 0 0 9999px rgba(20,16,14,.55)",
              }}
            />
            <div
              className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-wine shadow"
              style={{ left: `${style.focusX * 100}%`, top: `${style.focusY * 100}%` }}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Фото на отдельной странице, как его напечатают: «целиком, с полями» — снимок вписан в лист; «до краёв» — рамка
 * листа (с вылетами под обрез, pageFrame), в которой снимок двигают пальцем и приближают — это кадр photos.crop.
 */
function PageFrame({ photo, format, contain, onCrop, disabled }: { photo: InspectorPhoto; format: string; contain: boolean; onCrop?: (crop: PhotoCrop | null) => void; disabled?: boolean }) {
  const t = useMessages().editor;
  const ratio = pageFrame(getFormat(format)).ratio;
  const [width] = useState(() => frameWidth(ratio, 220));
  const [draft, setDraft] = useState<PhotoCrop | null>(null);
  const crop = draft ?? fillFocus(photo);
  if (contain || !onCrop)
    return (
      <div className="flex justify-center rounded-2xl bg-ink/[.04] p-3">
        <div className="relative overflow-hidden rounded-[4px] bg-white ring-1 ring-line" style={{ width, aspectRatio: String(ratio) }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- фото клиента на листе */}
          <img src={photo.url} alt="" draggable={false} className={cn("absolute inset-0 size-full", contain ? "object-contain" : "object-cover")} />
        </div>
      </div>
    );
  const commit = (c: PhotoCrop) => {
    onCrop(c);
    setDraft(null);
  };
  return (
    <div className="space-y-3 rounded-2xl bg-ink/[.04] p-3">
      <div className="flex justify-center">
        <PanFrame photo={photo} crop={crop} ratio={ratio} mask="rect" width={width} onChange={setDraft} onCommit={commit} disabled={disabled} />
      </div>
      <p className="text-center text-[11px] text-muted">{t.answerPhoto.pageCropHint}</p>
      <ZoomSlider value={crop.zoom} disabled={disabled} onChange={(zoom) => setDraft({ ...crop, zoom: Math.round(zoom * 100) / 100 })} onCommit={() => (draft ? commit(draft) : undefined)} />
      {photo.crop ? (
        <button type="button" disabled={disabled} onClick={() => onCrop(null)} className="flex h-10 items-center gap-1.5 rounded-full px-3 text-sm text-muted hover:bg-cream hover:text-ink">
          <RotateCcw className="size-4" /> {t.crop.reset}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Настройка фото в ответе (S7): как стоит — в тексте или на отдельной странице; у отдельной страницы — «целиком» или
 * «до краёв» с кадром в рамке листа; у фото в тексте — размер словами, выравнивание, форма, рамка и подпись (подпись —
 * только там, где она печатается, R10). Ниже — повернуть, сбросить вид, перенести в другое место книги, убрать из ответа.
 */
export function PhotoInspector({
  photo,
  answer,
  editable,
  onChange,
  onCaption,
  onRotate,
  onRemove,
  onClose,
  format = "a5",
  blank = false,
  onCrop,
  onMove,
  badge,
}: {
  photo: InspectorPhoto;
  answer: string;
  editable: boolean;
  onChange: (patch: Partial<InlinePhotoStyle>) => void;
  onCaption: (caption: string) => void;
  onRotate: () => Promise<void>;
  onRemove: () => void;
  onClose: () => void;
  /** Формат книги (id из lib/book/formats): рамка листа и обрезка на отдельной странице. */
  format?: string;
  /** Своя книга: «раздел» вместо «ответ». */
  blank?: boolean;
  /** Кадр фото на отдельной странице (photos.crop); без него рамку листа не двигают. */
  onCrop?: (crop: PhotoCrop | null) => void;
  /** «Перенести…» — лист «Где стоит фото». */
  onMove?: () => void;
  /** Подпись места фото в книге (PlaceBadge) — под заголовком. */
  badge?: ReactNode;
}) {
  const m = useMessages();
  const t = m.editor.inspector;
  const a = m.editor.answerPhoto;
  const fine = useFinePointer();
  const aspects = aspectIds.map((id) => ({ id, label: id === "original" ? a.shapes.original : id === "1:1" ? a.shapes.square : id }));
  const style = normalizeStyle(photo.inline);
  const paragraphs = splitParagraphs(answer);
  const [rotating, setRotating] = useState(false);
  // Позиции: -1 (перед текстом), 0…n-2 (после абзаца), null (в конце).
  const positions: (number | null)[] = paragraphs.length ? [-1, ...paragraphs.slice(0, -1).map((_, i) => i), null] : [null];
  const current = style.anchor === null || style.anchor >= paragraphs.length - 1 ? null : style.anchor;
  const pos = Math.max(0, positions.indexOf(current));
  const posLabel = (p: number | null) => {
    if (p === null) return t.atEnd;
    if (p < 0) return t.beforeText;
    return t.afterParagraph(p + 1, paragraphs[p].split(/\s+/).slice(0, 5).join(" "));
  };
  const page = !!style.page;
  const contain = style.pageFit === "contain";
  const loss = pageLoss(photo, format);

  return (
    <div className="space-y-4 rounded-3xl border border-line bg-white p-4 shadow-[0_10px_30px_-18px_rgba(0,0,0,.35)] sm:p-5" data-testid="photo-inspector">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{blank ? a.titleBlank : a.title}</div>
          {badge}
        </div>
        <button type="button" onClick={onClose} className="-mt-1.5 -mr-1.5 flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-cream hover:text-ink" aria-label={t.close}>
          <X className="size-4" />
        </button>
      </div>

      <fieldset disabled={!editable} className="min-w-0 space-y-4">
        <Field label={a.how}>
          <Segmented<"text" | "page">
            label={a.how}
            value={page ? "page" : "text"}
            onChange={(v) => (v === "page" ? (page ? undefined : onChange(pageModePatch(photo, format))) : onChange({ page: false }))}
            options={[
              { id: "text", label: a.inText },
              { id: "page", label: a.onPage },
            ]}
          />
        </Field>

        {page ? (
          <>
            <div role="radiogroup" aria-label={a.onPage} className="grid grid-cols-2 gap-1 rounded-xl bg-cream/70 p-1 text-xs">
              {(["contain", "fill"] as const).map((fit) => {
                const on = fit === "contain" ? contain : !contain;
                return (
                  <button
                    key={fit}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => onChange({ pageFit: fit === "contain" ? "contain" : undefined })}
                    className={cn("min-h-11 rounded-lg px-2 py-2 leading-snug font-medium transition", on ? "bg-white shadow-soft" : "text-muted hover:text-ink")}
                  >
                    {a.fit[fit]}
                  </button>
                );
              })}
            </div>
            {contain && loss >= CONTAIN_LOSS ? <p className="text-xs leading-snug text-muted">{a.autoContain}</p> : null}
            <PageFrame key={photo.id} photo={photo} format={format} contain={contain} onCrop={onCrop} disabled={!editable} />
            {!contain && loss >= WARN_LOSS ? (
              <p className="text-xs leading-snug font-medium text-amber-700" data-testid="page-loss">
                {a.loss(Math.round(loss * 100))}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <FocusPicker photo={photo} style={style} onChange={onChange} disabled={!editable} />
            <p className="-mt-2 text-center text-[11px] text-muted">{style.aspect === "original" ? a.originalHint : a.focusHint}</p>

            <Field label={a.size} aside={<span>{a.sizes[sizeWord(style.width)]}</span>}>
              <div role="radiogroup" aria-label={a.size} className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {sizes.map((s) => (
                  <button
                    key={s.w}
                    type="button"
                    role="radio"
                    aria-checked={style.width === s.w}
                    onClick={() => onChange({ width: s.w })}
                    className={cn("min-h-11 rounded-xl px-2 text-xs font-medium transition sm:min-h-9", style.width === s.w ? "bg-ink text-white" : "bg-cream text-muted hover:text-ink")}
                  >
                    {a.sizes[s.id]}
                  </button>
                ))}
              </div>
              <input
                type="range"
                min={25}
                max={100}
                step={1}
                value={style.width}
                onChange={(e) => onChange({ width: Number(e.target.value) })}
                aria-label={t.sizeAria}
                className="mt-2 h-2 w-full accent-[var(--color-wine)]"
              />
              <p className="mt-1 text-[11px] text-muted">
                {a.sizeHintRow}
                {fine ? ` ${a.sizeHintDrag}` : ""}
              </p>
            </Field>

            <Field label={t.align}>
              <Segmented
                label={t.align}
                value={style.align}
                disabled={style.width === 100}
                onChange={(align) => onChange({ align })}
                options={[
                  { id: "left", label: <AlignLeft className="size-4" />, title: t.alignLeft },
                  { id: "center", label: <AlignCenter className="size-4" />, title: t.alignCenter },
                  { id: "right", label: <AlignRight className="size-4" />, title: t.alignRight },
                ]}
              />
            </Field>
          </>
        )}

        <Field
          label={t.place}
          aside={
            fine ? (
              <span className="flex items-center gap-1 text-[11px] font-normal">
                <Move className="size-3" /> {t.placeDrag}
              </span>
            ) : null
          }
        >
          <div className="flex gap-1.5">
            <select
              value={String(pos)}
              onChange={(e) => onChange({ anchor: positions[Number(e.target.value)] })}
              aria-label={t.placeAria}
              className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-2 text-sm sm:h-9"
            >
              {positions.map((p, i) => (
                <option key={i} value={i}>
                  {posLabel(p)}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={pos === 0}
              onClick={() => onChange({ anchor: positions[pos - 1] })}
              className="flex size-11 items-center justify-center rounded-xl border border-line hover:bg-cream disabled:opacity-40 sm:size-9"
              aria-label={t.upAria}
              title={t.up}
            >
              <ChevronUp className="size-4" />
            </button>
            <button
              type="button"
              disabled={pos === positions.length - 1}
              onClick={() => onChange({ anchor: positions[pos + 1] })}
              className="flex size-11 items-center justify-center rounded-xl border border-line hover:bg-cream disabled:opacity-40 sm:size-9"
              aria-label={t.downAria}
              title={t.down}
            >
              <ChevronDown className="size-4" />
            </button>
          </div>
        </Field>

        {page ? null : (
          <>
            <Field label={a.shape}>
              <Segmented label={a.shape} value={style.aspect} onChange={(aspect) => onChange({ aspect })} options={aspects} />
            </Field>

            <Field label={a.frame}>
              <div role="radiogroup" aria-label={a.frame} className="grid grid-cols-4 gap-1.5">
                {frameIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={style.frame === id}
                    onClick={() => onChange({ frame: id })}
                    className={cn("flex flex-col items-center gap-1.5 rounded-xl border p-2 text-[11px] leading-tight transition", style.frame === id ? "border-ink bg-cream/60 text-ink" : "border-line text-muted hover:border-ink/40")}
                  >
                    <span
                      className={cn(
                        "block h-7 w-9 bg-gradient-to-br from-[#c9b8a6] to-[#8c7a6b]",
                        id === "line" && "outline outline-1 outline-offset-2 outline-ink",
                        id === "polaroid" && "border-[3px] border-b-[8px] border-white shadow ring-1 ring-line",
                        id === "round" && "rounded-md",
                      )}
                    />
                    {a.frames[id]}
                  </button>
                ))}
              </div>
            </Field>
          </>
        )}

        {captionShown(style) ? (
          <Field label={style.frame === "polaroid" ? a.captionPolaroid : a.caption}>
            <input
              value={photo.caption}
              onChange={(e) => onCaption(e.target.value)}
              placeholder={t.captionPlaceholder}
              maxLength={200}
              className="h-11 w-full rounded-xl border border-line px-3 text-sm outline-none focus:border-ink/40 sm:h-9"
            />
          </Field>
        ) : (
          <p className="text-xs text-muted" data-testid="caption-off">
            {a.captionOff}
          </p>
        )}

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <button
            type="button"
            onClick={async () => {
              setRotating(true);
              try {
                await onRotate();
              } finally {
                setRotating(false);
              }
            }}
            disabled={rotating}
            className="flex h-11 items-center gap-1.5 rounded-full border border-line px-3.5 text-sm hover:bg-cream sm:h-9"
          >
            {rotating ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
            {a.rotate}
          </button>
          <button
            type="button"
            onClick={() => onChange({ width: 100, align: "center", aspect: "original", focusX: 0.5, focusY: 0.5, frame: "none", page: false })}
            className="flex h-11 items-center gap-1.5 rounded-full border border-line px-3.5 text-sm hover:bg-cream sm:h-9"
          >
            <RotateCcw className="size-4" />
            {a.reset}
          </button>
          {onMove ? (
            <button type="button" onClick={onMove} className="flex h-11 items-center gap-1.5 rounded-full border border-line px-3.5 text-sm hover:bg-cream sm:h-9">
              <ArrowRightLeft className="size-4" />
              {a.move}
            </button>
          ) : null}
          <button type="button" onClick={onRemove} className="ml-auto flex h-11 items-center rounded-full px-3.5 text-sm text-muted hover:bg-red-50 hover:text-red-700 sm:h-9">
            {blank ? a.removeBlank : a.remove}
          </button>
        </div>
      </fieldset>
    </div>
  );
}
