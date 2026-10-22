/**
 * Слои обложки из конструктора в HTML: текст, фото, фигуры и декор поверх фона. Родитель — лицевая крышка
 * (position: relative, container-type: inline-size): рамки слоёв — в процентах крышки, кегль — в cqw её ширины.
 * Так же их рисует PDF (modules/production/infrastructure/pdf/cover-layers.tsx): тень и контур — копиями текста
 * без размытия, подложка — заливкой рамки, кадр фото — той же математикой (cssFrame ↔ bakeFrame).
 */
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cssFont } from "@/lib/book/fonts";
import { hexAlpha } from "@/lib/color";
import { cssFrame } from "@/lib/book/photo-frame";
import {
  decorDrawing,
  GRADIENT_FILL,
  gradientVector,
  layerText,
  shapeElements,
  textCopies,
  type CoverDesign,
  type CoverLayer,
  type CoverTexts,
  type ImageLayer,
  type ShapeLayer,
  type TextLayer,
} from "@/lib/book/cover-design";
import { ShapeElement } from "@/components/interior/graphics";

export interface CoverLayersProps {
  design: CoverDesign;
  texts: CoverTexts;
  /** Крышка, мм — пропорции фигур и скругления. */
  board: { w: number; h: number };
  /** Адрес фото книги и снимка коллекции. */
  photoSrc: (photoId: string) => string;
  stockSrc: (key: string) => string;
  /** Редактор: подсказки на месте пустого текста и фото, скрытые слои — полупрозрачными. */
  placeholders?: { text: (layer: TextLayer) => string; image: ReactNode };
  /** Атрибуты корня каждого слоя (выделение и перетаскивание в редакторе). */
  layerProps?: (layer: CoverLayer) => HTMLAttributes<HTMLDivElement> & { [data: `data-${string}`]: string | undefined };
  /** Уникальная приставка id градиентов (несколько обложек на странице). */
  uid?: string;
}

const pct = (v: number) => `${v * 100}%`;

/** Рамка слоя: место, поворот, прозрачность. */
export function layerBox(l: CoverLayer): CSSProperties {
  return {
    position: "absolute",
    left: pct(l.x),
    top: pct(l.y),
    width: pct(l.w),
    height: pct(l.h),
    transform: l.rotate ? `rotate(${l.rotate}deg)` : undefined,
    opacity: l.opacity ?? 1,
  };
}

/** Текст слоя: начертание, кегль в cqw, тень и контур — копиями (text-shadow без размытия), как в PDF. */
export function textCss(style: TextLayer["style"]): CSSProperties {
  const copies = textCopies(style);
  return {
    fontFamily: cssFont(style.font),
    fontWeight: style.weight,
    fontStyle: style.italic ? "italic" : "normal",
    fontSize: `${style.size * 100}cqw`,
    lineHeight: style.lineHeight ?? 1.2,
    letterSpacing: style.tracking ? `${style.tracking}em` : undefined,
    color: style.color,
    textAlign: style.align,
    textTransform: style.upper ? "uppercase" : undefined,
    textDecoration: style.underline ? "underline" : undefined,
    textDecorationThickness: style.underline ? "0.06em" : undefined,
    textUnderlineOffset: style.underline ? "0.12em" : undefined,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    // CSS рисует первую тень сверху — порядок обратный копиям PDF (там снизу вверх).
    textShadow: copies.length ? [...copies].reverse().map((c) => `${c.dx}em ${c.dy}em 0 ${hexAlpha(c.color, c.opacity)}`).join(", ") : undefined,
  };
}

const justify = { top: "flex-start", middle: "center", bottom: "flex-end" } as const;

function TextView({ layer, text, placeholder }: { layer: TextLayer; text: string; placeholder?: string }) {
  const { style } = layer;
  const plate = style.plate;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: justify[style.valign],
        background: plate ? hexAlpha(plate.color, plate.opacity) : undefined,
        borderRadius: plate?.radius ? `${plate.radius * 100}cqw` : undefined,
        padding: plate?.pad ? `${plate.pad * style.size * 100}cqw` : undefined,
      }}
    >
      <div style={{ ...textCss(style), opacity: text ? 1 : 0.45 }}>{text || placeholder}</div>
    </div>
  );
}

/** Скругление снимка по маске: в процентах рамки, чтобы совпало с PDF (там — те же миллиметры). */
export function maskRadius(l: ImageLayer, board: { w: number; h: number }): string | undefined {
  const w = l.w * board.w;
  const h = l.h * board.h;
  const m = Math.min(w, h);
  const r = (mm: number) => `${(mm / w) * 100}% / ${(mm / h) * 100}%`;
  if (l.mask === "circle") return r(m / 2);
  if (l.mask === "rounded") return r((l.radius ?? 0.08) * m);
  if (l.mask === "arch") {
    const a = Math.min(w / 2, h);
    return `${(a / w) * 100}% ${(a / w) * 100}% 0 0 / ${(a / h) * 100}% ${(a / h) * 100}% 0 0`;
  }
  return undefined;
}

function ImageView({ layer, src, board, placeholder }: { layer: ImageLayer; src: string | null; board: { w: number; h: number }; placeholder?: ReactNode }) {
  const border = layer.border && layer.border.width > 0 ? `${layer.border.width * 100}cqw solid ${layer.border.color}` : undefined;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: maskRadius(layer, board), border, boxSizing: "border-box", background: src ? undefined : "rgba(0,0,0,.08)" }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- фото клиента и снимки коллекции: next/image здесь не нужен
        <img
          src={src}
          alt=""
          draggable={false}
          className="absolute inset-0 block size-full object-cover"
          style={{ maxWidth: "none", filter: layer.mono ? "grayscale(1)" : undefined, ...cssFrame(layer.frame) }}
        />
      ) : (
        placeholder
      )}
      {layer.overlay ? <div className="absolute inset-0" style={{ background: hexAlpha(layer.overlay.color, layer.overlay.opacity) }} /> : null}
    </div>
  );
}

function ShapeView({ layer, board, uid }: { layer: ShapeLayer; board: { w: number; h: number }; uid: string }) {
  const w = layer.w * board.w;
  const h = layer.h * board.h;
  const id = `${uid}g${layer.id}`;
  const v = layer.gradient ? gradientVector(layer.gradient.angle) : null;
  return (
    <svg aria-hidden viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
      {v && layer.gradient && layer.fill ? (
        <defs>
          <linearGradient id={id} x1={v.x1} y1={v.y1} x2={v.x2} y2={v.y2}>
            <stop offset="0" stopColor={layer.fill} />
            <stop offset="1" stopColor={layer.gradient.to} />
          </linearGradient>
        </defs>
      ) : null}
      {shapeElements(layer, w, h, board.w).map((s, i) => (
        <ShapeElement key={i} s={s.kind === "path" && s.fill === GRADIENT_FILL ? { ...s, fill: `url(#${id})` } : s} />
      ))}
    </svg>
  );
}

function DecorView({ layer }: { layer: Extract<CoverLayer, { kind: "decor" }> }) {
  const d = decorDrawing(layer.motif, layer.color);
  return (
    <svg aria-hidden viewBox={`0 0 ${d.w} ${d.h}`} preserveAspectRatio="xMidYMid meet" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
      {d.shapes.map((s, i) => (
        <ShapeElement key={i} s={s} />
      ))}
    </svg>
  );
}

/** Слои обложки по порядку (первый — нижний). Скрытые не рисуются, а в редакторе — полупрозрачные. */
export function CoverLayers({ design, texts, board, photoSrc, stockSrc, placeholders, layerProps, uid = "cl" }: CoverLayersProps) {
  return (
    <>
      {design.layers.map((l) => {
        if (l.hidden && !placeholders) return null;
        let body: ReactNode;
        if (l.kind === "text") {
          const text = layerText(l, texts);
          if (!text.trim() && !placeholders) return null;
          body = <TextView layer={l} text={text} placeholder={placeholders?.text(l)} />;
        } else if (l.kind === "image") {
          const src = l.photoId ? photoSrc(l.photoId) : l.stock ? stockSrc(l.stock) : null;
          if (!src && !placeholders) return null;
          body = <ImageView layer={l} src={src} board={board} placeholder={placeholders?.image} />;
        } else if (l.kind === "shape") body = <ShapeView layer={l} board={board} uid={uid} />;
        else body = <DecorView layer={l} />;
        const extra = layerProps?.(l);
        const box = layerBox(l);
        return (
          <div key={l.id} {...extra} style={{ ...box, opacity: l.hidden ? 0.25 : box.opacity, ...extra?.style }}>
            {body}
          </div>
        );
      })}
    </>
  );
}
