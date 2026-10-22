"use client";

/** Добавить на обложку: текст (заголовок, подзаголовок, текст, надпись от руки), фото, фигуры и декор. */
import { useMessages } from "@/i18n/client";
import { PanelSection } from "@/components/design/controls";
import { cssFont } from "@/lib/book/fonts";
import type { DecorId, ShapeKind } from "@/lib/book/cover-design";
import { cn } from "@/lib/class-names";
import type { TextPreset } from "./logic";
import { DecorGrid, ShapeIcon } from "./PropertiesPanel";
import { PhotoSource } from "./PhotoSource";

const PRESET_LOOK: Record<TextPreset, { font: Parameters<typeof cssFont>[0]; className: string }> = {
  heading: { font: "prata", className: "text-2xl" },
  subheading: { font: "cormorantsc", className: "text-sm font-semibold tracking-[0.2em] uppercase" },
  body: { font: "lora", className: "text-[15px]" },
  script: { font: "caveat", className: "text-2xl" },
};

const SHAPES: ShapeKind[] = ["rect", "ellipse", "line", "frame", "double", "corners", "arch"];

export function AddPanel({
  bookId,
  bookPhotos,
  disabled,
  onText,
  onImage,
  onShape,
  onDecor,
}: {
  bookId: string;
  bookPhotos: { id: string; width: number; height: number }[];
  disabled: boolean;
  onText: (preset: TextPreset) => void;
  onImage: (src: { photoId?: string; stock?: string; aspect: number }) => void;
  onShape: (shape: ShapeKind) => void;
  onDecor: (motif: DecorId) => void;
}) {
  const t = useMessages().design.cover.add;
  return (
    <div className={cn("space-y-5", disabled && "pointer-events-none opacity-50")}>
      {disabled ? <p className="text-xs text-muted">{t.limit}</p> : null}
      <PanelSection title={t.text}>
        <div className="grid gap-2">
          {(Object.keys(PRESET_LOOK) as TextPreset[]).map((p) => (
            <button key={p} type="button" onClick={() => onText(p)} className="rounded-xl border border-line bg-white px-3 py-2.5 text-left transition hover:border-wine/40 hover:bg-cream/40">
              <span className={PRESET_LOOK[p].className} style={{ fontFamily: cssFont(PRESET_LOOK[p].font) }}>
                {t.presets[p]}
              </span>
            </button>
          ))}
        </div>
      </PanelSection>
      <PanelSection title={t.photo}>
        <PhotoSource bookId={bookId} bookPhotos={bookPhotos} onPick={onImage} />
      </PanelSection>
      <PanelSection title={t.shapes}>
        <div className="grid grid-cols-4 gap-1.5">
          {SHAPES.map((k) => (
            <button key={k} type="button" title={t.shapeNames[k]} aria-label={t.shapeNames[k]} onClick={() => onShape(k)} className="flex aspect-square items-center justify-center rounded-xl border border-line bg-white p-2 transition hover:border-wine/40">
              <ShapeIcon shape={k} />
            </button>
          ))}
        </div>
      </PanelSection>
      <PanelSection title={t.decor}>
        <DecorGrid onPick={onDecor} names={t.decorNames} />
      </PanelSection>
    </div>
  );
}
