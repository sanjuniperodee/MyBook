/** Номер главы на начальной полосе: подпись или крупная цифра (арабская, с нулём, римская). */
import type { InteriorDesign } from "./types";

export function romanNumeral(n: number): string {
  const table: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  let rest = Math.max(1, Math.floor(n));
  for (const [v, s] of table)
    while (rest >= v) {
      out += s;
      rest -= v;
    }
  return out;
}

/** Номер главы для начальной полосы: подпись («Глава 1») или крупная цифра; null — дизайн без номера. */
export function chapterMark(design: InteriorDesign, n: number, label: (n: number) => string): { kind: "label" | "numeral"; text: string } | null {
  switch (design.opener.number) {
    case "none":
      return null;
    case "digits":
      return { kind: "numeral", text: String(n) };
    case "padded":
      return { kind: "numeral", text: String(n).padStart(2, "0") };
    case "roman":
      return { kind: "numeral", text: romanNumeral(n) };
    default:
      return { kind: "label", text: label(n) };
  }
}
