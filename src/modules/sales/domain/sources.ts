import type { DealSource } from "@/shared/domain/dealSources";


/** Канал мессенджера (chatType Wazzup, сайт, почта) → источник сделки. */
export function sourceFromChannel(channel: string): DealSource {
  if (channel.startsWith("whatsapp") || channel === "wapi") return "whatsapp";
  if (channel.startsWith("instagram")) return "instagram";
  if (channel.startsWith("telegram") || channel === "tgapi") return "telegram";
  if (channel === "site") return "site";
  if (channel === "email") return "email";
  return "manual";
}
