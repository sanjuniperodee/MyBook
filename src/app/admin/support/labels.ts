import type { BadgeTone } from "@/components/ui/Badge";
import type { SupportStatus } from "@/shared/domain/support";

export const STATUS_TONE: Record<SupportStatus, BadgeTone> = {
  new: "accent",
  in_progress: "info",
  waiting: "warning",
  done: "success",
  rejected: "neutral",
};

/** «+7 705 147 90 03» из «77051479003». */
export function phoneLabel(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length !== 11) return d ? `+${d}` : "";
  return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}`;
}

/** Метка на месте «что сделали» в шаблоне уведомления: шаблон строит сервер, текст подставляет форма. */
export const RESOLUTION_SLOT = "@@resolution@@";
