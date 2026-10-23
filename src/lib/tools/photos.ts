/**
 * Проверка фото для печати: хватает ли пикселей снимку на странице книги. Размеры мест и расчёт разрешения — те же, что в
 * редакторе и проверке готовности книги (layout.ts: photoAreaMm, effectiveDpi), пороги — те же (150 dpi — ниже печать
 * заметно мягче; 300 dpi — типографская норма из print.dpi).
 */
import { formats, print, type FormatId } from "@/lib/book/formats";
import { effectiveDpi, photoAreaMm } from "@/lib/book/layout";

export type PhotoUseId = "bleed" | "full" | "half" | "grid" | "cover";
export type Verdict = "great" | "ok" | "low";

/** С этого разрешения снимок печатается чётко; ниже — печать мягче, ниже LOW_DPI — заметно нечёткая. */
export const GREAT_DPI = 250;
export const LOW_DPI = 150;

export const photoUseIds: PhotoUseId[] = ["bleed", "full", "half", "grid", "cover"];

export function dpiVerdict(dpi: number): Verdict {
  return dpi >= GREAT_DPI ? "great" : dpi >= LOW_DPI ? "ok" : "low";
}

export interface UseResult {
  id: PhotoUseId;
  dpi: number;
  verdict: Verdict;
}

export interface PhotoAnalysis {
  uses: UseResult[];
  /** Худшее место из выбранных: по нему человек решает, годится ли снимок. */
  worst: Verdict;
  /** Наибольший размер печати по длинной стороне, см, при 300 dpi и при 150 dpi. */
  maxCm: { sharp: number; soft: number };
}

/** Место снимка → его площадь на листе и способ заполнения: на всю страницу и обложка заполняют кадр, остальные вписываются. */
function area(format: FormatId, use: PhotoUseId) {
  const f = formats[format];
  if (use === "cover") return { box: { w: f.widthMm, h: f.heightMm }, fit: "cover" as const };
  if (use === "bleed") return { box: photoAreaMm(f, "bleed"), fit: "cover" as const };
  return { box: photoAreaMm(f, use), fit: "contain" as const };
}

export function analyzePhoto(px: { width: number; height: number }, format: FormatId): PhotoAnalysis {
  const uses = photoUseIds.map((id) => {
    const a = area(format, id);
    const dpi = effectiveDpi(px, a.box, a.fit);
    return { id, dpi, verdict: dpiVerdict(dpi) };
  });
  const rank: Record<Verdict, number> = { great: 2, ok: 1, low: 0 };
  const worst = uses.reduce<Verdict>((w, u) => (rank[u.verdict] < rank[w] ? u.verdict : w), "great");
  const long = Math.max(px.width, px.height);
  return { uses, worst, maxCm: { sharp: Math.round(((long / print.dpi) * 2.54) * 10) / 10, soft: Math.round(((long / LOW_DPI) * 2.54) * 10) / 10 } };
}

/** Снимки из мессенджеров ужимаются до ~1600 px по длинной стороне; по имени файла и размеру видно, что это пересланная копия. */
export function looksMessengerCompressed(name: string, px: { width: number; height: number }): boolean {
  const long = Math.max(px.width, px.height);
  return long <= 1700 && (/(^|[^a-z])(wa\d*|whatsapp|telegram|viber)/i.test(name) || /^IMG-\d{8}-WA\d+/i.test(name) || /^photo_\d+@/i.test(name) || /^photo_\d+_/i.test(name));
}
