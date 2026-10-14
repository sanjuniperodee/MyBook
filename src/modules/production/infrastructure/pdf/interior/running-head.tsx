import "server-only";
import { Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import { mm } from "@/lib/book/formats";
import { RUNNING_HEAD, runningHeadTop, runningRuleTop } from "@/lib/book/typesetting";
import { labelStyle, type PdfKit } from "./kit";

/** Колонтитул: на чётных полосах — название книги, на нечётных — глава; под ним линейка, если она есть в дизайне. */
export function RunningHead({ kit, chapterTitle }: { kit: PdfKit; chapterTitle: string }) {
  const { content, design, sizes: S, bleed: B, side, format } = kit;
  if (design.runningHead === "none") return null;
  const outer = design.folio.align === "outer";
  const style: Style = { ...labelStyle(kit, design.palette.muted, S.runningHead), position: "absolute", top: mm(B + runningHeadTop(format)), left: mm(B + side), right: mm(B + side), maxLines: 1, textOverflow: "ellipsis" };
  const verso = { ...style, textAlign: outer ? "left" : "center" } as Style;
  const recto = { ...style, textAlign: outer ? "right" : "center" } as Style;
  return (
    <>
      <Text fixed style={verso} render={({ pageNumber }) => (pageNumber % 2 === 0 ? content.title : "")} />
      <Text fixed style={recto} render={({ pageNumber }) => (pageNumber % 2 === 1 ? chapterTitle : "")} />
      {design.runningHead === "ruled" ? (
        <View fixed style={{ position: "absolute", top: mm(B + runningRuleTop(format)), left: mm(B + side), right: mm(B + side), height: RUNNING_HEAD.rule, backgroundColor: design.palette.rule }} />
      ) : null}
    </>
  );
}
