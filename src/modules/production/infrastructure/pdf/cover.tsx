import "server-only";
import { Document, Image, Page, Path, Svg, Text, View } from "@react-pdf/renderer";
import type { CoverGeometry } from "@/lib/book/formats";
import { mm, print } from "@/lib/book/formats";
import { fitWordSize } from "@/lib/book/word-fit";
import { spineFontMm, spineParts } from "@/lib/book/book-model";
import type { CoverTemplate, CoverTextContent, CoverTextStyle } from "@/lib/book/covers";
import type { BackDesign } from "@/lib/book/cover-back";
import { face } from "@/modules/production/infrastructure/pdf/fonts";
import { site } from "@/config/site";
import type { Locale } from "@/i18n/config";

/** На обложке переносов нет: «кі-тапқа» на обороте или «навсе-гда» в названии выглядят как ошибка. */
const noHyphens = (word: string) => [word];
import { messagesFor } from "@/i18n/messages";
import type { CoverDesign } from "@/lib/book/cover-design";
import { CoverLayersPdf } from "./cover-layers";
import { templateTextLayout } from "@/lib/book/cover-design/template-text";

/** text — для подбора кегля по самому длинному слову в ширину области текста (как CoverText в HTML). */
function textStyle(s: CoverTextStyle, frontWmm: number, align: CoverTemplate["align"], text: string, areaW: number) {
  const size = mm(fitWordSize(text, s, s.size, areaW) * frontWmm);
  return {
    ...face(s.font, s.weight ?? 400, s.italic ?? false),
    fontSize: size,
    color: s.color,
    lineHeight: s.lineHeight ?? 1.2,
    letterSpacing: (s.tracking ?? 0) * size,
    textTransform: s.upper ? ("uppercase" as const) : ("none" as const),
    textAlign: align,
  };
}

export function CoverOrnament({ kind, color, size }: { kind: NonNullable<CoverTemplate["ornament"]>["kind"]; color: string; size: number }) {
  if (kind === "line") return <View style={{ width: size * 4, height: 0.6, backgroundColor: color }} />;
  if (kind === "heart")
    return (
      <Svg width={size} height={size} viewBox="0 0 1 1">
        <Path d="M0.5,0.92 C0.2,0.72 0,0.52 0,0.3 C0,0.12 0.14,0 0.3,0 C0.4,0 0.47,0.06 0.5,0.15 C0.53,0.06 0.6,0 0.7,0 C0.86,0 1,0.12 1,0.3 C1,0.52 0.8,0.72 0.5,0.92Z" fill={color} />
      </Svg>
    );
  if (kind === "star")
    return (
      <Svg width={size} height={size} viewBox="0 0 1 1">
        <Path d="M0.5,0 L0.58,0.42 L1,0.5 L0.58,0.58 L0.5,1 L0.42,0.58 L0,0.5 L0.42,0.42Z" fill={color} />
      </Svg>
    );
  return (
    <View style={{ flexDirection: "row" }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ width: size * 0.28, height: size * 0.28, borderRadius: size, backgroundColor: color, marginHorizontal: size * 0.22 }} />
      ))}
    </View>
  );
}

export function CoverDocument({
  template,
  geometry,
  background,
  text,
  back,
  layers,
  title,
  language,
}: {
  template: CoverTemplate;
  geometry: CoverGeometry;
  background: Buffer;
  text: CoverTextContent;
  /** Раскладка задней стороны (src/lib/book/cover-back.ts) и её фото по порядку; оборот из конструктора — его слои. */
  back: {
    design: BackDesign;
    photos: (Buffer | null)[];
    layers?: { layers: CoverDesign["layers"]; images: Map<string, Buffer> };
    /** «Как спереди»: фото, фигуры и украшения лица, повторённые на обороте (под его текстом). */
    art?: { layers: CoverDesign["layers"]; images: Map<string, Buffer> };
  };
  /** Обложка из конструктора: слои вместо текста шаблона на лицевой стороне; снимки слоёв — по id слоя. */
  layers?: { design: CoverDesign; images: Map<string, Buffer> };
  title: string;
  language: Locale;
}) {
  const g = geometry;
  const f = g.front;
  // Область текста — внутри безопасной зоны крышки, кегли — общим множителем, чтобы текст в неё поместился.
  const { area: ta, scale } = templateTextLayout(template, text, f);
  const st = (s: CoverTextStyle): CoverTextStyle => ({ ...s, size: s.size * scale });
  const justify = template.justify === "center" ? "center" : template.justify === "start" ? "flex-start" : "flex-end";
  const align = template.align ?? "center";
  const items = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  const titleStyle = textStyle(st(template.title), f.w, align, text.title, ta.w);
  const ornamentSize = mm(f.w * 0.035);
  const ornament =
    template.ornament && text.names ? (
      <View style={{ marginVertical: mm(f.w * 0.03), alignItems: items }}>
        <CoverOrnament kind={template.ornament.kind} color={template.ornament.color} size={ornamentSize} />
      </View>
    ) : (
      <View style={{ height: mm(f.w * 0.035) }} />
    );
  const namesLine = text.names ? <Text hyphenationCallback={noHyphens} style={{ ...textStyle(st(template.names), f.w, align, text.names, ta.w), alignSelf: "stretch" }}>{text.names}</Text> : null;

  const spine = g.spine;
  const clipX = spine ? Math.max(0, f.x - print.cover.hingeMm) : 0;
  const spineText = spineParts(text.title, text.names);
  const spineFontSize = spine ? spineFontMm(spine.w) : null;
  const spineFont = spineFontSize ? mm(spineFontSize) : 0;

  return (
    <Document title={messagesFor(language).book.coverDoc(title)} creator={site.name} producer={site.name}>
      <Page size={{ width: mm(g.width), height: mm(g.height) }} style={{ position: "relative" }}>
        {/* Высота на 0,01 pt меньше страницы: при точном совпадении react-pdf из-за округления переносит фон на вторую страницу. */}
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image не поддерживает alt */}
        <Image src={{ data: background, format: "jpg" }} style={{ position: "absolute", top: 0, left: 0, width: mm(g.width), height: mm(g.height) - 0.01 }} />

        {/* Лицевая сторона: слои конструктора или текст шаблона */}
        {layers ? (
          // Слои лицевой стороны не заходят на корешок: слева их обрезает канавка шарнира — как край холста редактора.
          <View fixed style={{ position: "absolute", left: mm(clipX), top: 0, width: mm(g.width - clipX), height: mm(g.height) - 0.01, overflow: "hidden" }}>
            <CoverLayersPdf design={layers.design} texts={text} front={{ ...f, x: f.x - clipX }} images={layers.images} />
          </View>
        ) : null}
        {layers ? null : <View
          style={{
            position: "absolute",
            left: mm(f.x + ta.x * f.w),
            top: mm(f.y + ta.y * f.h),
            width: mm(ta.w * f.w),
            height: mm(ta.h * f.h),
            flexDirection: "column",
            justifyContent: justify,
            alignItems: items,
          }}
        >
          {template.namesFirst ? namesLine : null}
          {template.namesFirst ? ornament : null}
          <Text hyphenationCallback={noHyphens} style={{ ...titleStyle, alignSelf: "stretch" }}>{text.title}</Text>
          {text.subtitle ? <Text hyphenationCallback={noHyphens} style={{ ...textStyle(st(template.subtitle), f.w, align, text.subtitle, ta.w), alignSelf: "stretch", marginTop: mm(f.w * 0.015) }}>{text.subtitle}</Text> : null}
          {template.namesFirst ? null : ornament}
          {template.namesFirst ? null : namesLine}
        </View>}

        {/* Корешок: название в верхней половине, имена в нижней, читается сверху вниз */}
        {spine && spineFont && spineText.length ? (
          <View
            style={{
              position: "absolute",
              left: mm(spine.x + spine.w / 2 - spine.h / 2),
              top: mm(spine.y + spine.h / 2 - spine.w / 2),
              width: mm(spine.h),
              height: mm(spine.w),
              flexDirection: "row",
              transform: "rotate(90deg)",
            }}
          >
            {spineText.map((s, i) => (
              <View key={i} style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                <Text hyphenationCallback={noHyphens} style={{ ...face(template.spine.font, 500), fontSize: spineFont, color: template.spine.color, textAlign: "center", width: "92%", maxLines: 1 }}>{s}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Задняя сторона: слои конструктора не заходят на корешок — справа их обрезает канавка шарнира. */}
        {g.back && (back.layers || back.art) ? (
          <View fixed style={{ position: "absolute", left: 0, top: 0, width: mm(g.back.x + g.back.w + print.cover.hingeMm), height: mm(g.height) - 0.01, overflow: "hidden" }}>
            {back.art ? <CoverLayersPdf design={{ layers: back.art.layers }} texts={text} front={g.back} images={back.art.images} /> : null}
            {back.layers ? <CoverLayersPdf design={{ layers: back.layers.layers }} texts={text} front={g.back} images={back.layers.images} /> : null}
          </View>
        ) : null}
        {g.back ? <BackSide rect={g.back} design={back.design} photos={back.photos} /> : null}
      </Page>
    </Document>
  );
}

/** Задняя крышка по раскладке из cover-back: те же блоки рисуют 3D-книга и превью в редакторе. */
function BackSide({ rect, design, photos }: { rect: { x: number; y: number; w: number; h: number }; design: BackDesign; photos: (Buffer | null)[] }) {
  return (
    <>
      {design.blocks.map((b, i) => {
        const box = { position: "absolute" as const, left: mm(rect.x + b.x), top: mm(rect.y + b.y), width: mm(b.w) };
        if (b.kind === "text") {
          const size = mm(b.size);
          return (
            <Text hyphenationCallback={noHyphens}
              key={i}
              style={{
                ...box,
                ...face(b.font, b.weight, b.italic),
                fontSize: size,
                lineHeight: b.lineHeight,
                color: b.color,
                textAlign: b.align,
                letterSpacing: (b.tracking ?? 0) * size,
                textTransform: b.upper ? "uppercase" : "none",
              }}
            >
              {b.text}
            </Text>
          );
        }
        if (b.kind === "ornament")
          return (
            <View key={i} style={{ ...box, height: mm(b.h), alignItems: "center", justifyContent: "center" }}>
              <CoverOrnament kind={b.ornament} color={b.color} size={mm(b.w)} />
            </View>
          );
        // Фото «во всю» и затемнение нарисованы в фоне развёртки (backArtSvg): здесь только карточки и текст.
        if (b.kind === "shade" || b.frame === "bleed") return null;
        const photo = photos[b.slot];
        if (!photo) return null;
        // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image не поддерживает alt
        const img = <Image src={{ data: photo, format: "jpg" }} style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
        const polaroid = b.frame === "polaroid";
        return (
          <View
            key={i}
            style={{
              ...box,
              height: mm(b.h),
              backgroundColor: "#FFFFFF",
              paddingTop: mm(b.mat),
              paddingLeft: mm(b.mat),
              paddingRight: mm(b.mat),
              paddingBottom: mm(polaroid ? (b.matBottom ?? b.mat) : b.mat),
              borderWidth: 0.3,
              borderColor: "#00000022",
              transform: b.rotate ? `rotate(${b.rotate}deg)` : undefined,
            }}
          >
            {img}
          </View>
        );
      })}
      <Text hyphenationCallback={noHyphens}
        style={{
          position: "absolute",
          left: mm(rect.x),
          width: mm(rect.w),
          top: mm(rect.y + design.brand.y),
          textAlign: "center",
          ...face("montserrat", 500),
          fontSize: mm(design.brand.size),
          letterSpacing: 2,
          color: design.brand.color,
          opacity: 0.75,
        }}
      >
        {site.name.toUpperCase()}
      </Text>
    </>
  );
}

/**
 * Оборот листа обложки (вторая страница cover.pdf, печать 4+1): контуры картона задней и лицевой крышки и корешка,
 * линии сгибов и подписи — куда класть картон в переплёте. Лист переворачивают по вертикальной оси, поэтому всё
 * отражено слева направо: лицевая крышка — слева. Сама разметка симметрична (загибы и крышки равны), так что контуры
 * совпадают с лицом листа при любом перевороте; надписи потом закрывает форзац.
 */
export function CoverReverseDocument({ geometry: g, lines, labels }: { geometry: CoverGeometry; lines: string[]; labels: { title: string; front: string; back: string; spine: string } }) {
  const flip = (r: { x: number; y: number; w: number; h: number }) => ({ ...r, x: g.width - r.x - r.w });
  const line = "#000000";
  const box = (r: { x: number; y: number; w: number; h: number }, dashed = false) => (
    <View
      style={{ position: "absolute", left: mm(r.x), top: mm(r.y), width: mm(r.w), height: mm(r.h), borderWidth: mm(0.3), borderColor: line, borderStyle: dashed ? "dashed" : "solid" }}
    />
  );
  const label = (r: { x: number; y: number; w: number; h: number }, title: string) => (
    <View style={{ position: "absolute", left: mm(r.x), top: mm(r.y + r.h / 2 - 6), width: mm(r.w), alignItems: "center" }}>
      <Text hyphenationCallback={noHyphens} style={{ ...face("montserrat", 600), fontSize: mm(4), color: line, letterSpacing: mm(0.6) }}>
        {title}
      </Text>
    </View>
  );
  const front = flip(g.front);
  const back = flip(g.back!);
  const spine = flip(g.spine!);
  // Метки сгибов: короткие риски на загибе сверху и снизу у каждой линии сгиба.
  const folds = (g.folds ?? []).map((x) => g.width - x);
  return (
    <Document title={labels.title} creator={site.name} producer={site.name}>
      <Page size={{ width: mm(g.width), height: mm(g.height) }} style={{ position: "relative", backgroundColor: "#FFFFFF" }}>
        {box(front)}
        {box(back)}
        {box(spine, true)}
        {folds.map((x, i) => (
          <View key={i} style={{ position: "absolute", left: mm(x) - mm(0.15), top: 0, width: mm(0.3), height: mm(g.front.y - 3), backgroundColor: line }} />
        ))}
        {folds.map((x, i) => (
          <View key={`b${i}`} style={{ position: "absolute", left: mm(x) - mm(0.15), top: mm(g.front.y + g.front.h + 3), width: mm(0.3), height: mm(g.height - g.front.y - g.front.h - 3), backgroundColor: line }} />
        ))}
        {label(front, labels.front)}
        {label(back, labels.back)}
        <View style={{ position: "absolute", left: mm(spine.x + spine.w / 2 - 60), top: mm(spine.y + spine.h / 2 - 2), width: mm(120), height: mm(4), alignItems: "center", transform: "rotate(-90deg)" }}>
          <Text hyphenationCallback={noHyphens} style={{ ...face("montserrat", 500), fontSize: mm(2.6), color: line }}>
            {labels.spine}
          </Text>
        </View>
        <View style={{ position: "absolute", left: mm(front.x + 8), top: mm(front.y + front.h - 8 - lines.length * 4.2), width: mm(front.w - 16) }}>
          {lines.map((l, i) => (
            <Text key={i} hyphenationCallback={noHyphens} style={{ ...face("montserrat", 500), fontSize: mm(2.8), color: line, lineHeight: 1.4 }}>
              {l}
            </Text>
          ))}
        </View>
      </Page>
    </Document>
  );
}
