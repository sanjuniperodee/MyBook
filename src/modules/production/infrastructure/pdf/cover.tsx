import "server-only";
import { Document, Image, Page, Path, Svg, Text, View } from "@react-pdf/renderer";
import type { CoverGeometry } from "@/lib/book/formats";
import { mm } from "@/lib/book/formats";
import type { CoverTemplate, CoverTextContent, CoverTextStyle } from "@/lib/book/covers";
import type { BackDesign } from "@/lib/book/cover-back";
import { face } from "@/modules/production/infrastructure/pdf/fonts";
import { site } from "@/config/site";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";

function textStyle(s: CoverTextStyle, frontWmm: number) {
  const size = mm(s.size * frontWmm);
  return {
    ...face(s.font, s.weight ?? 400, s.italic ?? false),
    fontSize: size,
    color: s.color,
    lineHeight: s.lineHeight ?? 1.2,
    letterSpacing: (s.tracking ?? 0) * size,
    textTransform: s.upper ? ("uppercase" as const) : ("none" as const),
    textAlign: "center" as const,
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
  title,
  language,
}: {
  template: CoverTemplate;
  geometry: CoverGeometry;
  background: Buffer;
  text: CoverTextContent;
  /** Раскладка задней стороны (src/lib/book/cover-back.ts) и фото для варианта «Фото». */
  back: { design: BackDesign; photo: Buffer | null };
  title: string;
  language: Locale;
}) {
  const g = geometry;
  const f = g.front;
  const ta = template.textArea;
  const justify = template.justify === "center" ? "center" : template.justify === "start" ? "flex-start" : "flex-end";
  const titleStyle = textStyle(template.title, f.w);
  const ornamentSize = mm(f.w * 0.035);

  const spine = g.spine;
  const spineText = [text.title, text.names].filter(Boolean).join("   ·   ");
  const spineFont = spine ? Math.min(mm(spine.w * 0.42), 11) : 0;

  return (
    <Document title={messagesFor(language).book.coverDoc(title)} creator={site.name} producer={site.name}>
      <Page size={{ width: mm(g.width), height: mm(g.height) }} style={{ position: "relative" }}>
        {/* Высота на 0,01 pt меньше страницы: при точном совпадении react-pdf из-за округления переносит фон на вторую страницу. */}
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image не поддерживает alt */}
        <Image src={{ data: background, format: "jpg" }} style={{ position: "absolute", top: 0, left: 0, width: mm(g.width), height: mm(g.height) - 0.01 }} />

        {/* Лицевая сторона */}
        <View
          style={{
            position: "absolute",
            left: mm(f.x + ta.x * f.w),
            top: mm(f.y + ta.y * f.h),
            width: mm(ta.w * f.w),
            height: mm(ta.h * f.h),
            flexDirection: "column",
            justifyContent: justify,
            alignItems: "center",
          }}
        >
          <Text style={titleStyle}>{text.title}</Text>
          {text.subtitle ? <Text style={{ ...textStyle(template.subtitle, f.w), marginTop: mm(f.w * 0.015) }}>{text.subtitle}</Text> : null}
          {template.ornament && text.names ? (
            <View style={{ marginVertical: mm(f.w * 0.03), alignItems: "center" }}>
              <CoverOrnament kind={template.ornament.kind} color={template.ornament.color} size={ornamentSize} />
            </View>
          ) : (
            <View style={{ height: mm(f.w * 0.035) }} />
          )}
          {text.names ? <Text style={textStyle(template.names, f.w)}>{text.names}</Text> : null}
        </View>

        {/* Корешок */}
        {spine && spine.w >= 5 && spineText ? (
          <View
            style={{
              position: "absolute",
              left: mm(spine.x + spine.w / 2 - spine.h / 2),
              top: mm(spine.y + spine.h / 2 - spine.w / 2),
              width: mm(spine.h),
              height: mm(spine.w),
              justifyContent: "center",
              alignItems: "center",
              transform: "rotate(-90deg)",
            }}
          >
            <Text style={{ ...face(template.spine.font, 500), fontSize: spineFont, color: template.spine.color, textAlign: "center", maxLines: 1 }}>
              {spineText}
            </Text>
          </View>
        ) : null}

        {/* Задняя сторона */}
        {g.back ? <BackSide rect={g.back} design={back.design} photo={back.photo} /> : null}
      </Page>
    </Document>
  );
}

/** Задняя крышка по раскладке из cover-back: те же блоки рисуют 3D-книга и превью в редакторе. */
function BackSide({ rect, design, photo }: { rect: { x: number; y: number; w: number; h: number }; design: BackDesign; photo: Buffer | null }) {
  return (
    <>
      {design.blocks.map((b, i) => {
        const box = { position: "absolute" as const, left: mm(rect.x + b.x), top: mm(rect.y + b.y), width: mm(b.w) };
        if (b.kind === "text") {
          const size = mm(b.size);
          return (
            <Text
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
        if (!photo) return null;
        return (
          <View key={i} style={{ ...box, height: mm(b.h), backgroundColor: "#FFFFFF", padding: mm(b.mat), borderWidth: 0.3, borderColor: "#00000022" }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image не поддерживает alt */}
            <Image src={{ data: photo, format: "jpg" }} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </View>
        );
      })}
      <Text
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
