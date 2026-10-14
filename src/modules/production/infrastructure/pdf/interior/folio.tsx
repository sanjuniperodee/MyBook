import "server-only";
import { Text } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import { mm } from "@/lib/book/formats";
import { FOLIO, folioBottom } from "@/lib/book/typesetting";
import { face } from "@/modules/production/infrastructure/pdf/fonts";
import { labelStyle, type PdfKit } from "./kit";

/** Колонцифра на каждой полосе текста; «снаружи» — у внешнего края (чётные полосы — слева, нечётные — справа). */
export function Folio({ kit }: { kit: PdfKit }) {
  const { design, sizes: S, bleed: B, side, format } = kit;
  const outer = design.folio.align === "outer";
  const style: Style = {
    ...(design.folio.font === "label" ? labelStyle(kit, design.palette.muted, S.folio * FOLIO.labelSize) : { ...face(design.type.body, 400), fontSize: S.folio, color: design.palette.muted }),
    position: "absolute",
    bottom: mm(B + folioBottom(format)),
    left: outer ? mm(B + side) : 0,
    right: outer ? mm(B + side) : 0,
    textAlign: "center",
  };
  const text = (n: number) => (design.folio.dashes ? `— ${n} —` : `${n}`);
  return outer ? (
    <>
      <Text fixed style={{ ...style, textAlign: "left" }} render={({ pageNumber }) => (pageNumber % 2 === 0 ? text(pageNumber) : "")} />
      <Text fixed style={{ ...style, textAlign: "right" }} render={({ pageNumber }) => (pageNumber % 2 === 1 ? text(pageNumber) : "")} />
    </>
  ) : (
    <Text fixed style={style} render={({ pageNumber }) => text(pageNumber)} />
  );
}
