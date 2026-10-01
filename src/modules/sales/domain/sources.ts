import type { DealSource } from "@/modules/sales/domain/meta";

export { dealSourceLabels, dealSources, lostReasons, milestoneOrder, stageMilestones, BOOK_READY_ANSWERS, type DealSource, type StageMilestone } from "@/modules/sales/domain/meta";

/** Канал мессенджера (chatType Wazzup, сайт, почта) → источник сделки. */
export function sourceFromChannel(channel: string): DealSource {
  if (channel.startsWith("whatsapp") || channel === "wapi") return "whatsapp";
  if (channel.startsWith("instagram")) return "instagram";
  if (channel.startsWith("telegram") || channel === "tgapi") return "telegram";
  if (channel === "site") return "site";
  if (channel === "email") return "email";
  return "manual";
}
