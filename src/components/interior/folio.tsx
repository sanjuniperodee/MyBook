import type { ReactNode } from "react";
import { cssFont } from "@/lib/book/fonts";
import type { InteriorDesign } from "@/lib/book/interiors";
import { pageSide } from "@/lib/book/page-geometry";
import { FOLIO, folioBottom, HTML_LINE_HEIGHT, RUNNING_HEAD, runningHeadTop, runningRuleTop } from "@/lib/book/typesetting";
import type { PageKit } from "./kit";
import { labelCss } from "./typography";

/** Колонцифра. recto — правая (нечётная) полоса: «снаружи» значит справа. */
export function Folio({ kit, children, recto }: { kit: PageKit; children: ReactNode; recto: boolean }) {
  const { design, sizes: S, u } = kit;
  const outer = design.folio.align === "outer";
  const font =
    design.folio.font === "label"
      ? labelCss(kit, design.palette.muted, S.folio * FOLIO.labelSize)
      : { fontFamily: cssFont(design.type.body), fontSize: u.pt(S.folio), color: design.palette.muted, lineHeight: HTML_LINE_HEIGHT.folio };
  return (
    <div
      className="absolute"
      style={{ ...font, bottom: u.mm(folioBottom(kit.format)), left: outer ? u.mm(pageSide(kit.format)) : 0, right: outer ? u.mm(pageSide(kit.format)) : 0, textAlign: outer ? (recto ? "right" : "left") : "center" }}
    >
      {children}
    </div>
  );
}

export const folioText = (design: InteriorDesign, n: number | string) => (design.folio.dashes ? `— ${n} —` : `${n}`);

/** Колонтитул: на левой полосе — название книги, на правой — глава. */
export function RunningHead({ kit, bookTitle, chapterTitle, recto }: { kit: PageKit; bookTitle: string; chapterTitle: string; recto: boolean }) {
  const { design, sizes: S, u } = kit;
  if (design.runningHead === "none") return null;
  const outer = design.folio.align === "outer";
  return (
    <>
      <div
        className="absolute truncate"
        style={{ ...labelCss(kit, design.palette.muted, S.runningHead), top: u.mm(runningHeadTop(kit.format)), left: u.mm(pageSide(kit.format)), right: u.mm(pageSide(kit.format)), textAlign: outer ? (recto ? "right" : "left") : "center" }}
      >
        {recto ? chapterTitle : bookTitle}
      </div>
      {design.runningHead === "ruled" ? (
        <div className="absolute" style={{ top: u.mm(runningRuleTop(kit.format)), left: u.mm(pageSide(kit.format)), right: u.mm(pageSide(kit.format)), height: u.pt(RUNNING_HEAD.rule), background: design.palette.rule }} />
      ) : null}
    </>
  );
}
