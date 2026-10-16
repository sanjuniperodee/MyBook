import "server-only";
import type { ReactNode } from "react";
import { Text, View } from "@react-pdf/renderer";
import type { InteriorPalette } from "@/lib/book/interiors";
import { frameShapes, vignetteDrawing } from "@/lib/book/interior-art";
import { face } from "@/modules/production/infrastructure/pdf/fonts";
import { PdfDrawing, PdfPageLayer } from "@/modules/production/infrastructure/pdf/art";
import type { PdfKit } from "./kit";

/** Водяной знак превью — на каждой полосе блока (fixed). */
export function Watermark({ kit }: { kit: PdfKit }) {
  if (!kit.options.watermark) return null;
  const { pageSize, scale, t } = kit;
  return (
    <Text
      fixed
      style={{
        position: "absolute",
        top: pageSize.height / 2 - 30,
        left: -40,
        width: pageSize.width + 80,
        textAlign: "center",
        fontSize: 44 * scale,
        color: "#000000",
        opacity: 0.05,
        transform: "rotate(-35deg)",
        ...face("montserrat", 600),
        letterSpacing: 6,
      }}
    >
      {t.previewMark}
    </Text>
  );
}

/** Рамка дизайна вокруг полосы. */
export function Frame({ kit, colors }: { kit: PdfKit; colors: InteriorPalette }) {
  return <PdfPageLayer shapes={frameShapes(kit.design.frame, kit.box, colors)} box={kit.box} />;
}

/** Блок на парадной полосе: начинается на доле top высоты полосы набора. */
export function Placed({ top, align = "center", children }: { top: number; align?: "center" | "left"; children: ReactNode }) {
  return (
    <View style={{ flexGrow: 1, alignItems: align === "left" ? "flex-start" : "center" }}>
      <View style={{ height: `${top * 100}%` }} />
      {children}
    </View>
  );
}

/** Виньетка дизайна: линейки длиной rule pt с орнаментом между ними. */
export function Vignette({ kit, rule, colors, align = "center" }: { kit: PdfKit; rule: number; colors: InteriorPalette; align?: "center" | "left" }) {
  return <PdfDrawing drawing={vignetteDrawing(kit.design.ornament, rule, colors)} style={{ marginVertical: kit.sizes.vignetteGap, alignSelf: align === "left" ? "flex-start" : "center" }} />;
}
