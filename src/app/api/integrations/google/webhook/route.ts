import { container } from "@/server/container";

export const dynamic = "force-dynamic";

/**
 * Push-уведомления Google Calendar (канал events.watch): в календаре «MyBooks CRM» что-то поменялось — забрать
 * изменения при ближайшем проходе планировщика. Канал и его токен проверяются; тело пустое по протоколу Google.
 */
export async function POST(req: Request) {
  const channelId = req.headers.get("x-goog-channel-id");
  const token = req.headers.get("x-goog-channel-token");
  const state = req.headers.get("x-goog-resource-state");
  if (!channelId) return new Response(null, { status: 400 });
  // «sync» — подтверждение создания канала, изменений ещё нет.
  if (state !== "sync") await container().boards.google.notified(channelId, token).catch(() => false);
  return new Response(null, { status: 200 });
}
