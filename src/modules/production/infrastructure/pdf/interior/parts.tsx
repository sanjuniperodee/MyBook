import "server-only";
import type { ReactNode } from "react";
import { View } from "@react-pdf/renderer";
import type { InteriorPalette } from "@/lib/book/interiors";
import { frameShapes, vignetteDrawing } from "@/lib/book/interior-art";
import { PdfDrawing, PdfPageLayer } from "@/modules/production/infrastructure/pdf/art";
import type { PdfKit } from "./kit";

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
