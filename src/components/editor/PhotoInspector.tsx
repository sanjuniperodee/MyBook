"use client";

import { AlignCenter, AlignLeft, AlignRight, ChevronDown, ChevronUp, LoaderCircle, Move, RotateCcw, RotateCw, X } from "lucide-react";
import { useState } from "react";
import { cropRect, normalizeStyle, splitParagraphs } from "@/lib/book/inline-photo";
import type { InlinePhotoStyle } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { useMessages } from "@/i18n/client";

export interface InspectorPhoto {
  id: string;
  url: string;
  width: number;
  height: number;
  caption: string;
  inline?: InlinePhotoStyle | null;
}

const aspectIds: InlinePhotoStyle["aspect"][] = ["original", "1:1", "4:3", "3:4", "16:9"];
const frameIds: InlinePhotoStyle["frame"][] = ["none", "line", "polaroid", "round"];

const sizes = [
  { w: 33, label: "S" },
  { w: 50, label: "M" },
  { w: 75, label: "L" },
  { w: 100, label: "XL" },
];

function Segmented<T extends string | number>({
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
            "flex h-8 flex-1 items-center justify-center rounded-[10px] px-2 text-xs whitespace-nowrap transition",
            value === o.id ? "bg-white font-medium text-ink shadow-sm" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children, aside }: { label: string; children: React.ReactNode; aside?: React.ReactNode }) {
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
        className={cn("relative overflow-hidden rounded-lg select-none", cropped && !disabled && "cursor-crosshair")}
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

export function PhotoInspector({
  photo,
  answer,
  editable,
  onChange,
  onCaption,
  onRotate,
  onRemove,
  onClose,
}: {
  photo: InspectorPhoto;
  answer: string;
  editable: boolean;
  onChange: (patch: Partial<InlinePhotoStyle>) => void;
  onCaption: (caption: string) => void;
  onRotate: () => Promise<void>;
  onRemove: () => void;
  onClose: () => void;
}) {
  const t = useMessages().editor.inspector;
  const aspects = aspectIds.map((id) => ({ id, label: id === "original" ? t.aspectOriginal : id }));
  const frames = frameIds.map((id) => ({ id, label: t.frames[id] }));
  const style = normalizeStyle(photo.inline);
  const paragraphs = splitParagraphs(answer);
  const [rotating, setRotating] = useState(false);
  // Позиции: -1 (перед текстом), 0…n-2 (после абзаца), null (в конце).
  const positions: (number | null)[] = paragraphs.length ? [-1, ...paragraphs.slice(0, -1).map((_, i) => i), null] : [null];
  const current = style.anchor === null || style.anchor >= paragraphs.length - 1 ? null : style.anchor;
  const pos = Math.max(0, positions.indexOf(current));
  const posLabel = (a: number | null) => {
    if (a === null) return t.atEnd;
    if (a < 0) return t.beforeText;
    return t.afterParagraph(a + 1, paragraphs[a].split(/\s+/).slice(0, 5).join(" "));
  };

  return (
    <div className="space-y-4 rounded-3xl border border-line bg-white p-4 shadow-[0_10px_30px_-18px_rgba(0,0,0,.35)] sm:p-5" data-testid="photo-inspector">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{t.title}</div>
        <button type="button" onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-cream hover:text-ink" aria-label={t.close}>
          <X className="size-4" />
        </button>
      </div>

      <FocusPicker photo={photo} style={style} onChange={onChange} disabled={!editable} />
      <p className="-mt-2 text-center text-[11px] text-muted">
        {style.aspect === "original" ? t.cropHint : t.focusHint}
      </p>

      <fieldset disabled={!editable} className="space-y-4">
        <Field label={t.size} aside={<span className="tabular-nums">{t.width(style.width)}</span>}>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={25}
              max={100}
              step={1}
              value={style.width}
              onChange={(e) => onChange({ width: Number(e.target.value) })}
              aria-label={t.sizeAria}
              className="h-2 flex-1 accent-[var(--color-wine)]"
            />
            <div className="flex gap-1">
              {sizes.map((s) => (
                <button
                  key={s.w}
                  type="button"
                  onClick={() => onChange({ width: s.w })}
                  className={cn("h-7 w-8 rounded-lg text-[11px] font-medium", style.width === s.w ? "bg-ink text-white" : "bg-cream text-muted hover:text-ink")}
                  title={`${s.w}%`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1 text-[11px] text-muted">{t.sizeHint}</p>
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

        <Field
          label={t.place}
          aside={
            <span className="flex items-center gap-1 text-[11px] font-normal">
              <Move className="size-3" /> {t.placeDrag}
            </span>
          }
        >
          <div className="flex gap-1.5">
            <select
              value={String(pos)}
              onChange={(e) => onChange({ anchor: positions[Number(e.target.value)] })}
              aria-label={t.placeAria}
              className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-white px-2 text-sm"
            >
              {positions.map((a, i) => (
                <option key={i} value={i}>
                  {posLabel(a)}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={pos === 0}
              onClick={() => onChange({ anchor: positions[pos - 1] })}
              className="flex size-9 items-center justify-center rounded-xl border border-line hover:bg-cream disabled:opacity-40"
              aria-label={t.upAria}
              title={t.up}
            >
              <ChevronUp className="size-4" />
            </button>
            <button
              type="button"
              disabled={pos === positions.length - 1}
              onClick={() => onChange({ anchor: positions[pos + 1] })}
              className="flex size-9 items-center justify-center rounded-xl border border-line hover:bg-cream disabled:opacity-40"
              aria-label={t.downAria}
              title={t.down}
            >
              <ChevronDown className="size-4" />
            </button>
          </div>
        </Field>

        <Field label={t.aspect}>
          <Segmented label={t.aspect} value={style.aspect} onChange={(aspect) => onChange({ aspect })} options={aspects} />
        </Field>

        <Field label={t.frame}>
          <div role="radiogroup" aria-label={t.frame} className="grid grid-cols-4 gap-1.5">
            {frames.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={style.frame === f.id}
                onClick={() => onChange({ frame: f.id })}
                className={cn("flex flex-col items-center gap-1.5 rounded-xl border p-2 text-[11px] transition", style.frame === f.id ? "border-ink bg-cream/60 text-ink" : "border-line text-muted hover:border-ink/40")}
              >
                <span
                  className={cn(
                    "block h-7 w-9 bg-gradient-to-br from-[#c9b8a6] to-[#8c7a6b]",
                    f.id === "line" && "outline outline-1 outline-offset-2 outline-ink",
                    f.id === "polaroid" && "border-[3px] border-b-[8px] border-white shadow ring-1 ring-line",
                    f.id === "round" && "rounded-md",
                  )}
                />
                {f.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label={style.frame === "polaroid" ? t.captionPolaroid : t.caption}>
          <input
            value={photo.caption}
            onChange={(e) => onCaption(e.target.value)}
            placeholder={t.captionPlaceholder}
            maxLength={200}
            className="h-9 w-full rounded-xl border border-line px-3 text-sm outline-none focus:border-ink/40"
          />
        </Field>

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
            className="flex h-9 items-center gap-1.5 rounded-full border border-line px-3.5 text-sm hover:bg-cream"
          >
            {rotating ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
            {t.rotate}
          </button>
          <button
            type="button"
            onClick={() => onChange({ width: 100, align: "center", aspect: "original", focusX: 0.5, focusY: 0.5, frame: "none" })}
            className="flex h-9 items-center gap-1.5 rounded-full border border-line px-3.5 text-sm hover:bg-cream"
          >
            <RotateCcw className="size-4" />
            {t.reset}
          </button>
          <button type="button" onClick={onRemove} className="ml-auto flex h-9 items-center rounded-full px-3.5 text-sm text-muted hover:bg-red-50 hover:text-red-700">
            {t.remove}
          </button>
        </div>
      </fieldset>
    </div>
  );
}
