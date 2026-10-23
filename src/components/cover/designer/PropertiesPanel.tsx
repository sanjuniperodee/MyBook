"use client";

/**
 * Свойства выбранного слоя — по его виду: текст (шрифт, кегль, интервалы, выключка, тень, контур, подложка),
 * фото (снимок, кадр, форма, окантовка, ч/б, тонирование), фигура (вид, заливка, градиент, обводка) и декор (мотив,
 * цвет); у всех — непрозрачность, поворот, место и размер в миллиметрах. Без выбранного слоя — фон обложки.
 */
import { AlertTriangle, Crop, Expand, Link2Off } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { ColorField, NumberField, PanelSection, Segmented, Toggle } from "@/components/design/controls";
import { FaceControls, FontPicker } from "@/components/design/FontPicker";
import {
  COVER_LIMITS,
  DECOR_IDS,
  decorDrawing,
  layerText,
  shapeElements,
  type CoverBackground,
  type CoverDesign,
  type CoverLayer,
  type CoverTexts,
  type DecorLayer,
  type ImageLayer,
  type ShapeKind,
  type ShapeLayer,
  type TextBind,
  type TextLayer,
  type TextStyle,
} from "@/lib/book/cover-design";
import { normalizeFrame, zoomFrame } from "@/lib/book/photo-frame";
import { ShapeElement } from "@/components/interior/graphics";
import { cn } from "@/lib/class-names";
import { coverBox, effectiveDpi } from "./logic";
import { PhotoSource } from "./PhotoSource";

/** 1 мм в пунктах. */
const PT_PER_MM = 72 / 25.4;
/** Ниже этого разрешения снимок в печати мягкий. */
const MIN_DPI = 200;

export const COVER_SWATCHES = ["#1F1A17", "#FFFFFF", "#FBF7F1", "#7A1F2B", "#B8925A", "#F3D9A4", "#2B1B2E", "#1F3A5F", "#7D8B6A", "#D9466E"];

type Patch = (fn: (l: CoverLayer) => CoverLayer, field: string) => void;

export interface PropertiesProps {
  layer: CoverLayer | null;
  design: CoverDesign;
  texts: CoverTexts;
  board: { w: number; h: number };
  bookId: string;
  bookPhotos: { id: string; width: number; height: number }[];
  swatches: string[];
  patch: Patch;
  setBackground: (bg: CoverBackground, field: string) => void;
  onBookText: (bind: TextBind, value: string) => void;
  onCrop: (id: string) => void;
}

export function PropertiesPanel(props: PropertiesProps) {
  const t = useMessages().design.cover.props;
  const { layer } = props;
  if (!layer)
    return (
      <div className="space-y-5">
        <p className="text-sm text-muted">{t.nothing}</p>
        <BackgroundPanel {...props} />
      </div>
    );
  return (
    <div className="space-y-5">
      {layer.kind === "text" ? <TextPanel {...props} layer={layer} /> : null}
      {layer.kind === "image" ? <ImagePanel {...props} layer={layer} /> : null}
      {layer.kind === "shape" ? <ShapePanel {...props} layer={layer} /> : null}
      {layer.kind === "decor" ? <DecorPanel {...props} layer={layer} /> : null}
      <GeometryPanel {...props} layer={layer} />
    </div>
  );
}

// ─── текст ─────────────────────────────────────────────────────────────────

function TextPanel({ layer, texts, board, patch, swatches, onBookText }: PropertiesProps & { layer: TextLayer }) {
  const m = useMessages().design.cover;
  const t = m.props.text;
  const s = layer.style;
  const text = layerText(layer, texts);
  const style = (p: Partial<TextStyle>, field: string) => patch((l) => ({ ...(l as TextLayer), style: { ...(l as TextLayer).style, ...p } }), field);
  const sizePt = s.size * board.w * PT_PER_MM;
  return (
    <>
      <PanelSection title={t.title}>
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-ink-soft" htmlFor={`txt-${layer.id}`}>
            {t.content}
          </label>
          <textarea
            id={`txt-${layer.id}`}
            className="input min-h-20 text-sm"
            rows={3}
            maxLength={COVER_LIMITS.text}
            value={text}
            onChange={(e) => (layer.bind ? onBookText(layer.bind, e.target.value) : patch((l) => ({ ...(l as TextLayer), text: e.target.value }), "text"))}
          />
          {layer.bind ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span>{t.linked(m.layers.binds[layer.bind])}</span>
              <button type="button" className="inline-flex items-center gap-1 text-wine hover:underline" onClick={() => patch((l) => ({ ...(l as TextLayer), bind: undefined, text }), "unbind")}>
                <Link2Off className="size-3.5" /> {t.unlink}
              </button>
            </div>
          ) : null}
        </div>
        <FontPicker label={t.font} value={s.font} sample={text || undefined} onChange={(font) => style({ font }, "font")} />
        <FaceControls font={s.font} weight={s.weight} italic={s.italic} onChange={(v) => style({ ...(v.weight !== undefined ? { weight: v.weight } : {}), ...(v.italic !== undefined ? { italic: v.italic || undefined } : {}) }, "face")} />
        <div className="flex flex-wrap gap-2">
          <ToggleChip active={!!s.upper} onClick={() => style({ upper: !s.upper || undefined }, "upper")}>
            {t.upper}
          </ToggleChip>
          <ToggleChip active={!!s.underline} onClick={() => style({ underline: !s.underline || undefined }, "underline")}>
            <span className="underline">{t.underline}</span>
          </ToggleChip>
        </div>
        <NumberField
          label={t.size}
          unit={m.props.pt}
          value={Math.round(sizePt * 2) / 2}
          min={Math.ceil(COVER_LIMITS.fontSize[0] * board.w * PT_PER_MM)}
          max={Math.floor(COVER_LIMITS.fontSize[1] * board.w * PT_PER_MM)}
          step={0.5}
          onChange={(pt) => style({ size: Math.round((pt / PT_PER_MM / board.w) * 10000) / 10000 }, "size")}
        />
        <ColorField label={t.color} value={s.color} swatches={swatches} onChange={(c) => c && style({ color: c }, "color")} />
        <NumberField label={t.tracking} value={s.tracking ?? 0} min={-0.1} max={0.8} step={0.01} scale={100} unit="%" onChange={(v) => style({ tracking: v || undefined }, "tracking")} />
        <NumberField label={t.lineHeight} value={s.lineHeight ?? 1.2} min={0.7} max={2.5} step={0.05} onChange={(v) => style({ lineHeight: v }, "lineHeight")} />
        <Segmented label={t.align} value={s.align} options={(["left", "center", "right"] as const).map((v) => ({ value: v, label: t.aligns[v] }))} onChange={(align) => style({ align }, "align")} />
        <Segmented label={t.valign} value={s.valign} options={(["top", "middle", "bottom"] as const).map((v) => ({ value: v, label: t.valigns[v] }))} onChange={(valign) => style({ valign }, "valign")} />
      </PanelSection>
      <PanelSection title={t.effects}>
        <p className="text-xs text-muted">{t.effectsNote}</p>
        <Toggle label={t.shadow} checked={!!s.shadow} onChange={(on) => style({ shadow: on ? { color: "#000000", x: 0.04, y: 0.05, opacity: 0.5 } : undefined }, "shadow")} />
        {s.shadow ? (
          <div className="space-y-3 border-l-2 border-line pl-3">
            <ColorField label={t.color} value={s.shadow.color} swatches={["#000000", "#FFFFFF", ...swatches]} onChange={(c) => c && style({ shadow: { ...s.shadow!, color: c } }, "shadowColor")} />
            <NumberField label={t.shadowX} value={s.shadow.x} min={-0.3} max={0.3} step={0.01} scale={100} unit="%" onChange={(x) => style({ shadow: { ...s.shadow!, x } }, "shadowX")} />
            <NumberField label={t.shadowY} value={s.shadow.y} min={-0.3} max={0.3} step={0.01} scale={100} unit="%" onChange={(y) => style({ shadow: { ...s.shadow!, y } }, "shadowY")} />
            <NumberField label={m.props.opacity} value={s.shadow.opacity ?? 1} min={0} max={1} step={0.05} scale={100} unit="%" onChange={(opacity) => style({ shadow: { ...s.shadow!, opacity } }, "shadowOpacity")} />
          </div>
        ) : null}
        <Toggle label={t.outline} checked={!!s.outline} onChange={(on) => style({ outline: on ? { color: "#FFFFFF", width: 0.04 } : undefined }, "outline")} />
        {s.outline ? (
          <div className="space-y-3 border-l-2 border-line pl-3">
            <ColorField label={t.color} value={s.outline.color} swatches={["#FFFFFF", "#000000", ...swatches]} onChange={(c) => c && style({ outline: { ...s.outline!, color: c } }, "outlineColor")} />
            <NumberField label={t.outlineWidth} value={s.outline.width} min={0.005} max={0.12} step={0.005} scale={100} unit="%" onChange={(width) => style({ outline: { ...s.outline!, width } }, "outlineWidth")} />
          </div>
        ) : null}
        <Toggle label={t.plate} checked={!!s.plate} onChange={(on) => style({ plate: on ? { color: "#FFFFFF", opacity: 0.85, radius: 0.01, pad: 0.4 } : undefined }, "plate")} />
        {s.plate ? (
          <div className="space-y-3 border-l-2 border-line pl-3">
            <ColorField label={t.color} value={s.plate.color} swatches={["#FFFFFF", "#000000", ...swatches]} onChange={(c) => c && style({ plate: { ...s.plate!, color: c } }, "plateColor")} />
            <NumberField label={m.props.opacity} value={s.plate.opacity} min={0} max={1} step={0.05} scale={100} unit="%" onChange={(opacity) => style({ plate: { ...s.plate!, opacity } }, "plateOpacity")} />
            <NumberField label={t.plateRadius} value={(s.plate.radius ?? 0) * board.w} min={0} max={0.2 * board.w} step={0.5} unit={m.props.mm} onChange={(mm) => style({ plate: { ...s.plate!, radius: Math.round((mm / board.w) * 10000) / 10000 } }, "plateRadius")} />
            <NumberField label={t.platePad} value={s.plate.pad ?? 0} min={0} max={2} step={0.05} unit="em" onChange={(pad) => style({ plate: { ...s.plate!, pad } }, "platePad")} />
          </div>
        ) : null}
      </PanelSection>
    </>
  );
}

function ToggleChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cn("h-9 rounded-xl border px-3 text-sm transition", active ? "border-wine bg-rose/60 text-wine" : "border-line bg-white text-ink-soft hover:border-ink/30")}>
      {children}
    </button>
  );
}

// ─── фото ──────────────────────────────────────────────────────────────────

function ImagePanel({ layer, board, bookId, bookPhotos, patch, swatches, onCrop }: PropertiesProps & { layer: ImageLayer }) {
  const m = useMessages().design.cover;
  const t = m.props.image;
  const frame = normalizeFrame(layer.frame);
  const photo = layer.photoId ? bookPhotos.find((p) => p.id === layer.photoId) : null;
  const dpi = photo ? effectiveDpi(photo, { w: layer.w * board.w, h: layer.h * board.h }, frame.zoom) : 0;
  const set = (p: Partial<ImageLayer>, field: string) => patch((l) => ({ ...(l as ImageLayer), ...p }), field);
  return (
    <PanelSection title={t.title}>
      {!layer.photoId && !layer.stock ? <p className="text-sm text-muted">{t.empty}</p> : null}
      {photo && dpi && dpi < MIN_DPI ? (
        <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="size-4 shrink-0" /> {t.lowRes(dpi)}
        </p>
      ) : null}
      <PhotoSource bookId={bookId} bookPhotos={bookPhotos} selected={{ photoId: layer.photoId ?? null, stock: layer.stock ?? null }} onPick={(src) => set({ photoId: src.photoId ?? null, stock: src.stock ?? null, frame: undefined }, "source")} compact />
      {layer.photoId || layer.stock ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => onCrop(layer.id)}>
              <Crop className="size-4" /> {t.crop}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!layer.frame} onClick={() => set({ frame: undefined }, "frame")}>
              {t.resetFrame}
            </button>
          </div>
          <NumberField label={t.zoom} value={frame.zoom} min={1} max={4} step={0.05} scale={100} unit="%" onChange={(zoom) => set({ frame: zoomFrame(frame, zoom) }, "zoom")} />
        </div>
      ) : null}
      <Segmented label={t.mask} value={layer.mask ?? "rect"} options={(["rect", "rounded", "circle", "arch"] as const).map((v) => ({ value: v, label: t.masks[v] }))} onChange={(mask) => set({ mask }, "mask")} wrap />
      {layer.mask === "rounded" ? <NumberField label={t.radius} value={layer.radius ?? 0.08} min={0} max={0.5} step={0.01} scale={100} unit="%" onChange={(radius) => set({ radius }, "radius")} /> : null}
      <Toggle label={t.border} checked={!!layer.border} onChange={(on) => set({ border: on ? { color: "#FFFFFF", width: 0.01 } : undefined }, "border")} />
      {layer.border ? (
        <div className="space-y-3 border-l-2 border-line pl-3">
          <ColorField label={m.props.text.color} value={layer.border.color} swatches={["#FFFFFF", ...swatches]} onChange={(c) => c && set({ border: { ...layer.border!, color: c } }, "borderColor")} />
          <NumberField label={t.borderWidth} value={layer.border.width * board.w} min={0.2} max={COVER_LIMITS.border[1] * board.w} step={0.1} unit={m.props.mm} onChange={(mm) => set({ border: { ...layer.border!, width: Math.round((mm / board.w) * 10000) / 10000 } }, "borderWidth")} />
        </div>
      ) : null}
      <Toggle label={t.mono} checked={!!layer.mono} onChange={(mono) => set({ mono: mono || undefined }, "mono")} />
      <Toggle label={t.overlay} checked={!!layer.overlay} onChange={(on) => set({ overlay: on ? { color: "#000000", opacity: 0.3 } : undefined }, "overlay")} />
      {layer.overlay ? (
        <div className="space-y-3 border-l-2 border-line pl-3">
          <ColorField label={m.props.text.color} value={layer.overlay.color} swatches={["#000000", "#FFFFFF", ...swatches]} onChange={(c) => c && set({ overlay: { ...layer.overlay!, color: c } }, "overlayColor")} />
          <NumberField label={m.props.opacity} value={layer.overlay.opacity} min={0} max={1} step={0.05} scale={100} unit="%" onChange={(opacity) => set({ overlay: { ...layer.overlay!, opacity } }, "overlayOpacity")} />
        </div>
      ) : null}
    </PanelSection>
  );
}

// ─── фигура ────────────────────────────────────────────────────────────────

const SHAPES: ShapeKind[] = ["rect", "ellipse", "line", "frame", "double", "corners", "arch"];

function ShapePanel({ layer, board, patch, swatches }: PropertiesProps & { layer: ShapeLayer }) {
  const m = useMessages().design.cover;
  const t = m.props.shape;
  const set = (p: Partial<ShapeLayer>, field: string) => patch((l) => ({ ...(l as ShapeLayer), ...p }), field);
  const outlineOnly = layer.shape === "line" || layer.shape === "frame" || layer.shape === "double" || layer.shape === "corners";
  return (
    <PanelSection title={t.title}>
      <div>
        <div className="mb-1.5 text-[13px] font-medium text-ink-soft">{t.kind}</div>
        <div className="grid grid-cols-4 gap-1.5">
          {SHAPES.map((k) => (
            <button
              key={k}
              type="button"
              title={m.add.shapeNames[k]}
              aria-label={m.add.shapeNames[k]}
              aria-pressed={layer.shape === k}
              onClick={() => set({ shape: k, ...(k === "line" || k === "frame" || k === "double" || k === "corners" ? { stroke: layer.stroke ?? layer.fill ?? "#1F1A17", strokeWidth: layer.strokeWidth ?? 0.004 } : { fill: layer.fill ?? layer.stroke ?? "#B8925A" }) }, "shape")}
              className={cn("flex aspect-square items-center justify-center rounded-xl border bg-white p-2", layer.shape === k ? "border-wine ring-1 ring-wine" : "border-line hover:border-ink/30")}
            >
              <ShapeIcon shape={k} />
            </button>
          ))}
        </div>
      </div>
      {!outlineOnly ? (
        <>
          <ColorField label={t.fill} value={layer.fill ?? null} swatches={swatches} allowNone noneLabel={m.props.none} onChange={(fill) => set({ fill, ...(fill ? {} : { gradient: undefined }) }, "fill")} />
          {layer.fill ? (
            <>
              <Toggle label={t.gradient} checked={!!layer.gradient} onChange={(on) => set({ gradient: on ? { to: "#FFFFFF", angle: 90 } : undefined }, "gradient")} />
              {layer.gradient ? (
                <div className="space-y-3 border-l-2 border-line pl-3">
                  <ColorField label={t.gradientTo} value={layer.gradient.to} swatches={swatches} onChange={(c) => c && set({ gradient: { ...layer.gradient!, to: c } }, "gradientTo")} />
                  <NumberField label={t.angle} value={layer.gradient.angle} min={0} max={360} step={5} unit="°" onChange={(angle) => set({ gradient: { ...layer.gradient!, angle } }, "gradientAngle")} />
                </div>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
      <ColorField label={t.stroke} value={layer.stroke ?? null} swatches={swatches} allowNone={!outlineOnly} noneLabel={m.props.none} onChange={(stroke) => set({ stroke }, "stroke")} />
      {layer.stroke || outlineOnly ? (
        <NumberField label={t.strokeWidth} value={(layer.strokeWidth ?? 0.004) * board.w} min={0.1} max={COVER_LIMITS.stroke[1] * board.w} step={0.1} unit={m.props.mm} onChange={(mm) => set({ strokeWidth: Math.round((mm / board.w) * 10000) / 10000 }, "strokeWidth")} />
      ) : null}
      {layer.shape === "rect" || layer.shape === "frame" || layer.shape === "double" ? (
        <NumberField label={t.radius} value={layer.radius ?? 0} min={0} max={0.5} step={0.01} scale={100} unit="%" onChange={(radius) => set({ radius: radius || undefined }, "radius")} />
      ) : null}
    </PanelSection>
  );
}

/** Значок фигуры — та же фигура, что на обложке, в квадрате 26×26 с полями. */
export function ShapeIcon({ shape }: { shape: ShapeKind }) {
  const layer: ShapeLayer = { id: "i", kind: "shape", shape, x: 0, y: 0, w: 1, h: 1, fill: "#B8925A", stroke: "#3B332E", strokeWidth: 0.07 };
  return (
    <svg viewBox="0 0 32 32" className="size-full" aria-hidden>
      <g transform="translate(3,3)">
        {shapeElements(layer, 26, 26, 26).map((s, i) => (
          <ShapeElement key={i} s={s} />
        ))}
      </g>
    </svg>
  );
}

// ─── декор ─────────────────────────────────────────────────────────────────

function DecorPanel({ layer, patch, swatches }: PropertiesProps & { layer: DecorLayer }) {
  const m = useMessages().design.cover;
  const t = m.props.decor;
  return (
    <PanelSection title={t.title}>
      <div>
        <div className="mb-1.5 text-[13px] font-medium text-ink-soft">{t.motif}</div>
        <DecorGrid value={layer.motif} color={layer.color} onPick={(motif) => patch((l) => ({ ...(l as DecorLayer), motif }), "motif")} names={m.add.decorNames} />
      </div>
      <ColorField label={t.color} value={layer.color} swatches={swatches} onChange={(c) => c && patch((l) => ({ ...(l as DecorLayer), color: c }), "color")} />
      {layer.motif === "art" ? (
        <>
          <ColorField label={t.accent} value={layer.accent ?? layer.color} swatches={swatches} onChange={(c) => c && patch((l) => ({ ...(l as DecorLayer), accent: c }), "accent")} />
          <p className="text-xs text-muted">{t.artNote}</p>
        </>
      ) : null}
    </PanelSection>
  );
}

export function DecorGrid({ value, color = "#3B332E", onPick, names, cols = "grid-cols-5" }: { value?: DecorLayer["motif"]; color?: string; onPick: (m: DecorLayer["motif"]) => void; names: Record<string, string>; cols?: string }) {
  return (
    <div className={cn("grid gap-1.5", cols)}>
      {DECOR_IDS.map((id) => {
        const d = decorDrawing(id, color);
        return (
          <button
            key={id}
            type="button"
            title={names[id]}
            aria-label={names[id]}
            aria-pressed={value === id}
            onClick={() => onPick(id)}
            className={cn("flex aspect-square items-center justify-center rounded-xl border bg-white p-1.5 transition hover:-translate-y-px", value === id ? "border-wine ring-1 ring-wine" : "border-line hover:border-ink/30")}
          >
            <svg viewBox={`0 0 ${d.w} ${d.h}`} preserveAspectRatio="xMidYMid meet" className="size-full" aria-hidden>
              {d.shapes.map((s, i) => (
                <ShapeElement key={i} s={s} />
              ))}
            </svg>
          </button>
        );
      })}
    </div>
  );
}

// ─── место, размер, поворот ────────────────────────────────────────────────

function GeometryPanel({ layer, board, patch }: PropertiesProps & { layer: CoverLayer }) {
  const m = useMessages().design.cover;
  const t = m.props;
  const b = COVER_LIMITS.bleed;
  const mmField = (key: "x" | "y" | "w" | "h", label: string, min: number, max: number) => {
    const scale = key === "x" || key === "w" ? board.w : board.h;
    return (
      <NumberField
        key={key}
        label={label}
        slider={false}
        value={Math.round(layer[key] * scale * 10) / 10}
        min={Math.round(min * scale * 10) / 10}
        max={Math.round(max * scale * 10) / 10}
        step={0.5}
        unit={t.mm}
        onChange={(mm) => patch((l) => ({ ...l, [key]: Math.round((mm / scale) * 10000) / 10000 }), `geo-${key}`)}
      />
    );
  };
  return (
    <PanelSection title={t.position}>
      <NumberField label={t.opacity} value={layer.opacity ?? 1} min={0} max={1} step={0.05} scale={100} unit={t.pct} onChange={(opacity) => patch((l) => ({ ...l, opacity: opacity === 1 ? undefined : opacity }), "opacity")} />
      <NumberField label={t.rotate} value={layer.rotate ?? 0} min={-180} max={180} step={1} unit={t.deg} onChange={(rotate) => patch((l) => ({ ...l, rotate: rotate || undefined }), "rotate")} />
      <div className="grid grid-cols-2 gap-3">
        {mmField("x", t.x, -b, 1 + b)}
        {mmField("y", t.y, -b, 1 + b)}
        {mmField("w", t.w, COVER_LIMITS.minSize, COVER_LIMITS.maxSize)}
        {mmField("h", t.h, COVER_LIMITS.minSize, COVER_LIMITS.maxSize)}
      </div>
      {layer.kind === "image" || layer.kind === "shape" ? (
        <button type="button" className="btn btn-outline btn-sm" onClick={() => patch((l) => ({ ...l, ...coverBox(), rotate: undefined }), "cover")}>
          <Expand className="size-4" /> {t.cover}
        </button>
      ) : null}
    </PanelSection>
  );
}

// ─── фон ───────────────────────────────────────────────────────────────────

function BackgroundPanel({ design, setBackground, swatches }: PropertiesProps) {
  const t = useMessages().design.cover.props.background;
  const bg = design.background;
  const base = bg.kind === "color" ? bg.color : bg.kind === "gradient" ? bg.from : "#F4EEE6";
  return (
    <PanelSection title={t.title}>
      <Segmented
        value={bg.kind}
        options={(["template", "color", "gradient"] as const).map((k) => ({ value: k, label: t.kinds[k] }))}
        onChange={(kind) =>
          setBackground(kind === "template" ? { kind } : kind === "color" ? { kind, color: base } : { kind, from: base, to: bg.kind === "gradient" ? bg.to : "#D9C7B3", angle: bg.kind === "gradient" ? bg.angle : 120 }, "bgKind")
        }
        wrap
      />
      {bg.kind === "template" ? <p className="text-xs text-muted">{t.templateNote}</p> : null}
      {bg.kind === "color" ? <ColorField label={t.color} value={bg.color} swatches={[...swatches, "#F4EEE6", "#141414", "#E9DCCB"]} onChange={(c) => c && setBackground({ kind: "color", color: c }, "bgColor")} /> : null}
      {bg.kind === "gradient" ? (
        <>
          <ColorField label={t.from} value={bg.from} swatches={swatches} onChange={(c) => c && setBackground({ ...bg, from: c }, "bgFrom")} />
          <ColorField label={t.to} value={bg.to} swatches={swatches} onChange={(c) => c && setBackground({ ...bg, to: c }, "bgTo")} />
          <NumberField label={t.angle} value={bg.angle} min={0} max={360} step={5} unit="°" onChange={(angle) => setBackground({ ...bg, angle }, "bgAngle")} />
        </>
      ) : null}
    </PanelSection>
  );
}
