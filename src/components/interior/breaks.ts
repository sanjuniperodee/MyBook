import type { CSSProperties } from "react";
import type { PageKit } from "./kit";

/** Разрыв перед блоком, если разбивка, как у PDF, начинает с него полосу (kit.breaks: 0). */
export const breakBefore = (kit: PageKit, pid?: string): CSSProperties => (pid && kit.breaks?.get(pid)?.includes(0) ? { breakBefore: "column" } : {});

/** Строки блока, перед которыми разбивка, как у PDF, начинает полосу. */
export const lineBreaks = (kit: PageKit, pid?: string): ReadonlySet<number> => new Set((pid && kit.breaks?.get(pid)?.filter((n) => n > 0)) || []);
