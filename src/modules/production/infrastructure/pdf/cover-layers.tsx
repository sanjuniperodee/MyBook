import "server-only";
/* eslint-disable jsx-a11y/alt-text -- react-pdf Image не поддерживает alt */
import { Circle, Defs, Image, LinearGradient, Path, Rect, Stop, Svg, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import {
  decorDrawing,
  GRADIENT_FILL,
  gradientVector,
  layerRect,
  layerText,
  printedLayers,
  shapeElements,
  textCopies,
  type CoverDesign,
  type CoverLayer,
  type CoverTexts,
  type ImageLayer,
  type TextLayer,
} from "@/lib/book/cover-design";
import { mm, type Rect as MmRect } from "@/lib/book/formats";
import type { Shape } from "@/lib/book/interior-art";
import { face } from "./fonts";

/** На обложке переносов нет — как у текста шаблона. */
const noHyphens = (word: string) => [word];

const justify = { top: "flex-start", middle: "center", bottom: "flex-end" } as const;

/** Запас по высоте блока текста, pt: больше любой обложки — текст никогда не урезается. */
const OVERFLOW = 2000;

/** Фигура interior-art → react-pdf (fill = GRADIENT_FILL — градиент слоя). */
function shapeEl(s: Shape, i: number, gradientId?: string) {
  if (s.kind === "circle") return <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} fillOpacity={s.opacity} />;
  if (s.kind === "rect")
    return <Rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} fill={s.fill ?? "none"} fillOpacity={s.fill ? s.opacity : undefined} stroke={s.stroke} strokeWidth={s.width} />;
  const fill = s.fill === GRADIENT_FILL && gradientId ? `url(#${gradientId})` : (s.fill ?? "none");
  return (
    <Path
      key={i}
      d={s.d}
      fill={fill}
      fillOpacity={s.fill ? s.opacity : undefined}
      stroke={s.stroke}
      strokeWidth={s.width}
      strokeOpacity={s.stroke ? s.opacity : undefined}
      strokeLinecap={s.round ? "round" : undefined}
      strokeLinejoin={s.round ? "round" : undefined}
      transform={s.transform}
    />
  );
}

/** Текст слоя: копии (тень, контур) и сам текст — одинаковые блоки на всю рамку, сдвинутые на копию. */
function TextLayerPdf({ layer, text, w, h, boardW }: { layer: TextLayer; text: string; w: number; h: number; boardW: number }) {
  const s = layer.style;
  const size = mm(s.size * boardW);
  const plate = s.plate;
  const pad = plate?.pad ? plate.pad * size : 0;
  const base: Style = {
    ...face(s.font, s.weight, s.italic ?? false),
    fontSize: size,
    lineHeight: s.lineHeight ?? 1.2,
    letterSpacing: (s.tracking ?? 0) * size,
    textTransform: s.upper ? "uppercase" : "none",
    textAlign: s.align,
    textDecoration: s.underline ? "underline" : "none",
  };
  // react-pdf урезает текст под высоту блока (с многоточием), а браузер даёт ему выйти за рамку. Чтобы печать совпала
  // с редактором, блок выше рамки на OVERFLOW с нужных сторон: выравнивание по верху, низу и центру остаётся тем же.
  const inner = mm(h) - pad * 2;
  const above = s.valign === "top" ? 0 : OVERFLOW;
  const below = s.valign === "bottom" ? 0 : OVERFLOW;
  const block = (dx: number, dy: number, color: string, opacity: number, key: string) => (
    <View key={key} style={{ position: "absolute", left: dx + pad, top: dy + pad - above, width: mm(w) - pad * 2, height: inner + above + below, flexDirection: "column", justifyContent: justify[s.valign] }}>
      <Text hyphenationCallback={noHyphens} style={{ ...base, color, opacity }}>
        {text}
      </Text>
    </View>
  );
  return (
    <>
      {plate ? <View style={{ position: "absolute", left: 0, top: 0, width: mm(w), height: mm(h), backgroundColor: plate.color, opacity: plate.opacity, borderRadius: plate.radius ? mm(plate.radius * boardW) : 0 }} /> : null}
      {textCopies(s).map((c, i) => block(c.dx * size, c.dy * size, c.color, c.opacity, `c${i}`))}
      {block(0, 0, s.color, 1, "t")}
    </>
  );
}

/** Скругление снимка по маске, pt — как в HTML (maskRadius). */
function imageRadius(l: ImageLayer, w: number, h: number): Style {
  const m = Math.min(w, h);
  if (l.mask === "circle") return { borderRadius: mm(m / 2) };
  if (l.mask === "rounded") return { borderRadius: mm((l.radius ?? 0.08) * m) };
  if (l.mask === "arch") {
    const a = mm(Math.min(w / 2, h));
    return { borderTopLeftRadius: a, borderTopRightRadius: a };
  }
  return {};
}

function ImageLayerPdf({ layer, data, w, h, boardW }: { layer: ImageLayer; data: Buffer; w: number; h: number; boardW: number }) {
  const radius = imageRadius(layer, w, h);
  const bw = layer.border && layer.border.width > 0 ? mm(layer.border.width * boardW) : 0;
  return (
    <View style={{ position: "absolute", left: 0, top: 0, width: mm(w), height: mm(h), overflow: "hidden", ...radius, ...(bw ? { borderWidth: bw, borderColor: layer.border!.color, borderStyle: "solid" } : {}) }}>
      <Image src={{ data, format: "jpg" }} style={{ width: "100%", height: "100%", objectFit: "cover", ...radius }} />
      {layer.overlay ? <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: layer.overlay.color, opacity: layer.overlay.opacity }} /> : null}
    </View>
  );
}

function ShapeLayerPdf({ layer, w, h, boardW }: { layer: Extract<CoverLayer, { kind: "shape" }>; w: number; h: number; boardW: number }) {
  const id = `g${layer.id}`;
  const v = layer.gradient ? gradientVector(layer.gradient.angle) : null;
  return (
    <Svg viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", left: 0, top: 0, width: mm(w), height: mm(h) }}>
      {v && layer.gradient && layer.fill ? (
        <Defs>
          <LinearGradient id={id} x1={v.x1} y1={v.y1} x2={v.x2} y2={v.y2}>
            <Stop offset="0" stopColor={layer.fill} />
            <Stop offset="1" stopColor={layer.gradient.to} />
          </LinearGradient>
        </Defs>
      ) : null}
      {shapeElements(layer, w, h, boardW).map((s, i) => shapeEl(s, i, id))}
    </Svg>
  );
}

function DecorLayerPdf({ layer, w, h }: { layer: Extract<CoverLayer, { kind: "decor" }>; w: number; h: number }) {
  const d = decorDrawing(layer.motif, layer.color);
  // Вписать с сохранением пропорций, по центру рамки (как preserveAspectRatio="xMidYMid meet" в HTML).
  const k = Math.min(w / d.w, h / d.h);
  const dw = d.w * k;
  const dh = d.h * k;
  return (
    <Svg viewBox={`0 0 ${d.w} ${d.h}`} style={{ position: "absolute", left: mm((w - dw) / 2), top: mm((h - dh) / 2), width: mm(dw), height: mm(dh) }}>
      {d.shapes.map((s, i) => shapeEl(s, i))}
    </Svg>
  );
}

/**
 * Слои обложки из конструктора на лицевой крышке front (мм развёртки): по порядку, каждый — в своей рамке с поворотом
 * вокруг центра и прозрачностью. images — готовые снимки слоёв (кадр и ч/б уже в файле) по id слоя.
 */
export function CoverLayersPdf({ design, texts, front, images }: { design: CoverDesign; texts: CoverTexts; front: MmRect; images: Map<string, Buffer> }) {
  return (
    <>
      {printedLayers(design, texts).map((l) => {
        const r = layerRect(l, front);
        let body: React.ReactNode = null;
        if (l.kind === "text") body = <TextLayerPdf layer={l} text={layerText(l, texts)} w={r.w} h={r.h} boardW={front.w} />;
        else if (l.kind === "image") {
          const data = images.get(l.id);
          if (!data) return null;
          body = <ImageLayerPdf layer={l} data={data} w={r.w} h={r.h} boardW={front.w} />;
        } else if (l.kind === "shape") body = <ShapeLayerPdf layer={l} w={r.w} h={r.h} boardW={front.w} />;
        else body = <DecorLayerPdf layer={l} w={r.w} h={r.h} />;
        return (
          <View
            key={l.id}
            style={{
              position: "absolute",
              left: mm(r.x),
              top: mm(r.y),
              width: mm(r.w),
              height: mm(r.h),
              opacity: l.opacity ?? 1,
              ...(l.rotate ? { transform: `rotate(${l.rotate}deg)`, transformOrigin: "50% 50%" } : {}),
            }}
          >
            {body}
          </View>
        );
      })}
    </>
  );
}
