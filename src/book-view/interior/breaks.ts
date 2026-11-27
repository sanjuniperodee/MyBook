import type { CSSProperties } from "react";
import type { PageKit } from "./kit";

/**
 * Разрыв перед блоком, если разбивка, как у PDF, начинает с него полосу (kit.breaks: 0). У заголовка истории — и
 * отбивка сверху (поле внутри, gapAbove) та, с которой он стоит на полосе у PDF (kit.breakTops).
 */
export const breakBefore = (kit: PageKit, pid?: string): CSSProperties => {
  if (!pid || !kit.breaks?.get(pid)?.includes(0)) return {};
  const top = kit.breakTops?.get(pid);
  return top === undefined ? { breakBefore: "column" } : { breakBefore: "column", paddingTop: kit.u.pt(top) };
};

/** Строки блока, перед которыми разбивка, как у PDF, начинает полосу. */
export const lineBreaks = (kit: PageKit, pid?: string): ReadonlySet<number> => new Set((pid && kit.breaks?.get(pid)?.filter((n) => n > 0)) || []);
