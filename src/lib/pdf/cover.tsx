import "server-only";
import { Document, Image, Page, Path, Svg, Text, View } from "@react-pdf/renderer";
import type { CoverGeometry } from "../book/formats";
import { mm } from "../book/formats";
import type { CoverTemplate, CoverTextContent, CoverTextStyle } from "../book/covers";
import { face } from "./fonts";
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
  backText,
  title,
  language,
}: {
  template: CoverTemplate;
  geometry: CoverGeometry;
  background: Buffer;
  text: CoverTextContent;
  backText: string;
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
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image не поддерживает alt */}
        <Image src={{ data: background, format: "jpg" }} style={{ position: "absolute", top: 0, left: 0, width: mm(g.width), height: mm(g.height) }} />

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
        {g.back ? (
          <>
            {backText ? (
              <View
                style={{
                  position: "absolute",
                  left: mm(g.back.x + g.back.w * 0.15),
                  top: mm(g.back.y + g.back.h * 0.3),
                  width: mm(g.back.w * 0.7),
                  alignItems: "center",
                }}
              >
                <Text style={{ ...face(template.back.font, 400, true), fontSize: 12, lineHeight: 1.5, color: template.back.color, textAlign: "center" }}>
                  {backText}
                </Text>
              </View>
            ) : null}
            <Text
              style={{
                position: "absolute",
                left: mm(g.back.x),
                width: mm(g.back.w),
                top: mm(g.back.y + g.back.h - 16),
                textAlign: "center",
                ...face("montserrat", 500),
                fontSize: 6.5,
                letterSpacing: 2,
                color: template.back.color,
                opacity: 0.75,
              }}
            >
              {site.name.toUpperCase()}
            </Text>
          </>
        ) : null}
      </Page>
    </Document>
  );
}
