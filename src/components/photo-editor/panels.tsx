"use client";

/**
 * Панели редактора фото: что можно добавить (стили надписей, фигуры, кисть), кадр, свет и цвет, фильтры и свойства
 * выбранного слоя. На телефоне панель — под фото и короткая (свойства надписи разбиты на вкладки), на широком
 * экране — колонка справа со всем сразу.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  BringToFront,
  Copy,
  FlipHorizontal2,
  Highlighter,
  Italic,
  Pencil,
  Plus,
  RotateCcw,
  RotateCw,
  SendToBack,
  Trash2,
  TriangleAlert,
  WandSparkles,
} from "lucide-react";
import { useMessages } from "@/i18n/client";
import { fontFaces, fontKeys, fontWeights, cssFont, type FontKey } from "@/lib/book/fonts";
import {
  ADJUST_KEYS,
  ADJUST_RANGE,
  FILTER_IDS,
  outputSize,
  rotateEditCCW,
  rotateEditCW,
  flipEdit,
  layerId,
  type AdjustKey,
  type DrawLayer,
  type FilterId,
  type Layer,
  type PhotoEdit,
  type ShapeLayer,
  type TextLayer,
} from "@/lib/photo-edit/doc";
import { SHAPE_IDS, SHAPES, type ShapeId } from "@/lib/photo-edit/shapes";
import { cn } from "@/lib/class-names";
import { nearestWeight, PRESET_STYLES, TEXT_PRESETS, type TextPreset } from "./presets";
import { cropForAspect, type DrawStyle } from "./Stage";
import { ActionButton, FOCUS, Label, SELECTED, Seg, Slider, Swatches } from "./ui";

type T = ReturnType<typeof useMessages>["editor"]["photoEditor"];
type SetDoc = (next: PhotoEdit | ((d: PhotoEdit) => PhotoEdit), key?: string) => void;

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Правка одного слоя по id. */
const patchLayer = (set: SetDoc, id: string, patch: Partial<Layer>, key: string) =>
  set(
    (d) => ({
      ...d,
      layers: d.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)),
    }),
    key,
  );

// --- Надписи ---

/** Карточка стиля надписи: образец набран этим стилем на «фотографическом» фоне. */
function PresetCard({ preset, t, onPick }: { preset: TextPreset; t: T; onPick: () => void }) {
  const s = PRESET_STYLES[preset];
  const shadow = s.shadow === "soft" ? "0 1px 6px rgb(0 0 0 / .6)" : s.shadow === "hard" ? "2px 2px 0 rgb(0 0 0 / .7)" : s.shadow === "glow" ? `0 0 10px ${s.color}, 0 0 2px ${s.color}` : undefined;
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn("group flex min-h-[86px] w-full flex-col overflow-hidden rounded-[var(--r-ctl)] border border-line bg-white text-left transition hover:border-line-strong active:scale-[0.98]", FOCUS)}
    >
      {/* Образец набран на тёмном «снимке»: надписи делают под фото, на светлом поле их не разглядеть. */}
      <span className="flex flex-1 items-center justify-center bg-spine px-2 py-3">
        <span
          className="max-w-full truncate leading-tight"
          style={{
            fontFamily: cssFont(s.font),
            fontWeight: s.weight,
            fontStyle: s.italic ? "italic" : undefined,
            color: s.color,
            fontSize: Math.round(15 + s.scale * 5),
            letterSpacing: s.spacing ? `${s.spacing}em` : undefined,
            textShadow: shadow,
            WebkitTextStroke: s.stroke ? `${Math.max(1, s.strokeWidth * 14)}px ${s.stroke}` : undefined,
            paintOrder: "stroke fill",
            background: s.background ? s.background : undefined,
            padding: s.background ? "2px 8px" : undefined,
            borderRadius: s.background ? 6 : undefined,
          }}
        >
          {t.text.samples[preset]}
        </span>
      </span>
      <span className="px-2.5 py-1.5 text-xs text-muted group-hover:text-ink">{t.text.presets[preset]}</span>
    </button>
  );
}

export function TextTools({ t, onAdd }: { t: T; onAdd: (preset: TextPreset) => void }) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => onAdd("caption")}
        className="btn btn-dark w-full"
      >
        <Plus className="size-5" /> {t.text.add}
      </button>
      <div>
        <Label>{t.text.styles}</Label>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-2 lg:overflow-visible lg:px-0">
          {TEXT_PRESETS.map((p) => (
            <div key={p} className="w-[132px] shrink-0 lg:w-auto">
              <PresetCard preset={p} t={t} onPick={() => onAdd(p)} />
            </div>
          ))}
        </div>
      </div>
      <p className="text-[13px] leading-snug text-muted">{t.text.hint}</p>
    </div>
  );
}

/** Вкладки свойств на телефоне; на широком экране все разделы видны сразу. */
function Sections<K extends string>({ tabs, active, onTab, children }: { tabs: { id: K; label: string }[]; active: K; onTab: (k: K) => void; children: (k: K) => ReactNode }) {
  return (
    <div>
      <div className="mb-4 lg:hidden">
        <Seg label="" value={active} onChange={onTab} options={tabs.map((x) => ({ id: x.id, label: x.label }))} />
      </div>
      <div className="space-y-5">
        {tabs.map((x) => (
          <section key={x.id} className={cn("space-y-4", x.id !== active && "max-lg:hidden", "lg:border-b lg:border-line lg:pb-5 lg:last:border-0")}>
            {children(x.id)}
          </section>
        ))}
      </div>
    </div>
  );
}

export function TextProps({ layer, set, t, focus, onFocused }: { layer: TextLayer; set: SetDoc; t: T; focus: boolean; onFocused: () => void }) {
  const [tab, setTab] = useState<"text" | "font" | "color" | "style">("text");
  const area = useRef<HTMLTextAreaElement>(null);
  const p = (patch: Partial<TextLayer>, key: string) => patchLayer(set, layer.id, patch, `${key}:${layer.id}`);
  const { weights, italic } = fontWeights(layer.font);
  const boldWeight = weights.filter((w) => w >= 600).at(-1);
  const regular = nearestWeight(layer.font, 400);
  const bold = boldWeight !== undefined && layer.weight >= 600;

  // Новая надпись или «Изменить текст» (focus): вкладка «Текст», поле в фокусе, текст выделен — набор заменит
  // образец. Просто выбранная надпись поле не трогает — на телефоне иначе каждый раз выезжала бы клавиатура.
  const [seenFocus, setSeenFocus] = useState(false);
  if (seenFocus !== focus) {
    setSeenFocus(focus);
    if (focus) setTab("text");
  }
  useEffect(() => {
    if (!focus) return;
    const id = setTimeout(() => {
      const el = area.current;
      el?.focus({ preventScroll: true });
      el?.select();
      onFocused();
    }, 60);
    return () => clearTimeout(id);
  }, [focus, onFocused]);

  return (
    <Sections
      active={tab}
      onTab={setTab}
      tabs={[
        { id: "text", label: t.text.tabs.text },
        { id: "font", label: t.text.tabs.font },
        { id: "color", label: t.text.tabs.color },
        { id: "style", label: t.text.tabs.style },
      ]}
    >
      {(k) =>
        k === "text" ? (
          <>
            <div>
              <Label>{t.text.field}</Label>
              <textarea
                ref={area}
                value={layer.text}
                rows={2}
                maxLength={500}
                placeholder={t.text.placeholder}
                onChange={(e) => p({ text: e.target.value }, "text")}
                className="block w-full resize-none rounded-[var(--r-ctl)] border border-line-strong bg-white px-3 py-2.5 text-base text-ink placeholder:text-muted focus:border-wine focus:outline-2 focus:outline-offset-0 focus:outline-wine/25"
              />
            </div>
            <Slider label={t.text.size} value={layer.scale} min={0.2} max={4} step={0.01} format={pct} onChange={(scale) => p({ scale }, "scale")} />
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Seg
                  label={t.text.align}
                  value={layer.align}
                  onChange={(align) => p({ align }, "align")}
                  options={[
                    {
                      id: "left",
                      label: <AlignLeft className="size-4" />,
                      title: t.text.alignLeft,
                    },
                    {
                      id: "center",
                      label: <AlignCenter className="size-4" />,
                      title: t.text.alignCenter,
                    },
                    {
                      id: "right",
                      label: <AlignRight className="size-4" />,
                      title: t.text.alignRight,
                    },
                  ]}
                />
              </div>
              <ToggleIcon label={t.text.bold} on={bold} disabled={boldWeight === undefined} onClick={() => p({ weight: bold ? regular : boldWeight! }, "weight")} icon={<Bold className="size-4" />} />
              <ToggleIcon label={t.text.italic} on={layer.italic} disabled={!italic && !layer.italic} onClick={() => p({ italic: !layer.italic }, "italic")} icon={<Italic className="size-4" />} />
            </div>
          </>
        ) : k === "font" ? (
          <FontList
            value={layer.font}
            sample={layer.text.split("\n")[0] || t.text.samples.caption}
            onChange={(font) =>
              p(
                {
                  font,
                  weight: nearestWeight(font, layer.weight),
                  italic: layer.italic && fontWeights(font).italic,
                },
                "font",
              )
            }
          />
        ) : k === "color" ? (
          <>
            <div>
              <Label>{t.text.color}</Label>
              <Swatches label={t.text.color} customLabel={t.customColor} value={layer.color} onChange={(color) => color && p({ color }, "color")} />
            </div>
            <Slider label={t.layer.opacity} value={layer.opacity} min={0.1} max={1} step={0.01} format={pct} onChange={(opacity) => p({ opacity }, "opacity")} />
          </>
        ) : (
          <>
            <div>
              <Label>{t.text.background}</Label>
              <Swatches label={t.text.background} customLabel={t.customColor} none noneLabel={t.text.none} value={layer.background} onChange={(background) => p({ background }, "background")} />
            </div>
            {layer.background ? (
              <Slider label={t.text.backgroundOpacity} value={layer.backgroundOpacity} min={0.1} max={1} step={0.01} format={pct} onChange={(backgroundOpacity) => p({ backgroundOpacity }, "bgop")} />
            ) : null}
            <div>
              <Label>{t.text.stroke}</Label>
              <Swatches label={t.text.stroke} customLabel={t.customColor} none noneLabel={t.text.none} value={layer.stroke} onChange={(stroke) => p({ stroke }, "stroke")} />
            </div>
            {layer.stroke ? (
              <Slider
                label={t.text.strokeWidth}
                value={layer.strokeWidth}
                min={0.02}
                max={0.3}
                step={0.005}
                format={(v) => String(Math.round(v * 100))}
                onChange={(strokeWidth) => p({ strokeWidth }, "strokew")}
              />
            ) : null}
            <div>
              <Label>{t.text.shadow}</Label>
              <Seg
                label={t.text.shadow}
                value={layer.shadow}
                onChange={(shadow) => p({ shadow }, "shadow")}
                options={(["none", "soft", "hard", "glow"] as const).map((id) => ({ id, label: t.text.shadows[id] }))}
              />
            </div>
            <Slider
              label={t.text.spacing}
              value={layer.spacing}
              min={-0.1}
              max={0.6}
              step={0.01}
              center={0}
              format={(v) => String(Math.round(v * 100))}
              onReset={layer.spacing ? () => p({ spacing: 0 }, "spacing") : undefined}
              resetLabel={t.adjust.reset}
              onChange={(spacing) => p({ spacing }, "spacing")}
            />
            {layer.text.includes("\n") ? (
              <Slider label={t.text.lineHeight} value={layer.lineHeight} min={0.8} max={2.4} step={0.01} format={(v) => v.toFixed(2)} onChange={(lineHeight) => p({ lineHeight }, "lh")} />
            ) : null}
          </>
        )
      }
    </Sections>
  );
}

function ToggleIcon({ label, on, disabled, onClick, icon }: { label: string; on: boolean; disabled?: boolean; onClick: () => void; icon: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn("flex size-11 shrink-0 items-center justify-center rounded-[var(--r-ctl)] transition disabled:opacity-35", FOCUS, on ? SELECTED : "bg-sunken text-ink-soft hover:bg-cream")}
    >
      {icon}
    </button>
  );
}

/** Шрифты с казахскими буквами — каждый показан собой. */
function FontList({ value, sample, onChange }: { value: FontKey; sample: string; onChange: (f: FontKey) => void }) {
  const list = useMemo(() => [...fontKeys].sort((a, b) => (fontFaces[a].category ?? "").localeCompare(fontFaces[b].category ?? "")), []);
  return (
    <div role="radiogroup" className="grid max-h-[50dvh] grid-cols-2 gap-2 overflow-y-auto overscroll-contain pr-1 max-lg:max-h-[30dvh]">
      {list.map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          onClick={() => onChange(k)}
          className={cn("flex min-h-14 flex-col justify-center rounded-[var(--r-ctl)] px-3 py-2 text-left transition", FOCUS, value === k ? SELECTED : "bg-sunken text-ink hover:bg-cream")}
        >
          <span
            className="truncate text-[17px] leading-tight"
            style={{
              fontFamily: cssFont(k),
              fontWeight: nearestWeight(k, 500),
            }}
          >
            {sample.slice(0, 18)}
          </span>
          <span className={cn("mt-0.5 truncate text-[11px]", value === k ? "text-wine/80" : "text-muted")}>{fontFaces[k].name ?? k}</span>
        </button>
      ))}
    </div>
  );
}

// --- Фигуры ---

function ShapeIcon({ id, className }: { id: ShapeId; className?: string }) {
  const s = SHAPES[id];
  const pad = 8;
  return (
    <svg viewBox={`${-pad} ${-pad} ${s.w + pad * 2} ${s.h + pad * 2}`} className={className} aria-hidden>
      <path d={s.path} fill={s.kind === "fill" ? "currentColor" : "none"} stroke={s.kind === "line" ? "currentColor" : "none"} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ShapeTools({ t, onAdd }: { t: T; onAdd: (s: ShapeId) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-7 lg:grid-cols-4">
        {SHAPE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onAdd(id)}
            aria-label={t.shapes.names[id]}
            title={t.shapes.names[id]}
            className={cn("flex aspect-square flex-col items-center justify-center gap-1 rounded-[var(--r-ctl)] bg-sunken text-ink transition hover:bg-cream active:scale-95", FOCUS)}
          >
            <ShapeIcon id={id} className="size-7" />
            <span className="max-w-full truncate px-1 text-[10px] text-muted max-sm:hidden">{t.shapes.names[id]}</span>
          </button>
        ))}
      </div>
      <p className="text-[13px] text-muted">{t.shapes.hint}</p>
    </div>
  );
}

export function ShapeProps({ layer, set, t }: { layer: ShapeLayer; set: SetDoc; t: T }) {
  const p = (patch: Partial<ShapeLayer>, key: string) => patchLayer(set, layer.id, patch, `${key}:${layer.id}`);
  const line = SHAPES[layer.shape].kind === "line";
  const outlined = !line && !layer.fill;
  const color = line || outlined ? (layer.stroke ?? "#FFFFFF") : (layer.fill ?? "#FFFFFF");
  return (
    <div className="space-y-4">
      {line ? null : (
        <div>
          <Label>{t.shapes.style}</Label>
          <Seg
            label={t.shapes.style}
            value={outlined ? "outline" : "fill"}
            onChange={(v) =>
              p(
                v === "fill"
                  ? { fill: color, stroke: null }
                  : {
                      fill: null,
                      stroke: color,
                      strokeWidth: Math.max(layer.strokeWidth, 0.012),
                    },
                "style",
              )
            }
            options={[
              { id: "fill", label: t.shapes.filled },
              { id: "outline", label: t.shapes.outlined },
            ]}
          />
        </div>
      )}
      <div>
        <Label>{t.shapes.color}</Label>
        <Swatches label={t.shapes.color} customLabel={t.customColor} value={color} onChange={(c) => c && p(line || outlined ? { stroke: c } : { fill: c }, "color")} />
      </div>
      {line || outlined ? (
        <Slider
          label={t.shapes.strokeWidth}
          value={layer.strokeWidth}
          min={0.003}
          max={0.06}
          step={0.001}
          format={(v) => String(Math.round(v * 1000))}
          onChange={(strokeWidth) => p({ strokeWidth }, "sw")}
        />
      ) : null}
      <Slider label={t.layer.size} value={layer.scale} min={0.15} max={4} step={0.01} format={pct} onChange={(scale) => p({ scale }, "scale")} />
      <Slider label={t.layer.opacity} value={layer.opacity} min={0.1} max={1} step={0.01} format={pct} onChange={(opacity) => p({ opacity }, "opacity")} />
    </div>
  );
}

// --- Рисунок ---

const DRAW_WIDTHS = { min: 0.003, max: 0.06 };

export function DrawTools({ t, style, onStyle }: { t: T; style: DrawStyle; onStyle: (s: DrawStyle) => void }) {
  return (
    <div className="space-y-4">
      <Seg
        label={t.draw.brush}
        value={style.brush}
        onChange={(brush) =>
          onStyle({
            ...style,
            brush,
            width: brush === "marker" ? Math.max(style.width, 0.025) : style.width,
          })
        }
        options={[
          {
            id: "pen",
            label: (
              <>
                <Pencil className="size-4" /> {t.draw.pen}
              </>
            ),
          },
          {
            id: "marker",
            label: (
              <>
                <Highlighter className="size-4" /> {t.draw.marker}
              </>
            ),
          },
        ]}
      />
      <div>
        <Label>{t.draw.color}</Label>
        <Swatches label={t.draw.color} customLabel={t.customColor} value={style.color} onChange={(color) => color && onStyle({ ...style, color })} />
      </div>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Slider
            label={t.draw.width}
            value={style.width}
            min={DRAW_WIDTHS.min}
            max={DRAW_WIDTHS.max}
            step={0.001}
            format={(v) => String(Math.round(v * 1000))}
            onChange={(width) => onStyle({ ...style, width })}
          />
        </div>
        <span className="flex size-12 shrink-0 items-center justify-center rounded-[var(--r-ctl)] bg-sunken" aria-hidden>
          <span
            className="rounded-full"
            style={{
              width: Math.max(3, style.width * 600),
              height: Math.max(3, style.width * 600),
              background: style.color,
              opacity: style.brush === "marker" ? 0.5 : 1,
            }}
          />
        </span>
      </div>
      <p className="text-[13px] text-muted">{t.draw.hint}</p>
    </div>
  );
}

export function DrawProps({ layer, set, t }: { layer: DrawLayer; set: SetDoc; t: T }) {
  const p = (patch: Partial<DrawLayer>, key: string) => patchLayer(set, layer.id, patch, `${key}:${layer.id}`);
  return (
    <div className="space-y-4">
      <div>
        <Label>{t.draw.color}</Label>
        <Swatches label={t.draw.color} customLabel={t.customColor} value={layer.color} onChange={(color) => color && p({ color }, "color")} />
      </div>
      <Slider
        label={t.draw.width}
        value={layer.width}
        min={DRAW_WIDTHS.min}
        max={DRAW_WIDTHS.max}
        step={0.001}
        format={(v) => String(Math.round(v * 1000))}
        onChange={(width) => p({ width }, "width")}
      />
      <Slider label={t.layer.opacity} value={layer.opacity} min={0.1} max={1} step={0.01} format={pct} onChange={(opacity) => p({ opacity }, "opacity")} />
    </div>
  );
}

/** Действия над выбранным слоем: копия, выше/ниже других, удалить. */
export function LayerActions({ layer, set, t, onSelect }: { layer: Layer; set: SetDoc; t: T; onSelect: (id: string | null) => void }) {
  const move = (dir: 1 | -1) =>
    set((d) => {
      const i = d.layers.findIndex((l) => l.id === layer.id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.layers.length) return d;
      const layers = [...d.layers];
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...d, layers };
    });
  return (
    <div className="flex gap-2">
      <ActionButton
        icon={<Copy className="size-[18px]" />}
        label={t.layer.duplicate}
        onClick={() => {
          const copy = {
            ...layer,
            id: layerId(),
            x: Math.min(1, layer.x + 0.04),
            y: Math.min(1, layer.y + 0.04),
          } as Layer;
          set((d) => ({ ...d, layers: [...d.layers, copy] }));
          onSelect(copy.id);
        }}
      />
      <ActionButton icon={<BringToFront className="size-[18px]" />} label={t.layer.forward} onClick={() => move(1)} />
      <ActionButton icon={<SendToBack className="size-[18px]" />} label={t.layer.backward} onClick={() => move(-1)} />
      <ActionButton
        icon={<Trash2 className="size-[18px]" />}
        label={t.layer.delete}
        danger
        onClick={() => {
          set((d) => ({
            ...d,
            layers: d.layers.filter((l) => l.id !== layer.id),
          }));
          onSelect(null);
        }}
      />
    </div>
  );
}

// --- Кадр ---

const ASPECTS = ["free", "original", "1:1", "4:5", "3:4", "2:3", "4:3", "3:2", "16:9"];

export function CropPanel({ doc, set, iw, ih, t }: { doc: PhotoEdit; set: SetDoc; iw: number; ih: number; t: T }) {
  const g = doc.geometry;
  const out = outputSize(iw, ih, g);
  const long = Math.max(out.w, out.h);
  return (
    <div className="space-y-4">
      <div>
        <Label>{t.crop.aspect}</Label>
        <div role="radiogroup" aria-label={t.crop.aspect} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
          {ASPECTS.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={g.aspect === a}
              onClick={() => set((d) => cropForAspect(d, a, iw, ih), "aspect")}
              className={cn(
                "flex h-10 shrink-0 items-center gap-1.5 rounded-[var(--r-ctl)] px-3.5 text-[13px] transition",
                FOCUS,
                g.aspect === a ? cn(SELECTED, "font-medium") : "bg-sunken text-ink-soft hover:bg-cream",
              )}
            >
              {/^\d+:\d+$/.test(a) ? <AspectGlyph a={a} /> : null}
              {t.crop.aspects[a] ?? a}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <ActionButton icon={<RotateCcw className="size-[18px]" />} label={t.crop.rotateLeft} onClick={() => set((d) => rotateEditCCW(d))} />
        <ActionButton icon={<RotateCw className="size-[18px]" />} label={t.crop.rotateRight} onClick={() => set((d) => rotateEditCW(d))} />
        <ActionButton icon={<FlipHorizontal2 className="size-[18px]" />} label={t.crop.flip} onClick={() => set((d) => flipEdit(d))} />
      </div>
      <Slider
        label={t.crop.straighten}
        value={g.straighten}
        min={-45}
        max={45}
        step={0.5}
        center={0}
        format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}°`}
        onReset={
          g.straighten
            ? () =>
                set((d) => ({
                  ...d,
                  geometry: { ...d.geometry, straighten: 0 },
                }))
            : undefined
        }
        resetLabel={t.adjust.reset}
        onChange={(straighten) => set((d) => ({ ...d, geometry: { ...d.geometry, straighten } }), "straighten")}
      />
      {g.crop || g.straighten || g.turns || g.flip ? (
        <button
          type="button"
          onClick={() => set(resetGeometry)}
          className={cn("flex h-11 w-full items-center justify-center gap-2 rounded-[var(--r-ctl)] border border-line bg-white text-[13px] text-ink-soft hover:border-line-strong hover:bg-sunken", FOCUS)}
        >
          <RotateCcw className="size-4" /> {t.crop.reset}
        </button>
      ) : null}
      {long < 1200 ? (
        <p className="flex gap-2 rounded-[var(--r-ctl)] bg-warning-bg p-3 text-[13px] leading-snug text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {t.crop.small(long)}
        </p>
      ) : null}
      <p className="text-[13px] text-muted">{t.crop.hint}</p>
    </div>
  );
}

/** «Сбросить кадр»: снимок как был — отражение и повороты снимаются так же, как ставились, чтобы слои ушли вместе с ним. */
function resetGeometry(d: PhotoEdit): PhotoEdit {
  let e = d.geometry.flip ? flipEdit(d) : d;
  while (e.geometry.turns) e = rotateEditCW(e);
  return {
    ...e,
    geometry: { ...e.geometry, straighten: 0, crop: null, aspect: "free" },
  };
}

function AspectGlyph({ a }: { a: string }) {
  const [w, h] = a.split(":").map(Number);
  const k = 14 / Math.max(w, h);
  return <span className="inline-block rounded-[2px] border-[1.5px] border-current" style={{ width: w * k, height: h * k }} aria-hidden />;
}

// --- Свет и цвет ---

export function AdjustPanel({ doc, set, t, onAuto }: { doc: PhotoEdit; set: SetDoc; t: T; onAuto: () => void }) {
  const [active, setActive] = useState<AdjustKey>("brightness");
  const value = (k: AdjustKey) => doc.adjust[k] ?? 0;
  const change = (k: AdjustKey, v: number) => set((d) => ({ ...d, adjust: { ...d.adjust, [k]: v || undefined } }), `adjust:${k}`);
  const any = ADJUST_KEYS.some((k) => value(k)) || !!doc.levels;
  const slider = (k: AdjustKey) => {
    const [min, max] = ADJUST_RANGE[k];
    return (
      <Slider
        key={k}
        label={t.adjust.names[k]}
        value={value(k)}
        min={min}
        max={max}
        center={min < 0 ? 0 : undefined}
        format={(v) => (v > 0 && min < 0 ? `+${Math.round(v)}` : String(Math.round(v)))}
        onReset={value(k) ? () => change(k, 0) : undefined}
        resetLabel={t.adjust.reset}
        onChange={(v) => change(k, v)}
      />
    );
  };
  return (
    <div className="space-y-4">
      <div>
        <button
          type="button"
          aria-pressed={!!doc.levels}
          onClick={onAuto}
          className={cn(
            "flex h-12 w-full items-center justify-center gap-2 rounded-[var(--r-ctl)] text-[15px] font-medium transition active:scale-[0.99]",
            FOCUS,
            doc.levels ? SELECTED : "border border-line-strong bg-white text-ink hover:bg-sunken",
          )}
        >
          <WandSparkles className="size-5" /> {t.adjust.auto}
        </button>
        <p className="mt-2 text-xs leading-snug text-muted">{t.adjust.autoHint}</p>
      </div>
      {/* Телефон: ряд кружков и один ползунок (как в «Фото» на iPhone); широкий экран — все ползунки. */}
      <div className="lg:hidden">
        <div role="radiogroup" aria-label={t.tools.adjust} className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 pb-2">
          {ADJUST_KEYS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={active === k} onClick={() => setActive(k)} className={cn("flex w-[68px] shrink-0 flex-col items-center gap-1 rounded-[var(--r-ctl)]", FOCUS)}>
              <span
                className={cn(
                  "flex size-11 items-center justify-center rounded-full text-[12px] tabular-nums ring-1 transition",
                  active === k ? "bg-wine text-white ring-wine" : value(k) ? "bg-rose text-wine ring-wine" : "text-muted ring-line-strong",
                )}
              >
                {value(k) ? Math.round(value(k)) : "·"}
              </span>
              <span className={cn("max-w-full truncate text-[11px]", active === k ? "font-medium text-ink" : "text-muted")}>{t.adjust.names[k]}</span>
            </button>
          ))}
        </div>
        {slider(active)}
      </div>
      <div className="space-y-2 max-lg:hidden">{ADJUST_KEYS.map(slider)}</div>
      {any ? (
        <button
          type="button"
          onClick={() => set((d) => ({ ...d, adjust: {}, levels: null }))}
          className={cn("flex h-11 w-full items-center justify-center gap-2 rounded-[var(--r-ctl)] border border-line bg-white text-[13px] text-ink-soft hover:border-line-strong hover:bg-sunken", FOCUS)}
        >
          <RotateCcw className="size-4" /> {t.adjust.resetAll}
        </button>
      ) : null}
    </div>
  );
}

// --- Фильтры ---

export function FiltersPanel({ doc, set, t, thumbs }: { doc: PhotoEdit; set: SetDoc; t: T; thumbs: Partial<Record<FilterId, string>> }) {
  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label={t.tools.filters} className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 py-1 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0">
        {FILTER_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={doc.filter.id === id}
            onClick={() =>
              set(
                (d) => ({
                  ...d,
                  filter: {
                    id,
                    strength: d.filter.id === id ? d.filter.strength : 100,
                  },
                }),
                "filter",
              )
            }
            className={cn("flex w-[76px] shrink-0 flex-col items-center gap-1.5 rounded-[var(--r-ctl)] lg:w-auto", FOCUS)}
          >
            <span className={cn("block aspect-square w-full overflow-hidden rounded-[var(--r-ctl)] bg-sunken ring-2 transition", doc.filter.id === id ? "ring-wine" : "ring-transparent")}>
              {thumbs[id] ? (
                // eslint-disable-next-line @next/next/no-img-element -- миниатюра из холста
                <img src={thumbs[id]} alt="" className="h-full w-full object-cover" />
              ) : null}
            </span>
            <span className={cn("max-w-full truncate text-xs", doc.filter.id === id ? "font-medium text-wine" : "text-muted")}>{t.filters.names[id]}</span>
          </button>
        ))}
      </div>
      {doc.filter.id !== "none" ? (
        <Slider
          label={t.filters.strength}
          value={doc.filter.strength}
          min={0}
          max={100}
          format={(v) => `${Math.round(v)}%`}
          onChange={(strength) => set((d) => ({ ...d, filter: { ...d.filter, strength } }), "strength")}
        />
      ) : null}
    </div>
  );
}
